// 데모 모드 (MOCK=1): RPC 없이 가짜 포지션으로 화면을 띄운다.
// 화면 확인·디자인 작업용. 계산은 실제와 같은 buildView를 거친다.

import { CHAINS, NATIVE, positionKey } from "../config/chains.js"
import { getSqrtRatioAtTick, MAX_TICK, MIN_TICK, Q96 } from "../core/math.js"
import { Store } from "../store.js"
import { setAnchorUsd } from "./pricing.js"
import { buildView } from "./readers/common.js"

const DEMO_WALLET = "0x00000000000000000000000000000000000de4a0"
const DAY = 86_400_000

const token = (address, symbol, decimals) => ({ address, symbol, decimals, isNative: address === NATIVE })

function tickForPrice(price1Per0, decimals0, decimals1) {
  const raw = price1Per0 * 10 ** (decimals1 - decimals0)
  return Math.round(Math.log(raw) / Math.log(1.0001))
}

const snap = (tick, spacing) => Math.round(tick / spacing) * spacing

/** quote 수량(원 단위)을 넣으려면 필요한 유동성 */
function liquidityForQuote(tick, tickLower, quoteRaw) {
  const sqrtP = getSqrtRatioAtTick(tick)
  const sqrtA = getSqrtRatioAtTick(tickLower)
  return (quoteRaw * Q96) / (sqrtP - sqrtA)
}

const SEEDS = [
  {
    chainKey: "base",
    protocolId: "uniswap-v4",
    tokenId: "812345",
    token0: token(NATIVE, "ETH", 18),
    token1: token("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", "USDC", 6),
    price: 3200,
    spacing: 10,
    fee: 500,
    width: 0.06,
    quote: 5_200,
    days: 12,
  },
  {
    chainKey: "base",
    protocolId: "uniswap-v4",
    tokenId: "820011",
    token0: token(NATIVE, "ETH", 18),
    token1: token("0x4ed4e862860bed51a9570b96d89af5e1b0efefed", "DEGEN", 18),
    price: 1_250_000,
    spacing: 200,
    fee: 10_000,
    width: 0.35,
    quote: 3_100_000,
    days: 3.5,
  },
  {
    chainKey: "bsc",
    protocolId: "pancake-v3",
    tokenId: "3104552",
    token0: token("0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82", "CAKE", 18),
    token1: token("0x55d398326f99059ff775485246999027b3197955", "USDT", 18),
    price: 2.35,
    spacing: 50,
    fee: 2500,
    width: 0.12,
    quote: 1_800,
    days: 30,
  },
  {
    chainKey: "bsc",
    protocolId: "uniswap-v4",
    tokenId: "45021",
    token0: token(NATIVE, "BNB", 18),
    token1: token("0x55d398326f99059ff775485246999027b3197955", "USDT", 18),
    price: 600,
    spacing: 10,
    fee: 500,
    width: 0.04,
    quote: 900,
    days: 7,
    outOfRange: true,
  },
]

export class MockStore extends Store {
  constructor() {
    super()
    this.status.mock = true
    this.status.hasKey = true
    this.watcher = { sync() {}, stopAll() {} }
    if (this.wallets.length === 0) {
      this.wallets = [{ address: DEMO_WALLET, label: "데모 지갑" }]
    }
    this.eth = 3200
    this.bnb = 600
    this.mock = new Map()
  }

  get canQuery() {
    return true
  }

  async discover() {
    this.discoveryRunning = true
    this.lastDiscoveryAt = Date.now()
    setAnchorUsd("ethereum", this.eth)
    setAnchorUsd("binancecoin", this.bnb)
    const owner = this.wallets[0].address
    const available = new Set(CHAINS.map((c) => c.key))
    for (const seed of SEEDS) {
      if (!available.has(seed.chainKey)) continue
      const key = positionKey(seed.chainKey, seed.protocolId, seed.tokenId)
      if (this.mock.has(key)) continue
      const d0 = seed.token0.decimals
      const d1 = seed.token1.decimals
      const center = tickForPrice(seed.price, d0, d1)
      const half = Math.round(Math.log(1 + seed.width) / Math.log(1.0001))
      let tickLower = snap(center - half, seed.spacing)
      let tickUpper = snap(center + half, seed.spacing)
      let tick = center
      if (seed.outOfRange) {
        tickLower = snap(center + half, seed.spacing)
        tickUpper = snap(center + 3 * half, seed.spacing)
        tick = center
      }
      const quoteRaw = BigInt(Math.round(seed.quote)) * 10n ** BigInt(d1)
      const refTick = seed.outOfRange ? Math.round((tickLower + tickUpper) / 2) : tick
      this.mock.set(key, {
        seed,
        owner,
        tick,
        tickLower,
        tickUpper,
        liquidity: liquidityForQuote(refTick, tickLower, quoteRaw),
        fees0: 0n,
        fees1: 0n,
        mintedAt: Date.now() - seed.days * DAY,
      })
      this.positions.set(key, {
        key,
        chainKey: seed.chainKey,
        protocolId: seed.protocolId,
        tokenId: seed.tokenId,
        owner,
        static: { mock: true },
        view: null,
        error: null,
      })
      // 보유 기간 동안 쌓인 수수료를 대충 채워 둔다.
      const m = this.mock.get(key)
      for (let i = 0; i < 400; i++) this.accrue(m)
    }
    this.discoveryRunning = false
    await Promise.all(
      [...new Set(SEEDS.map((s) => `${s.chainKey}:${s.protocolId}`))].map((g) => {
        const [chainKey, protocolId] = g.split(":")
        return this.refreshGroup(
          chainKey,
          protocolId,
          SEEDS.filter((s) => s.chainKey === chainKey && s.protocolId === protocolId).map((s) => s.tokenId)
        )
      })
    )
    this.status.discovery = { running: false, lastAt: Date.now(), error: null }
    this.emitStatus()
  }

  accrue(m) {
    if (m.tick < m.tickLower || m.tick >= m.tickUpper) return
    const bump = (decimals, scale) =>
      BigInt(Math.floor(Math.random() * scale * 10 ** Math.min(decimals, 12))) *
      10n ** BigInt(Math.max(0, decimals - 12))
    m.fees0 += bump(m.seed.token0.decimals, 0.00002 * (m.seed.quote / m.seed.price) / 50)
    m.fees1 += bump(m.seed.token1.decimals, 0.00002 * m.seed.quote / 50)
  }

  async refreshGroup(chainKey, protocolId, tokenIds) {
    this.eth *= 1 + (Math.random() - 0.5) * 0.0006
    this.bnb *= 1 + (Math.random() - 0.5) * 0.0006
    setAnchorUsd("ethereum", this.eth)
    setAnchorUsd("binancecoin", this.bnb)

    const upserts = []
    for (const tokenId of tokenIds) {
      const key = positionKey(chainKey, protocolId, tokenId)
      const m = this.mock.get(key)
      const p = this.positions.get(key)
      if (!m || !p) continue
      if (Math.random() < 0.6) {
        const step = Math.round((Math.random() - 0.5) * 4) * Math.max(1, m.seed.spacing / 10)
        m.tick = Math.max(MIN_TICK, Math.min(MAX_TICK, m.tick + step))
      }
      this.accrue(m)
      const view = buildView(chainKey, protocolId, {
        tokenId,
        owner: p.owner,
        token0: m.seed.token0,
        token1: m.seed.token1,
        fee: m.seed.fee,
        tickLower: m.tickLower,
        tickUpper: m.tickUpper,
        tick: m.tick,
        sqrtPriceX96: getSqrtRatioAtTick(m.tick),
        liquidity: m.liquidity,
        fees0: m.fees0,
        fees1: m.fees1,
        mintedAt: m.mintedAt,
      })
      const before = p.view && JSON.stringify(p.view)
      p.view = view
      if (before !== JSON.stringify(view)) upserts.push({ ...view, stale: false, error: null })
    }
    this.markChain(chainKey, null)
    if (upserts.length) this.emit("positions", { upserts, removed: [] })
  }
}
