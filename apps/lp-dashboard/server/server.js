import { existsSync } from "node:fs"
import { createServer } from "node:http"
import path from "node:path"

import express from "express"
import { WebSocketServer } from "ws"

import { APP_DIR, env } from "./lib/env.js"
import { log } from "./lib/log.js"
import { UserError } from "./store.js"

const DIST_DIR = path.join(APP_DIR, "web", "dist")
const DEV_PORT = 5173 // Vite 개발 서버

/**
 * REST + WebSocket 서버. 127.0.0.1에만 열어서 같은 PC에서만 접속할 수 있다.
 * 다른 웹사이트가 브라우저를 통해 API를 부르지 못하도록 Host·Origin을 확인한다.
 */
export function startServer(store, { onShutdown }) {
  const hosts = [env.port, DEV_PORT].flatMap((port) => [
    `127.0.0.1:${port}`,
    `localhost:${port}`,
  ])
  const allowedHosts = new Set(hosts)
  const allowedOrigins = new Set(hosts.map((h) => `http://${h}`))
  const originOk = (origin) => !origin || allowedOrigins.has(origin)

  const app = express()
  app.disable("x-powered-by")

  app.use((req, res, next) => {
    if (!allowedHosts.has(req.headers.host)) {
      return res.status(403).json({ error: "허용되지 않은 호스트입니다." })
    }
    next()
  })
  app.use(express.json({ limit: "10kb" }))

  // 상태를 바꾸는 요청: JSON만(교차 출처면 사전 요청이 필요해진다) + 출처 확인
  const guard = (req, res, next) => {
    if (!originOk(req.headers.origin)) {
      return res.status(403).json({ error: "허용되지 않은 출처입니다." })
    }
    if (req.method === "POST" && !req.is("application/json")) {
      return res.status(415).json({ error: "JSON 요청만 받습니다." })
    }
    next()
  }

  app.get("/api/state", (_req, res) => res.json(store.snapshot()))

  app.post("/api/wallets", guard, (req, res) => {
    store.addWallet(String(req.body?.address ?? ""), req.body?.label ?? "")
    res.json({ wallets: store.wallets })
  })

  app.delete("/api/wallets/:address", guard, (req, res) => {
    store.removeWallet(req.params.address)
    res.json({ wallets: store.wallets })
  })

  app.post("/api/refresh", guard, (_req, res) => {
    store.requestDiscovery({ force: true })
    res.json({ ok: true })
  })

  app.post("/api/shutdown", guard, (_req, res) => {
    res.json({ ok: true })
    log.info("대시보드 종료 요청")
    setTimeout(onShutdown, 200)
  })

  app.use("/api", (_req, res) => res.status(404).json({ error: "없는 API입니다." }))

  // 빌드된 화면
  if (existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR))
    app.use((req, res, next) => {
      if (req.method !== "GET") return next()
      res.sendFile(path.join(DIST_DIR, "index.html"))
    })
  } else {
    app.get("/", (_req, res) =>
      res
        .type("text/plain; charset=utf-8")
        .send("화면이 아직 빌드되지 않았습니다. 먼저 `npm run build`를 실행하세요.")
    )
  }

  // Express는 인자가 4개인 함수를 오류 처리기로 인식한다.
  app.use((error, _req, res, _next) => {
    if (error instanceof UserError) return res.status(400).json({ error: error.message })
    log.error("API 오류:", error)
    res.status(500).json({ error: "서버 오류가 발생했습니다." })
  })

  const server = createServer(app)
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    verifyClient: ({ origin, req }) =>
      allowedHosts.has(req.headers.host) && originOk(origin),
  })

  let nextId = 1
  wss.on("connection", (socket) => {
    const id = nextId++
    send(socket, { type: "snapshot", ...store.snapshot() })
    store.clientConnected(id)
    socket.on("message", (data) => {
      try {
        const message = JSON.parse(String(data))
        if (message.type === "visibility") store.clientVisibility(id, message.visible)
      } catch {
        // 잘못된 메시지는 무시
      }
    })
    socket.on("close", () => store.clientDisconnected(id))
  })

  const broadcast = (message) => {
    const text = JSON.stringify(message)
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(text)
    }
  }
  store.on("positions", (payload) => broadcast({ type: "positions", ...payload }))
  store.on("status", (status) => broadcast({ type: "status", status }))
  store.on("wallets", (wallets) => broadcast({ type: "wallets", wallets }))

  server.listen(env.port, "127.0.0.1", () => {
    log.info(`대시보드: http://127.0.0.1:${env.port}`)
  })

  return {
    close(callback) {
      for (const client of wss.clients) client.terminate()
      wss.close()
      server.close(callback)
    },
  }
}

function send(socket, message) {
  socket.send(JSON.stringify(message))
}
