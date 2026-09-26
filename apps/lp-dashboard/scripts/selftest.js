// 오프라인 계산 검증 (RPC·API 키 필요 없음): npm test
// 기준값은 Uniswap 공식 상수와 공식 SDK(@uniswap/v3-sdk, v4-sdk)로 뽑은 값이다.
import assert from "node:assert/strict"
import test from "node:test"

import { getChain, NATIVE } from "../server/config/chains.js"
import { decodePositionInfo, encodePositionInfo } from "../server/core/decode.js"
import {
  feesFromGrowth,
  getAmountsForLiquidity,
  getSqrtRatioAtTick,
  MAX_SQRT_RATIO,
  MAX_TICK,
  MIN_SQRT_RATIO,
  MIN_TICK,
  priceFromSqrt,
  priceFromTick,
  Q128,
  Q256,
  Q96,
  toDecimal,
  v3FeeGrowthInside,
} from "../server/core/math.js"
import { computePoolId, tokenIdSalt } from "../server/core/poolId.js"
import { chooseQuote, classifyToken, setAnchorUsd } from "../server/services/pricing.js"
import { buildView } from "../server/services/readers/common.js"

test("TickMath: 공식 상수와 일치", () => {
  assert.equal(getSqrtRatioAtTick(MIN_TICK), MIN_SQRT_RATIO)
  assert.equal(getSqrtRatioAtTick(MAX_TICK), MAX_SQRT_RATIO)
  assert.equal(getSqrtRatioAtTick(0), Q96)
  assert.equal(getSqrtRatioAtTick(1), 79232123823359799118286999568n)
  assert.equal(getSqrtRatioAtTick(-1), 79224201403219477170569942574n)
  assert.throws(() => getSqrtRatioAtTick(MAX_TICK + 1))
})

test("TickMath: tick이 커지면 가격도 커진다", () => {
  let previous = 0n
  for (let tick = MIN_TICK; tick <= MAX_TICK; tick += 7919) {
    const value = getSqrtRatioAtTick(tick)
    assert.ok(value > previous, `tick ${tick}`)
    previous = value
  }
})

test("LiquidityAmounts: 범위 아래/안/위 (SDK 기준값)", () => {
  const cases = [
    [-195000, -196000, -194000, 3221617313387787n, 2693829778935245698n, 9163284302n],
    [-197000, -196000, -194000, 3221617313387787n, 5525768084704225176n, 0n],
    [-193000, -196000, -194000, 3221617313387787n, 0n, 18796356155n],
    [8540, 7400, 9700, 21103157663170688719474n, 775865081794958665211n, 1791913613487316860887n],
  ]
  for (const [tick, lower, upper, liquidity, amount0, amount1] of cases) {
    const result = getAmountsForLiquidity(
      getSqrtRatioAtTick(tick),
      getSqrtRatioAtTick(lower),
      getSqrtRatioAtTick(upper),
      liquidity
    )
    assert.deepEqual(result, { amount0, amount1 }, `tick ${tick}`)
  }
})

test("수수료: feeGrowth가 2^256을 넘어 감겨도 맞게 계산", () => {
  const liquidity = 10n ** 18n
  assert.equal(feesFromGrowth(3n * Q128, Q128, liquidity), 2n * liquidity)
  // now < last (오버플로로 감긴 경우)
  assert.equal(feesFromGrowth(Q128, Q256 - Q128, liquidity), 2n * liquidity)
})

test("v3 feeGrowthInside: 아래/안/위 (SDK 기준값)", () => {
  const base = { tickLower: 0, tickUpper: 20, feeGrowthGlobal: 5000n, lowerOutside: 1200n, upperOutside: 300n }
  assert.equal(v3FeeGrowthInside({ ...base, tickCurrent: -10 }), 900n)
  assert.equal(v3FeeGrowthInside({ ...base, tickCurrent: 5 }), 3500n)
  assert.equal(v3FeeGrowthInside({ ...base, tickCurrent: 30 }), Q256 - 900n)
})

test("v4 poolId: SDK와 일치 (ETH/USDC 0.05%)", () => {
  const id = computePoolId({
    currency0: NATIVE,
    currency1: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    fee: 500,
    tickSpacing: 10,
    hooks: NATIVE,
  })
  assert.equal(id, "0x21c67e77068de97969ba93d4aab21826d33ca12bb9f565d8496e8fda8a82ca27")
  assert.equal(tokenIdSalt(255), `0x${"0".repeat(62)}ff`)
})

test("v4 PositionInfo 디코딩 (음수 tick 포함)", () => {
  for (const [tickLower, tickUpper] of [[-887220, 887220], [-60, 60], [100, 200], [-200, -100]]) {
    const packed = encodePositionInfo({ tickLower, tickUpper }) | (0xabcdefn << 56n)
    assert.deepEqual(decodePositionInfo(packed), { hasSubscriber: false, tickLower, tickUpper })
  }
})

test("가격·소수 변환", () => {
  // ETH(18)/USDC(6), tick -195000 근처 ≈ 3,400 USDC
  const price = priceFromSqrt(getSqrtRatioAtTick(-195000), 18, 6)
  assert.ok(Math.abs(price / priceFromTick(-195000, 18, 6) - 1) < 1e-9)
  assert.ok(price > 3000 && price < 4000)
  assert.equal(toDecimal(1_500_000n, 6), 1.5)
  assert.equal(toDecimal(0n, 18), 0)
})

test("quote 판별: 스테이블 > 네이티브 > token1", () => {
  const base = getChain("base")
  const eth = { address: NATIVE, symbol: "ETH" }
  const usdc = { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC" }
  const meme = { address: "0x1111111111111111111111111111111111111111", symbol: "MEME" }
  const fakeUsdt = { address: "0x2222222222222222222222222222222222222222", symbol: "usdt" }
  assert.equal(classifyToken(base, usdc), "stable")
  assert.equal(classifyToken(base, fakeUsdt), "stable") // 심볼 폴백
  assert.equal(classifyToken(base, eth), "native")
  assert.equal(classifyToken(base, meme), "other")
  assert.equal(chooseQuote(base, eth, usdc), 1)
  assert.equal(chooseQuote(base, usdc, meme), 0)
  assert.equal(chooseQuote(base, eth, meme), 0)
  assert.equal(chooseQuote(base, meme, { ...meme, symbol: "X" }), 1)
})

test("buildView: 가격 방향·USD·범위 밖 clamp", () => {
  setAnchorUsd("ethereum", 3000)
  const usdc = { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", decimals: 6 }
  const meme = { address: "0x1111111111111111111111111111111111111111", symbol: "MEME", decimals: 18 }
  const common = { tokenId: "1", owner: NATIVE, fee: 3000, liquidity: 10n ** 18n, fees0: 0n, fees1: 0n, mintedAt: null }

  // token0 = USDC(quote), token1 = MEME(base) → 가격을 뒤집어서 "USDC = 1 MEME"
  const tick = -290000
  const view = buildView("base", "uniswap-v4", {
    ...common,
    token0: usdc,
    token1: meme,
    tick,
    tickLower: tick - 6000,
    tickUpper: tick + 6000,
    sqrtPriceX96: getSqrtRatioAtTick(tick),
  })
  const expected = 1 / priceFromTick(tick, 6, 18)
  assert.equal(view.base.symbol, "MEME")
  assert.equal(view.quote.symbol, "USDC")
  assert.ok(Math.abs(view.price.current / expected - 1) < 1e-6)
  assert.ok(view.price.lower < view.price.current && view.price.current < view.price.upper)
  assert.ok(Math.abs(view.price.position - 50) < 1e-9)
  assert.equal(view.inRange, true)
  assert.equal(view.copyAddress, meme.address) // 롱테일 토큰만 복사
  assert.ok(Math.abs(view.usd.value - (view.usd.base + view.usd.quote)) < 1e-9)
  assert.equal(view.usd.quote, view.amounts.quote) // 스테이블 = $1

  // 범위 밖: 현재가는 그대로, 표시용 clamped는 경계로
  const out = buildView("base", "uniswap-v4", {
    ...common,
    token0: usdc,
    token1: meme,
    tick: tick + 9000,
    tickLower: tick - 6000,
    tickUpper: tick + 6000,
    sqrtPriceX96: getSqrtRatioAtTick(tick + 9000),
  })
  assert.equal(out.inRange, false)
  assert.equal(out.price.clamped, out.price.lower)
  assert.equal(out.price.position, 0)
  assert.equal(out.amounts.quote, 0) // tick이 위로 벗어나면 전부 token1(MEME)
})
