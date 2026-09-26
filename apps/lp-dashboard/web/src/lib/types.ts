/** 서버(buildView)가 보내는 포지션 한 개 */
export type PositionView = {
  key: string
  chainKey: string
  chainName: string
  protocolId: string
  protocolName: string
  tokenId: string
  owner: string
  positionUrl: string
  feeTier: number
  base: { address: string; symbol: string }
  quote: { address: string; symbol: string }
  inRange: boolean
  liquidity: string
  price: {
    current: number | null
    clamped: number | null
    lower: number | null
    upper: number | null
    position: number
  }
  amounts: { base: number; quote: number }
  fees: { base: number; quote: number }
  usd: {
    value: number | null
    base: number | null
    quote: number | null
    fees: number | null
    baseFees: number | null
    quoteFees: number | null
  }
  /** base 쪽 비율(0~1). 둘 다 0이면 null */
  share: { value: number | null; fees: number | null }
  apr: number | null
  heldDays: number | null
  copyAddress: string | null
  stale: boolean
  error: string | null
}

export type Wallet = { address: string; label: string }

export type ChainStatus = {
  name: string
  ok: boolean | null
  error: string | null
  at?: number
}

export type ServerStatus = {
  mock: boolean
  hasKey: boolean
  watching: number
  pollIntervalMs: number
  lastPollAt: number | null
  discovery: { running: boolean; lastAt: number | null; error: string | null }
  chains: Record<string, ChainStatus>
}

export type ServerMessage =
  | {
      type: "snapshot"
      wallets: Wallet[]
      positions: PositionView[]
      status: ServerStatus
    }
  | { type: "positions"; upserts: PositionView[]; removed: string[] }
  | { type: "status"; status: ServerStatus }
  | { type: "wallets"; wallets: Wallet[] }

export type Connection = "connecting" | "open" | "closed"
