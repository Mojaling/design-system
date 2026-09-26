// Uniswap v4 PositionInfo (packed uint256)
// | 200 bits poolId(잘림) | 24 bits tickUpper | 24 bits tickLower | 8 bits hasSubscriber |

function int24(value) {
  const n = Number(value & 0xffffffn)
  return n >= 0x800000 ? n - 0x1000000 : n
}

export function decodePositionInfo(info) {
  return {
    hasSubscriber: (info & 0xffn) !== 0n,
    tickLower: int24(info >> 8n),
    tickUpper: int24(info >> 32n),
  }
}

/** 테스트용: 필드를 다시 packed uint256으로 */
export function encodePositionInfo({ tickLower, tickUpper, hasSubscriber = false }) {
  const u24 = (n) => BigInt(n < 0 ? n + 0x1000000 : n)
  return (u24(tickUpper) << 32n) | (u24(tickLower) << 8n) | (hasSubscriber ? 1n : 0n)
}
