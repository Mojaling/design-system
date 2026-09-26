import { useEffect, useReducer } from "react"

import type {
  Connection,
  PositionView,
  ServerMessage,
  ServerStatus,
  Wallet,
} from "@/lib/types"

type State = {
  connection: Connection
  loaded: boolean
  wallets: Wallet[]
  positions: Map<string, PositionView>
  status: ServerStatus | null
}

type Action = ServerMessage | { type: "connection"; connection: Connection }

const initialState: State = {
  connection: "connecting",
  loaded: false,
  wallets: [],
  positions: new Map(),
  status: null,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "connection":
      return { ...state, connection: action.connection }
    case "snapshot":
      return {
        ...state,
        loaded: true,
        wallets: action.wallets,
        status: action.status,
        positions: new Map(action.positions.map((p) => [p.key, p])),
      }
    case "positions": {
      const positions = new Map(state.positions)
      for (const key of action.removed) positions.delete(key)
      for (const p of action.upserts) positions.set(p.key, p)
      return { ...state, positions }
    }
    case "status":
      return { ...state, status: action.status }
    case "wallets":
      return { ...state, wallets: action.wallets }
  }
}

/**
 * 서버와 WebSocket으로 연결해서 실시간 상태를 받는다.
 * 탭이 보이는지 서버에 알려준다 — 서버는 보이는 탭이 있을 때만 폴링한다(CU 절약).
 */
export function useDashboard() {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    let socket: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    let disposed = false

    const sendVisibility = () => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "visibility",
            visible: document.visibilityState === "visible",
          })
        )
      }
    }

    const connect = () => {
      const protocol = location.protocol === "https:" ? "wss" : "ws"
      socket = new WebSocket(`${protocol}://${location.host}/ws`)
      dispatch({ type: "connection", connection: "connecting" })
      socket.onopen = () => {
        attempts = 0
        dispatch({ type: "connection", connection: "open" })
        sendVisibility()
      }
      socket.onmessage = (event) => {
        try {
          dispatch(JSON.parse(event.data) as ServerMessage)
        } catch {
          // 잘못된 메시지는 무시
        }
      }
      socket.onclose = () => {
        if (disposed) return
        dispatch({ type: "connection", connection: "closed" })
        attempts += 1
        retry = setTimeout(connect, Math.min(10_000, 1_000 * 2 ** attempts))
      }
    }

    connect()
    document.addEventListener("visibilitychange", sendVisibility)
    return () => {
      disposed = true
      clearTimeout(retry)
      document.removeEventListener("visibilitychange", sendVisibility)
      socket?.close()
    }
  }, [])

  return state
}
