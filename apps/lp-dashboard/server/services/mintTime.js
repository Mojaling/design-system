import { positionKey } from "../config/chains.js"
import { readJson, writeJson } from "../lib/files.js"
import { log } from "../lib/log.js"
import { alchemyFetch, TransientError } from "./rpc.js"

// 민팅(또는 지갑으로 들어온) 시각. APR의 보유일수 계산에 쓴다.
// ⚠️ 무료 티어 eth_getLogs는 10블록 제한이라 못 쓴다 → alchemy_getAssetTransfers 사용.
// 지갑당 한 번 전체를 받고, 이후에는 마지막으로 본 블록부터 이어서 받는다.

const FILE = "mint-times.json"
const state = readJson(FILE, { times: {}, cursors: {} })
const unsupported = new Set() // 이 API를 지원하지 않는 체인

export function getMintTime(chainKey, protocolId, tokenId) {
  return state.times[positionKey(chainKey, protocolId, tokenId)] ?? null
}

/**
 * tokenIds 중 시각을 모르는 게 있으면 이 지갑의 NFT 입금 내역을 받아서 채운다.
 * 실패해도 대시보드는 계속 돈다 (APR만 비어 보임).
 */
export async function ensureMintTimes(chain, protocol, wallet, tokenIds) {
  if (unsupported.has(chain.key)) return
  const missing = tokenIds.filter((id) => !getMintTime(chain.key, protocol.id, id))
  if (missing.length === 0) return

  const cursorKey = `${chain.key}:${protocol.id}:${wallet.toLowerCase()}`
  let fromBlock = state.cursors[cursorKey] ?? "0x0"
  let pageKey
  try {
    do {
      const body = await alchemyFetch(chain.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "alchemy_getAssetTransfers",
          params: [
            {
              fromBlock,
              toBlock: "latest",
              toAddress: wallet,
              contractAddresses: [protocol.positionManager],
              category: ["erc721"],
              withMetadata: true,
              excludeZeroValue: false,
              order: "asc",
              maxCount: "0x3e8",
              ...(pageKey ? { pageKey } : {}),
            },
          ],
        }),
      })
      const { transfers = [], pageKey: next } = body.result ?? {}
      for (const t of transfers) {
        const rawId = t.erc721TokenId ?? t.tokenId
        const at = Date.parse(t.metadata?.blockTimestamp ?? "")
        if (rawId == null || !Number.isFinite(at)) continue
        const key = positionKey(chain.key, protocol.id, BigInt(rawId).toString())
        // 처음 들어온 시각만 기록한다 (asc 정렬).
        state.times[key] ??= at
        if (t.blockNum) state.cursors[cursorKey] = t.blockNum
      }
      pageKey = next
    } while (pageKey)
    writeJson(FILE, state)
  } catch (error) {
    if (error instanceof TransientError) throw error
    // 지원하지 않는 체인 등: 재시작 전까지 다시 묻지 않는다.
    unsupported.add(chain.key)
    log.warn(`${chain.name}: 민팅 시각 조회 불가 (APR 표시 안 함) —`, error.message)
  }
}
