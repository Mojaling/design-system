import {
  v3FactoryAbi,
  v3PoolAbi,
  v3PositionManagerAbi,
} from "../../config/contracts.js"
import { feesFromGrowth, v3FeeGrowthInside } from "../../core/math.js"
import { multiRead } from "../rpc.js"

const ZERO = "0x0000000000000000000000000000000000000000"
const poolCache = new Map() // `${token0}:${token1}:${fee}` → pool 주소

/**
 * 한 번만 읽으면 되는 정보: 토큰·수수료·틱 범위·풀 주소.
 * 반환: Map<tokenId, static | { dead: true, reason }>
 */
export async function readStatic(chain, protocol, tokenIds) {
  const results = await multiRead(
    chain.key,
    tokenIds.map((tokenId) => ({
      address: protocol.positionManager,
      abi: v3PositionManagerAbi,
      functionName: "positions",
      args: [BigInt(tokenId)],
    }))
  )

  const out = new Map()
  const needPool = []
  tokenIds.forEach((tokenId, i) => {
    const r = results[i]
    if (r.status !== "success") {
      // 소각된 포지션은 "Invalid token ID"로 revert 한다.
      out.set(tokenId, { dead: true, reason: r.error?.shortMessage ?? "소각된 포지션" })
      return
    }
    const [, , token0, token1, fee, tickLower, tickUpper] = r.result
    const s = {
      token0: token0.toLowerCase(),
      token1: token1.toLowerCase(),
      fee: Number(fee),
      tickLower: Number(tickLower),
      tickUpper: Number(tickUpper),
    }
    s.poolKey = `${s.token0}:${s.token1}:${s.fee}`
    out.set(tokenId, s)
    if (!poolCache.has(s.poolKey)) needPool.push(s)
  })

  const uniquePools = [...new Map(needPool.map((s) => [s.poolKey, s])).values()]
  if (uniquePools.length > 0) {
    const pools = await multiRead(
      chain.key,
      uniquePools.map((s) => ({
        address: protocol.factory,
        abi: v3FactoryAbi,
        functionName: "getPool",
        args: [s.token0, s.token1, s.fee],
      }))
    )
    uniquePools.forEach((s, i) => {
      const r = pools[i]
      if (r.status === "success" && r.result !== ZERO) {
        poolCache.set(s.poolKey, r.result.toLowerCase())
      }
    })
  }

  for (const [tokenId, s] of out) {
    if (s.dead) continue
    const pool = poolCache.get(s.poolKey)
    if (pool) s.pool = pool
    else out.set(tokenId, { error: "풀 주소를 찾지 못함" })
  }
  return out
}

/**
 * 폴링마다 읽는 값. 수수료는 컨트랙트와 같은 방식으로 계산한다:
 * feeGrowthInside = global − below − above, 수수료 = diff × L / 2^128 + tokensOwed
 */
export async function readDynamic(chain, protocol, entries) {
  const calls = []
  const slot = new Map()
  const push = (id, call) => {
    if (!slot.has(id)) slot.set(id, calls.push(call) - 1)
    return slot.get(id)
  }
  const poolCall = (pool, functionName, args) => ({
    address: pool,
    abi: v3PoolAbi,
    functionName,
    ...(args ? { args } : {}),
  })

  const plan = entries.map(({ tokenId, static: s }) => ({
    tokenId,
    s,
    position: push(`position:${tokenId}`, {
      address: protocol.positionManager,
      abi: v3PositionManagerAbi,
      functionName: "positions",
      args: [BigInt(tokenId)],
    }),
    slot0: push(`slot0:${s.pool}`, poolCall(s.pool, "slot0")),
    global0: push(`g0:${s.pool}`, poolCall(s.pool, "feeGrowthGlobal0X128")),
    global1: push(`g1:${s.pool}`, poolCall(s.pool, "feeGrowthGlobal1X128")),
    lower: push(`tick:${s.pool}:${s.tickLower}`, poolCall(s.pool, "ticks", [s.tickLower])),
    upper: push(`tick:${s.pool}:${s.tickUpper}`, poolCall(s.pool, "ticks", [s.tickUpper])),
  }))

  const results = await multiRead(chain.key, calls)
  const out = new Map()
  for (const p of plan) {
    const r = (i) => results[i]
    const parts = [p.position, p.slot0, p.global0, p.global1, p.lower, p.upper].map(r)
    if (parts.some((x) => x.status !== "success")) {
      out.set(p.tokenId, { error: "온체인 조회 실패" })
      continue
    }
    const [position, slot0, global0, global1, lower, upper] = parts.map((x) => x.result)
    const liquidity = position[7]
    const [last0, last1, owed0, owed1] = [position[8], position[9], position[10], position[11]]
    const tick = Number(slot0[1])
    const inside = (global, lowerOutside, upperOutside) =>
      v3FeeGrowthInside({
        tickCurrent: tick,
        tickLower: p.s.tickLower,
        tickUpper: p.s.tickUpper,
        feeGrowthGlobal: global,
        lowerOutside,
        upperOutside,
      })
    out.set(p.tokenId, {
      tick,
      sqrtPriceX96: slot0[0],
      liquidity,
      fees0: owed0 + feesFromGrowth(inside(global0, lower[2], upper[2]), last0, liquidity),
      fees1: owed1 + feesFromGrowth(inside(global1, lower[3], upper[3]), last1, liquidity),
    })
  }
  return out
}
