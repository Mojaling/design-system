import { getChain, getProtocol, positionKey } from "../../config/chains.js"
import {
  getAmountsForLiquidity,
  getSqrtRatioAtTick,
  priceFromSqrt,
  priceFromTick,
  toDecimal,
} from "../../core/math.js"
import { chooseQuote, classifyToken, knownUsd, rememberUsd } from "../pricing.js"

const DAY_MS = 86_400_000
const MIN_HELD_DAYS = 1 / 24 // 1시간 미만이면 APR이 폭발하므로 1시간으로 본다.

/**
 * 리더가 읽은 온체인 값(raw)을 화면에 보여줄 형태(view)로 조립한다.
 *
 * raw: { tokenId, owner, token0, token1 (메타), fee, tickLower, tickUpper,
 *        tick, sqrtPriceX96, liquidity, fees0, fees1, mintedAt }
 */
export function buildView(chainKey, protocolId, raw) {
  const chain = getChain(chainKey)
  const protocol = getProtocol(chainKey, protocolId)
  const tokens = [raw.token0, raw.token1]
  const quoteIndex = chooseQuote(chain, raw.token0, raw.token1)
  const baseIndex = 1 - quoteIndex
  const base = tokens[baseIndex]
  const quote = tokens[quoteIndex]

  // 수량
  const { amount0, amount1 } = getAmountsForLiquidity(
    raw.sqrtPriceX96,
    getSqrtRatioAtTick(raw.tickLower),
    getSqrtRatioAtTick(raw.tickUpper),
    raw.liquidity
  )
  const amounts = [
    toDecimal(amount0, raw.token0.decimals),
    toDecimal(amount1, raw.token1.decimals),
  ]
  const fees = [
    toDecimal(raw.fees0, raw.token0.decimals),
    toDecimal(raw.fees1, raw.token1.decimals),
  ]

  // 가격: 항상 "X quote = 1 base"
  const d0 = raw.token0.decimals
  const d1 = raw.token1.decimals
  const invert = baseIndex === 1 // base가 token1이면 뒤집는다.
  const orient = (p) => (invert ? 1 / p : p)
  const current = orient(priceFromSqrt(raw.sqrtPriceX96, d0, d1))
  const edgeA = orient(priceFromTick(raw.tickLower, d0, d1))
  const edgeB = orient(priceFromTick(raw.tickUpper, d0, d1))
  const lower = Math.min(edgeA, edgeB)
  const upper = Math.max(edgeA, edgeB)
  const inRange = raw.tick >= raw.tickLower && raw.tick < raw.tickUpper
  const clamped = Math.min(upper, Math.max(lower, current))

  // 범위 바 위치 (tick 공간 기준, base 방향에 맞춤)
  const span = raw.tickUpper - raw.tickLower
  let position = span > 0 ? ((raw.tick - raw.tickLower) / span) * 100 : 50
  if (invert) position = 100 - position
  position = Math.min(100, Math.max(0, position))

  // USD (pool-anchored)
  let quoteUsd = knownUsd(chain, quote)
  let baseUsd = knownUsd(chain, base)
  if (quoteUsd != null && Number.isFinite(current)) baseUsd = current * quoteUsd
  else if (baseUsd != null && current > 0) quoteUsd = baseUsd / current
  if (baseUsd != null) rememberUsd(chainKey, base.address, baseUsd)
  if (quoteUsd != null) rememberUsd(chainKey, quote.address, quoteUsd)

  const usd = (amount, price) => (price == null ? null : amount * price)
  const baseValueUsd = usd(amounts[baseIndex], baseUsd)
  const quoteValueUsd = usd(amounts[quoteIndex], quoteUsd)
  const baseFeesUsd = usd(fees[baseIndex], baseUsd)
  const quoteFeesUsd = usd(fees[quoteIndex], quoteUsd)
  const sum = (a, b) => (a == null || b == null ? null : a + b)
  const valueUsd = sum(baseValueUsd, quoteValueUsd)
  const feesUsd = sum(baseFeesUsd, quoteFeesUsd)

  // 구성비(base 쪽 비율, 0~1): USD를 모르면 quote 기준 가치로 비교한다. 둘 다 0이면 null.
  const inQuote = (amount) => (Number.isFinite(current) ? amount * current : 0)
  const share = (a, b) => (a + b > 0 ? a / (a + b) : null)
  const valueShare = share(
    baseValueUsd ?? inQuote(amounts[baseIndex]),
    quoteValueUsd ?? amounts[quoteIndex]
  )
  const feeShare = share(
    baseFeesUsd ?? inQuote(fees[baseIndex]),
    quoteFeesUsd ?? fees[quoteIndex]
  )

  // 실현 APR = (미수령 수수료 USD / 현재 가치) × (365 / 보유일수)
  const heldDays = raw.mintedAt
    ? Math.max(MIN_HELD_DAYS, (Date.now() - raw.mintedAt) / DAY_MS)
    : null
  const apr =
    heldDays != null && feesUsd != null && valueUsd
      ? (feesUsd / valueUsd) * (365 / heldDays)
      : null

  const baseKind = classifyToken(chain, base)

  return {
    key: positionKey(chainKey, protocolId, raw.tokenId),
    chainKey,
    chainName: chain.name,
    protocolId,
    protocolName: protocol.name,
    tokenId: String(raw.tokenId),
    owner: raw.owner,
    positionUrl: protocol.posUrl(raw.tokenId),
    feeTier: Number(raw.fee) / 10_000, // % (예: 0.05)
    base: { address: base.address, symbol: base.symbol },
    quote: { address: quote.address, symbol: quote.symbol },
    inRange,
    liquidity: raw.liquidity.toString(),
    price: { current, clamped, lower, upper, position },
    amounts: { base: amounts[baseIndex], quote: amounts[quoteIndex] },
    fees: { base: fees[baseIndex], quote: fees[quoteIndex] },
    usd: {
      value: valueUsd,
      base: baseValueUsd,
      quote: quoteValueUsd,
      fees: feesUsd,
      baseFees: baseFeesUsd,
      quoteFees: quoteFeesUsd,
    },
    share: { value: valueShare, fees: feeShare },
    apr,
    heldDays,
    // 비-quote(롱테일) 토큰의 컨트랙트 주소. 스테이블·네이티브면 복사할 게 없다.
    copyAddress: baseKind === "other" ? base.address : null,
  }
}
