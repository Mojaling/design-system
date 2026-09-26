import { CHAINS, NATIVE } from "../config/chains.js"
import { env } from "../lib/env.js"
import { log } from "../lib/log.js"

// 주소 목록에 없을 때 쓰는 유명 스테이블 심볼
const STABLE_SYMBOLS = new Set([
  "USDC", "USDT", "DAI", "USDE", "USDG", "USDS", "PYUSD", "FDUSD", "BUSD",
  "USD1", "USDBC", "USDC.E", "USDT0", "USD₮0", "LUSD", "FRAX", "GHO", "TUSD",
  "CRVUSD", "RLUSD", "USDP",
])

const NATIVE_SYMBOLS = {
  ETH: new Set(["ETH", "WETH"]),
  BNB: new Set(["BNB", "WBNB"]),
}

/** "stable" | "native" | "other" */
export function classifyToken(chain, token) {
  const address = token.address.toLowerCase()
  const symbol = token.symbol.toUpperCase()
  if (chain.stables.includes(address) || STABLE_SYMBOLS.has(symbol)) return "stable"
  if (
    address === NATIVE ||
    address === chain.wrappedNative ||
    NATIVE_SYMBOLS[chain.native.symbol]?.has(symbol)
  ) {
    return "native"
  }
  return "other"
}

/**
 * quote(가격 기준) 토큰 고르기: 스테이블 > 네이티브 > token1.
 * 반환값은 quote 토큰의 인덱스(0 또는 1).
 */
export function chooseQuote(chain, token0, token1) {
  const rank = { stable: 2, native: 1, other: 0 }
  const r0 = rank[classifyToken(chain, token0)]
  const r1 = rank[classifyToken(chain, token1)]
  return r0 > r1 ? 0 : 1
}

// ── 앵커 가격 (CoinGecko: ETH, BNB) ──────────────────────────────

const anchors = new Map() // coingeckoId → { usd, at }
let inflight = null
let retryAt = 0

/** 오래된 앵커 가격을 새로 받는다. 실패하면 이전 값을 쓰고, 한동안 다시 묻지 않는다. */
export async function refreshAnchors() {
  const ids = [...new Set(CHAINS.map((c) => c.native.coingeckoId))]
  const stale = ids.some(
    (id) => !anchors.has(id) || Date.now() - anchors.get(id).at > env.anchorPriceTtlMs
  )
  if (!stale || Date.now() < retryAt) return
  inflight ??= (async () => {
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd`
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      if (!response.ok) throw new Error(`CoinGecko 응답 ${response.status}`)
      const body = await response.json()
      for (const id of ids) {
        const usd = Number(body?.[id]?.usd)
        if (Number.isFinite(usd) && usd > 0) anchors.set(id, { usd, at: Date.now() })
      }
    } catch (error) {
      retryAt = Date.now() + env.anchorPriceTtlMs
      log.warn("앵커 가격 갱신 실패:", error.message)
    } finally {
      inflight = null
    }
  })()
  await inflight
}

export function anchorUsd(coingeckoId) {
  return anchors.get(coingeckoId)?.usd ?? null
}

/** 데모 모드용 */
export function setAnchorUsd(coingeckoId, usd) {
  anchors.set(coingeckoId, { usd, at: Date.now() })
}

// ── 토큰 USD 가격표 ────────────────────────────────────────────
// 풀 가격으로 USD를 알게 된 토큰을 기록해 두고, 스테이블·네이티브가 없는
// 페어(롱테일/롱테일)에서 다른 포지션을 통해 가격을 이어 붙이는 데 쓴다.

const book = new Map() // `${chainKey}:${address}` → usd

export function rememberUsd(chainKey, address, usd) {
  if (Number.isFinite(usd) && usd > 0) book.set(`${chainKey}:${address.toLowerCase()}`, usd)
}

/** 체인에서 토큰 1개의 USD 가격. 모르면 null. */
export function knownUsd(chain, token) {
  const kind = classifyToken(chain, token)
  if (kind === "stable") return 1
  if (kind === "native") return anchorUsd(chain.native.coingeckoId)
  return book.get(`${chain.key}:${token.address.toLowerCase()}`) ?? null
}
