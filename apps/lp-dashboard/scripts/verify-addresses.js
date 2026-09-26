// 컨트랙트 주소·엔드포인트 실측: npm run verify
// 체인 × 프로토콜마다 바이트코드가 있는지, 서로 맞물리는지(PoolManager·factory),
// Alchemy NFT API·Transfers API를 쓸 수 있는지 확인한다. (Alchemy 키 필요)
import { getAddress } from "viem"

import { CHAINS, MULTICALL3 } from "../server/config/chains.js"
import {
  v3PositionManagerAbi,
  v4PositionManagerAbi,
  v4StateViewAbi,
} from "../server/config/contracts.js"
import { env } from "../server/lib/env.js"
import { alchemyFetch, getClient } from "../server/services/rpc.js"

if (!env.alchemyKey) {
  console.error("ALCHEMY_API_KEY가 없습니다. apps/lp-dashboard/.env 파일에 넣고 다시 실행하세요.")
  process.exit(1)
}

let failures = 0
const report = (ok, label, detail = "") => {
  if (!ok) failures += 1
  console.log(`  ${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`)
}
const message = (error) => error.shortMessage ?? error.message

async function hasCode(client, address) {
  const code = await client.getCode({ address })
  return Boolean(code && code !== "0x")
}

for (const chain of CHAINS) {
  console.log(`\n■ ${chain.name} (${chain.alchemySlug})`)
  const client = getClient(chain.key)

  try {
    const chainId = await client.getChainId()
    report(chainId === chain.chainId, "chainId", `${chainId} (설정 ${chain.chainId})`)
  } catch (error) {
    report(false, "RPC 연결", message(error))
    continue
  }

  try {
    report(await hasCode(client, MULTICALL3), "Multicall3", MULTICALL3)
  } catch (error) {
    report(false, "Multicall3", message(error))
  }

  for (const protocol of chain.protocols) {
    console.log(`  · ${protocol.name}`)
    const pm = protocol.positionManager
    try {
      report(await hasCode(client, pm), "PositionManager 배포", getAddress(pm))
      if (protocol.kind === "uniswapV4") {
        report(await hasCode(client, protocol.stateView), "StateView 배포", getAddress(protocol.stateView))
        const [a, b] = await Promise.all([
          client.readContract({ address: pm, abi: v4PositionManagerAbi, functionName: "poolManager" }),
          client.readContract({ address: protocol.stateView, abi: v4StateViewAbi, functionName: "poolManager" }),
        ])
        report(a.toLowerCase() === b.toLowerCase(), "PositionManager·StateView가 같은 PoolManager", a)
      } else {
        report(await hasCode(client, protocol.factory), "Factory 배포", getAddress(protocol.factory))
        const factory = await client.readContract({
          address: pm,
          abi: v3PositionManagerAbi,
          functionName: "factory",
        })
        report(factory.toLowerCase() === protocol.factory, "PositionManager의 factory 일치", factory)
      }
      const name = await client.readContract({ address: pm, abi: v4PositionManagerAbi, functionName: "name" })
      report(true, "NFT 이름", name)
    } catch (error) {
      report(false, "컨트랙트 조회", message(error))
    }

    try {
      await alchemyFetch(`${chain.nftApiUrl}/getContractMetadata?contractAddress=${pm}`)
      report(true, "NFT API (포지션 자동 탐색)")
    } catch (error) {
      report(false, "NFT API (포지션 자동 탐색)", message(error))
    }

    try {
      await alchemyFetch(chain.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "alchemy_getAssetTransfers",
          params: [{ fromBlock: "0x0", toAddress: pm, category: ["erc721"], maxCount: "0x1" }],
        }),
      })
      report(true, "Transfers API (APR용 민팅 시각)")
    } catch (error) {
      report(false, "Transfers API (APR용 민팅 시각)", message(error))
    }
  }
}

console.log(failures === 0 ? "\n모두 정상입니다." : `\n확인 필요: ${failures}건`)
process.exit(failures === 0 ? 0 : 1)
