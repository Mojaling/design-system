import { env } from "./lib/env.js"
import { log } from "./lib/log.js"
import { startServer } from "./server.js"
import { MockStore } from "./services/mock.js"
import { Store } from "./store.js"

const store = env.mock ? new MockStore() : new Store()

if (env.mock) {
  log.info("데모 모드: 가짜 데이터로 실행합니다 (RPC 사용 안 함).")
} else if (!env.alchemyKey) {
  log.warn(
    "ALCHEMY_API_KEY가 없습니다. apps/lp-dashboard/.env 파일에 키를 넣어야 온체인 조회가 됩니다."
  )
}

const server = startServer(store, { onShutdown: () => shutdown(0) })

let stopping = false
function shutdown(code) {
  if (stopping) return
  stopping = true
  store.shutdown()
  server.close(() => process.exit(code))
  // 연결이 안 닫혀도 3초 뒤에는 끝낸다.
  setTimeout(() => process.exit(code), 3_000).unref()
}

process.on("SIGINT", () => shutdown(0))
process.on("SIGTERM", () => shutdown(0))
process.on("unhandledRejection", (error) => log.error("처리되지 않은 오류:", error))
process.on("uncaughtException", (error) => {
  log.error("치명적 오류:", error)
  // 0이 아닌 코드로 끝내면 Windows 실행 스크립트가 다시 켠다.
  shutdown(1)
})
