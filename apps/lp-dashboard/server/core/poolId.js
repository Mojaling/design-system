import { encodeAbiParameters, keccak256, pad, toHex } from "viem"

const POOL_KEY_TYPES = [
  { type: "address" },
  { type: "address" },
  { type: "uint24" },
  { type: "int24" },
  { type: "address" },
]

/**
 * v4 poolId = keccak256(abi.encode(PoolKey)).
 * PositionInfo 안의 poolId는 앞 25바이트만 남아 있어서 쓸 수 없고, 직접 다시 계산해야 한다.
 */
export function computePoolId({ currency0, currency1, fee, tickSpacing, hooks }) {
  return keccak256(
    encodeAbiParameters(POOL_KEY_TYPES, [
      currency0,
      currency1,
      Number(fee),
      Number(tickSpacing),
      hooks,
    ])
  )
}

/** v4 포지션의 salt = bytes32(tokenId) */
export function tokenIdSalt(tokenId) {
  return pad(toHex(BigInt(tokenId)), { size: 32 })
}
