import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/** apps/lp-dashboard 폴더 */
export const APP_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
)

const envFile = path.join(APP_DIR, ".env")
if (existsSync(envFile)) process.loadEnvFile(envFile)

/** 지갑 목록·캐시·로그를 두는 폴더 (gitignore). 데모 모드는 따로 쓴다. */
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(APP_DIR, "data", process.env.MOCK === "1" ? "mock" : "")

function number(name, fallback) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export const env = {
  alchemyKey: process.env.ALCHEMY_API_KEY?.trim() ?? "",
  port: number("PORT", 4747),
  pollIntervalMs: number("POLL_INTERVAL_MS", 2_000),
  discoveryDebounceMs: number("DISCOVERY_DEBOUNCE_MS", 15_000),
  anchorPriceTtlMs: number("ANCHOR_PRICE_TTL_MS", 60_000),
  /** 쉼표로 구분한 체인 키. 비우면 전체 */
  enabledChains: (process.env.ENABLED_CHAINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  /** 1이면 RPC 없이 데모 데이터로 화면을 띄운다 */
  mock: process.env.MOCK === "1",
}

/** 체인별 URL 오버라이드: RPC_URL_BASE, WS_URL_BASE, NFT_API_URL_BASE 등 */
export function chainOverride(kind, chainKey) {
  return process.env[`${kind}_${chainKey.toUpperCase()}`]?.trim() || undefined
}
