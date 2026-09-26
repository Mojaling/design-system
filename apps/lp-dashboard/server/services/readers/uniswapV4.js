import { v4PositionManagerAbi, v4StateViewAbi } from "../../config/contracts.js"
import { decodePositionInfo } from "../../core/decode.js"
import { feesFromGrowth } from "../../core/math.js"
import { computePoolId, tokenIdSalt } from "../../core/poolId.js"
import { multiRead } from "../rpc.js"

/**
 * 한 번만 읽으면 되는 정보(풀·틱 범위). tokenId마다 바뀌지 않는다.
 * 반환: Map<tokenId, static | { dead: true, reason }>
 */
export async function readStatic(chain, protocol, tokenIds) {
  const results = await multiRead(
    chain.key,
    tokenIds.map((tokenId) => ({
      address: protocol.positionManager,
      abi: v4PositionManagerAbi,
      functionName: "getPoolAndPositionInfo",
      args: [BigInt(tokenId)],
    }))
  )
  const out = new Map()
  tokenIds.forEach((tokenId, i) => {
    const r = results[i]
    if (r.status !== "success") {
      // 존재하지 않는 tokenId도 revert 하지 않으므로, revert는 다음에 다시 시도한다.
      out.set(tokenId, { error: r.error?.shortMessage ?? "조회 실패" })
      return
    }
    const [poolKey, info] = r.result
    // 소각된 포지션은 빈 PoolKey(tickSpacing 0)를 돌려준다.
    if (Number(poolKey.tickSpacing) === 0) {
      out.set(tokenId, { dead: true, reason: "소각된 포지션" })
      return
    }
    const { tickLower, tickUpper } = decodePositionInfo(info)
    out.set(tokenId, {
      token0: poolKey.currency0.toLowerCase(),
      token1: poolKey.currency1.toLowerCase(),
      fee: Number(poolKey.fee),
      tickLower,
      tickUpper,
      poolId: computePoolId(poolKey),
      hooks: poolKey.hooks,
    })
  })
  return out
}

/**
 * 폴링마다 읽는 값. 같은 풀의 slot0·같은 범위의 feeGrowthInside는 한 번만 묻는다.
 * entries: [{ tokenId, static }]
 * 반환: Map<tokenId, { tick, sqrtPriceX96, liquidity, fees0, fees1 }>
 */
export async function readDynamic(chain, protocol, entries) {
  const calls = []
  const slot = new Map()
  const push = (id, call) => {
    if (!slot.has(id)) slot.set(id, calls.push(call) - 1)
    return slot.get(id)
  }

  const plan = entries.map(({ tokenId, static: s }) => ({
    tokenId,
    slot0: push(`slot0:${s.poolId}`, {
      address: protocol.stateView,
      abi: v4StateViewAbi,
      functionName: "getSlot0",
      args: [s.poolId],
    }),
    growth: push(`growth:${s.poolId}:${s.tickLower}:${s.tickUpper}`, {
      address: protocol.stateView,
      abi: v4StateViewAbi,
      functionName: "getFeeGrowthInside",
      args: [s.poolId, s.tickLower, s.tickUpper],
    }),
    // ⚠️ owner는 지갑이 아니라 PositionManager, salt는 tokenId
    position: push(`position:${tokenId}`, {
      address: protocol.stateView,
      abi: v4StateViewAbi,
      functionName: "getPositionInfo",
      args: [
        s.poolId,
        protocol.positionManager,
        s.tickLower,
        s.tickUpper,
        tokenIdSalt(tokenId),
      ],
    }),
  }))

  const results = await multiRead(chain.key, calls)
  const out = new Map()
  for (const p of plan) {
    const slot0 = results[p.slot0]
    const growth = results[p.growth]
    const position = results[p.position]
    if ([slot0, growth, position].some((r) => r.status !== "success")) {
      out.set(p.tokenId, { error: "온체인 조회 실패" })
      continue
    }
    const [sqrtPriceX96, tick] = slot0.result
    const [inside0, inside1] = growth.result
    const [liquidity, last0, last1] = position.result
    out.set(p.tokenId, {
      tick: Number(tick),
      sqrtPriceX96,
      liquidity,
      fees0: feesFromGrowth(inside0, last0, liquidity),
      fees1: feesFromGrowth(inside1, last1, liquidity),
    })
  }
  return out
}
