import { getChain, getProtocol } from "../config/chains.js"
import { getMintTime } from "./mintTime.js"
import { buildView } from "./readers/common.js"
import * as pancakeV3 from "./readers/pancakeV3.js"
import * as uniswapV4 from "./readers/uniswapV4.js"
import { getTokenMetas } from "./tokens.js"

// 프로토콜 kind → 리더
const READERS = { uniswapV4, pancakeV3 }

function reader(protocol) {
  const r = READERS[protocol.kind]
  if (!r) throw new Error(`리더가 없는 프로토콜: ${protocol.kind}`)
  return r
}

/** 한 번만 읽으면 되는 정보. Map<tokenId, static | { dead } | { error }> */
export function loadStatic(chainKey, protocolId, tokenIds) {
  const chain = getChain(chainKey)
  const protocol = getProtocol(chainKey, protocolId)
  return reader(protocol).readStatic(chain, protocol, tokenIds)
}

/**
 * 현재 값을 읽어서 화면용 view로 만든다.
 * entries: [{ tokenId, owner, static }]
 * 반환: Map<tokenId, { view } | { error }>
 */
export async function readViews(chainKey, protocolId, entries) {
  const chain = getChain(chainKey)
  const protocol = getProtocol(chainKey, protocolId)
  const dynamic = await reader(protocol).readDynamic(chain, protocol, entries)
  const metas = await getTokenMetas(
    chainKey,
    entries.flatMap((e) => [e.static.token0, e.static.token1])
  )

  const out = new Map()
  for (const { tokenId, owner, static: s } of entries) {
    const d = dynamic.get(tokenId)
    const token0 = metas.get(s.token0)
    const token1 = metas.get(s.token1)
    if (!d || d.error) {
      out.set(tokenId, { error: d?.error ?? "조회 실패" })
    } else if (!token0 || !token1) {
      out.set(tokenId, { error: "토큰 정보 조회 실패" })
    } else {
      const view = buildView(chainKey, protocolId, {
        ...s,
        ...d,
        tokenId,
        owner,
        token0,
        token1,
        mintedAt: getMintTime(chainKey, protocolId, tokenId),
      })
      out.set(tokenId, { view, liquidity: d.liquidity, fees: d.fees0 + d.fees1 })
    }
  }
  return out
}
