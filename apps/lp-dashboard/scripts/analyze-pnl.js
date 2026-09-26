// 포지션 손익 분석: npm run pnl -- <체인> <프로토콜> <tokenId>
// 예) npm run pnl -- base uniswap-v4 812345
//
// 민팅 때 넣은 수량을 그대로 들고 있었을 때(HODL)와 지금 LP 가치를 비교한다.
// - 넣은 수량은 민팅 블록 한 개의 이벤트에서 읽는다 (무료 티어 getLogs 10블록 제한 안에 들어감).
// - ⚠️ ERC20 Transfer 합산은 쓰지 않는다: v4 flash accounting 때문에 한쪽이 안 잡힌다.
// - 민팅 이후에 유동성을 더 넣거나 뺐다면 그 부분은 반영되지 않는다.
import { getChain, getProtocol } from "../server/config/chains.js"
import {
  v3IncreaseLiquidityEvent,
  v4PoolManagerModifyLiquidityEvent,
  v4PositionManagerAbi,
  v4StateViewAbi,
} from "../server/config/contracts.js"
import { getAmountsForLiquidity, getSqrtRatioAtTick, toDecimal } from "../server/core/math.js"
import { tokenIdSalt } from "../server/core/poolId.js"
import { env } from "../server/lib/env.js"
import { loadStatic, readViews } from "../server/services/position.js"
import { knownUsd, refreshAnchors } from "../server/services/pricing.js"
import { alchemyFetch, getClient } from "../server/services/rpc.js"
import { getTokenMetas } from "../server/services/tokens.js"

const [chainKey, protocolId, tokenId] = process.argv.slice(2)
if (!chainKey || !protocolId || !tokenId) {
  console.error("사용법: npm run pnl -- <체인> <프로토콜> <tokenId>")
  console.error("예)     npm run pnl -- base uniswap-v4 812345")
  process.exit(1)
}
if (!env.alchemyKey) {
  console.error("ALCHEMY_API_KEY가 없습니다. apps/lp-dashboard/.env 파일에 넣고 다시 실행하세요.")
  process.exit(1)
}

const chain = getChain(chainKey)
const protocol = getProtocol(chainKey, protocolId)
const client = getClient(chainKey)

// 1) 고정 정보와 현재 소유자
const s = (await loadStatic(chainKey, protocolId, [tokenId])).get(tokenId)
if (!s || s.dead || s.error) {
  console.error("포지션을 읽지 못했습니다:", s?.reason ?? s?.error ?? "알 수 없음")
  process.exit(1)
}
const owner = await client.readContract({
  address: protocol.positionManager,
  abi: v4PositionManagerAbi,
  functionName: "ownerOf",
  args: [BigInt(tokenId)],
})

// 2) 민팅 블록 (0x0 → 소유자)
const transfers = await alchemyFetch(chain.rpcUrl, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    id: 1,
    jsonrpc: "2.0",
    method: "alchemy_getAssetTransfers",
    params: [
      {
        fromBlock: "0x0",
        fromAddress: "0x0000000000000000000000000000000000000000",
        toAddress: owner,
        contractAddresses: [protocol.positionManager],
        category: ["erc721"],
        withMetadata: true,
        maxCount: "0x3e8",
      },
    ],
  }),
})
const mint = transfers.result?.transfers?.find(
  (t) => BigInt(t.erc721TokenId ?? t.tokenId) === BigInt(tokenId)
)
if (!mint) {
  console.error("민팅 기록을 찾지 못했습니다. 다른 지갑에서 민팅한 뒤 옮겨온 포지션일 수 있습니다.")
  process.exit(1)
}
const mintBlock = BigInt(mint.blockNum)

// 3) 민팅 때 넣은 수량
let deposit0
let deposit1
if (protocol.kind === "pancakeV3") {
  const logs = await client.getLogs({
    address: protocol.positionManager,
    event: v3IncreaseLiquidityEvent,
    args: { tokenId: BigInt(tokenId) },
    fromBlock: mintBlock,
    toBlock: mintBlock,
  })
  if (logs.length === 0) throw new Error("민팅 블록에서 IncreaseLiquidity 이벤트를 찾지 못했습니다.")
  deposit0 = logs.reduce((sum, l) => sum + l.args.amount0, 0n)
  deposit1 = logs.reduce((sum, l) => sum + l.args.amount1, 0n)
} else {
  const poolManager = await client.readContract({
    address: protocol.stateView,
    abi: v4StateViewAbi,
    functionName: "poolManager",
  })
  const logs = await client.getLogs({
    address: poolManager,
    event: v4PoolManagerModifyLiquidityEvent,
    args: { id: s.poolId, sender: protocol.positionManager },
    fromBlock: mintBlock,
    toBlock: mintBlock,
  })
  const mine = logs.filter((l) => l.args.salt === tokenIdSalt(tokenId) && l.args.liquidityDelta > 0n)
  if (mine.length === 0) throw new Error("민팅 블록에서 ModifyLiquidity 이벤트를 찾지 못했습니다.")
  const liquidity = mine.reduce((sum, l) => sum + l.args.liquidityDelta, 0n)
  // 민팅 직전 블록의 가격으로 넣은 수량을 계산한다 (같은 블록 안의 다른 스왑은 무시되는 근사).
  const [sqrtPriceX96] = await client.readContract({
    address: protocol.stateView,
    abi: v4StateViewAbi,
    functionName: "getSlot0",
    args: [s.poolId],
    blockNumber: mintBlock - 1n,
  })
  const amounts = getAmountsForLiquidity(
    sqrtPriceX96,
    getSqrtRatioAtTick(s.tickLower),
    getSqrtRatioAtTick(s.tickUpper),
    liquidity
  )
  deposit0 = amounts.amount0
  deposit1 = amounts.amount1
}

// 4) 현재 가치
await refreshAnchors()
const current = (
  await readViews(chainKey, protocolId, [{ tokenId, owner, static: s }])
).get(tokenId)
if (!current?.view) throw new Error(current?.error ?? "현재 값을 읽지 못했습니다.")
const view = current.view
const metas = await getTokenMetas(chainKey, [s.token0, s.token1])
const token0 = metas.get(s.token0)
const token1 = metas.get(s.token1)
const price0 = knownUsd(chain, token0)
const price1 = knownUsd(chain, token1)

const d0 = toDecimal(deposit0, token0.decimals)
const d1 = toDecimal(deposit1, token1.decimals)
const usd = (n) => (n == null || !Number.isFinite(n) ? "—" : `$${n.toFixed(2)}`)
const hodl = price0 == null || price1 == null ? null : d0 * price0 + d1 * price1
const lp = view.usd.value
const fees = view.usd.fees

console.log(`\n${view.base.symbol}/${view.quote.symbol} · ${protocol.name} · ${chain.name} #${tokenId}`)
console.log(`민팅: 블록 ${mintBlock} (${mint.metadata?.blockTimestamp ?? "시각 모름"})`)
console.log(`\n넣은 수량: ${d0} ${token0.symbol} + ${d1} ${token1.symbol}`)
console.log(`그대로 들고 있었다면 (HODL): ${usd(hodl)}`)
console.log(`지금 LP 가치:               ${usd(lp)}`)
console.log(`미수령 수수료:              ${usd(fees)}`)
if (hodl != null && lp != null && fees != null) {
  console.log(`\n비영구 손실 (LP − HODL):     ${usd(lp - hodl)}`)
  console.log(`순손익 (LP + 수수료 − HODL): ${usd(lp + fees - hodl)}`)
} else {
  console.log("\nUSD 가격을 모르는 토큰이 있어 손익을 계산하지 못했습니다.")
}
console.log("\n※ 민팅 이후 유동성을 더 넣거나 뺀 내역, 이미 수령한 수수료는 반영되지 않습니다.")
process.exit(0)
