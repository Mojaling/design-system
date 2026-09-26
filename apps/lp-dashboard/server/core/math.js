// Uniswap v3/v4 수학. 컨트랙트와 똑같은 정수 연산(BigInt)으로 계산한다.
// selftest.js가 공식 상수와 일치하는지 검증한다.

export const Q96 = 1n << 96n
export const Q128 = 1n << 128n
export const Q256 = 1n << 256n
const MAX_UINT256 = Q256 - 1n

export const MIN_TICK = -887272
export const MAX_TICK = 887272
export const MIN_SQRT_RATIO = 4295128739n
export const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n

const TICK_FACTORS = [
  [0x2n, 0xfff97272373d413259a46990580e213an],
  [0x4n, 0xfff2e50f5f656932ef12357cf3c7fdccn],
  [0x8n, 0xffe5caca7e10e4e61c3624eaa0941cd0n],
  [0x10n, 0xffcb9843d60f6159c9db58835c926644n],
  [0x20n, 0xff973b41fa98c081472e6896dfb254c0n],
  [0x40n, 0xff2ea16466c96a3843ec78b326b52861n],
  [0x80n, 0xfe5dee046a99a2a811c461f1969c3053n],
  [0x100n, 0xfcbe86c7900a88aedcffc83b479aa3a4n],
  [0x200n, 0xf987a7253ac413176f2b074cf7815e54n],
  [0x400n, 0xf3392b0822b70005940c7a398e4b70f3n],
  [0x800n, 0xe7159475a2c29b7443b29c7fa6e889d9n],
  [0x1000n, 0xd097f3bdfd2022b8845ad8f792aa5825n],
  [0x2000n, 0xa9f746462d870fdf8a65dc1f90e061e5n],
  [0x4000n, 0x70d869a156d2a1b890bb3df62baf32f7n],
  [0x8000n, 0x31be135f97d08fd981231505542fcfa6n],
  [0x10000n, 0x9aa508b5b7a84e1c677de54f3e99bc9n],
  [0x20000n, 0x5d6af8dedb81196699c329225ee604n],
  [0x40000n, 0x2216e584f5fa1ea926041bedfe98n],
  [0x80000n, 0x48a170391f7dc42444e8fa2n],
]

/** TickMath.getSqrtRatioAtTick — tick → sqrtPriceX96 */
export function getSqrtRatioAtTick(tick) {
  if (!Number.isInteger(tick) || tick < MIN_TICK || tick > MAX_TICK) {
    throw new RangeError(`tick 범위 밖: ${tick}`)
  }
  const absTick = BigInt(Math.abs(tick))
  let ratio =
    (absTick & 0x1n) !== 0n
      ? 0xfffcb933bd6fad37aa2d162d1a594001n
      : 0x100000000000000000000000000000000n
  for (const [bit, factor] of TICK_FACTORS) {
    if ((absTick & bit) !== 0n) ratio = (ratio * factor) >> 128n
  }
  if (tick > 0) ratio = MAX_UINT256 / ratio
  // Q128.128 → Q128.96, 올림
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n)
}

/** FullMath.mulDiv (내림). BigInt라 오버플로가 없다. */
export function mulDiv(a, b, denominator) {
  return (a * b) / denominator
}

export function getAmount0ForLiquidity(sqrtA, sqrtB, liquidity) {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA]
  return mulDiv(liquidity << 96n, sqrtB - sqrtA, sqrtB) / sqrtA
}

export function getAmount1ForLiquidity(sqrtA, sqrtB, liquidity) {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA]
  return mulDiv(liquidity, sqrtB - sqrtA, Q96)
}

/** LiquidityAmounts.getAmountsForLiquidity — 현재가 기준 토큰 수량 */
export function getAmountsForLiquidity(sqrtP, sqrtA, sqrtB, liquidity) {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA]
  if (sqrtP <= sqrtA) {
    return {
      amount0: getAmount0ForLiquidity(sqrtA, sqrtB, liquidity),
      amount1: 0n,
    }
  }
  if (sqrtP < sqrtB) {
    return {
      amount0: getAmount0ForLiquidity(sqrtP, sqrtB, liquidity),
      amount1: getAmount1ForLiquidity(sqrtA, sqrtP, liquidity),
    }
  }
  return {
    amount0: 0n,
    amount1: getAmount1ForLiquidity(sqrtA, sqrtB, liquidity),
  }
}

/** uint256 뺄셈 (언더플로 시 2^256으로 감긴다 — 컨트랙트와 동일) */
export function subUint256(a, b) {
  return (((a - b) % Q256) + Q256) % Q256
}

/** 미수령 수수료 = (feeGrowthInside_now − feeGrowthInside_last) mod 2^256 × L / 2^128 */
export function feesFromGrowth(growthNow, growthLast, liquidity) {
  return mulDiv(subUint256(growthNow, growthLast), liquidity, Q128)
}

/** v3 풀의 범위 안 수수료 누적값 (Tick.getFeeGrowthInside) */
export function v3FeeGrowthInside({
  tickCurrent,
  tickLower,
  tickUpper,
  feeGrowthGlobal,
  lowerOutside,
  upperOutside,
}) {
  const below =
    tickCurrent >= tickLower
      ? lowerOutside
      : subUint256(feeGrowthGlobal, lowerOutside)
  const above =
    tickCurrent < tickUpper
      ? upperOutside
      : subUint256(feeGrowthGlobal, upperOutside)
  return subUint256(subUint256(feeGrowthGlobal, below), above)
}

/** token0 1개당 token1 가격 (소수 자릿수 보정 포함) */
export function priceFromSqrt(sqrtPriceX96, decimals0, decimals1) {
  const ratio = Number(sqrtPriceX96) / 2 ** 96
  return ratio * ratio * 10 ** (decimals0 - decimals1)
}

/** tick → token0 1개당 token1 가격 */
export function priceFromTick(tick, decimals0, decimals1) {
  return 1.0001 ** tick * 10 ** (decimals0 - decimals1)
}

/** 정수 수량 → 소수 (표시용) */
export function toDecimal(amount, decimals) {
  if (amount === 0n) return 0
  const negative = amount < 0n
  const abs = negative ? -amount : amount
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  const fraction = abs % base
  const value =
    Number(whole) + Number(fraction) / 10 ** decimals
  return negative ? -value : value
}
