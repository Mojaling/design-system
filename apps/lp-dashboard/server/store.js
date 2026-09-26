import { EventEmitter } from "node:events"

import { getAddress, isAddress } from "viem"

import { CHAINS, parsePositionKey, positionKey } from "./config/chains.js"
import { env } from "./lib/env.js"
import { readJson, writeJson } from "./lib/files.js"
import { log } from "./lib/log.js"
import { discoverTokenIds } from "./services/discovery.js"
import { ensureMintTimes } from "./services/mintTime.js"
import { loadStatic, readViews } from "./services/position.js"
import { refreshAnchors } from "./services/pricing.js"
import { describeError } from "./services/rpc.js"
import { createWatcher } from "./services/watcher.js"

const WALLETS_FILE = "wallets.json"
const DEAD_FILE = "dead-tokens.json"

/**
 * 대시보드의 상태와 폴링을 관리한다.
 *
 * CU 절약 규칙 (BUILD-PROMPT §7):
 * - 브라우저 탭이 보일 때(watching > 0)만 폴링한다.
 * - 탐색(getNFTsForOwner)은 브라우저가 접속할 때 한 번(디바운스)만. 신규는 WS가 담당.
 * - 유동성 0인 포지션은 파일 블랙리스트에 넣고 다시 조회하지 않는다.
 * - 일시적 오류(429·타임아웃)는 블랙리스트에 넣지 않는다.
 *
 * 이벤트: "positions" { upserts, removed }, "status", "wallets"
 */
export class Store extends EventEmitter {
  constructor() {
    super()
    this.wallets = readJson(WALLETS_FILE, [])
    this.dead = new Set(readJson(DEAD_FILE, []))
    /** key → { key, chainKey, protocolId, tokenId, owner, static, view, error } */
    this.positions = new Map()
    this.clients = new Map() // id → { visible }
    this.polling = false
    this.pollTimer = null
    this.lastDiscoveryAt = 0
    this.discoveryRunning = false
    this.rerunDiscovery = false
    this.status = {
      mock: false,
      hasKey: Boolean(env.alchemyKey),
      watching: 0,
      pollIntervalMs: env.pollIntervalMs,
      lastPollAt: null,
      discovery: { running: false, lastAt: null, error: null },
      chains: Object.fromEntries(
        CHAINS.map((c) => [c.key, { name: c.name, ok: null, error: null }])
      ),
    }
    this.watcher = createWatcher({
      onTransferIn: (...args) => this.onTransferIn(...args),
      onTransferOut: (...args) => this.onTransferOut(...args),
    })
  }

  // ── 조회 ─────────────────────────────────────────────

  snapshot() {
    return {
      wallets: this.wallets,
      positions: this.views(),
      status: this.status,
    }
  }

  views() {
    return [...this.positions.values()]
      .filter((p) => p.view)
      .map((p) => ({ ...p.view, stale: Boolean(p.error), error: p.error }))
  }

  get canQuery() {
    return this.status.hasKey
  }

  // ── 브라우저 연결 ────────────────────────────────────

  clientConnected(id) {
    this.clients.set(id, { visible: false })
    this.syncActivity()
    // 탐색은 접속할 때 한 번 (디바운스). 주기적 재탐색은 하지 않는다.
    this.requestDiscovery()
  }

  clientVisibility(id, visible) {
    const client = this.clients.get(id)
    if (!client) return
    client.visible = Boolean(visible)
    this.syncActivity()
  }

  clientDisconnected(id) {
    this.clients.delete(id)
    this.syncActivity()
  }

  syncActivity() {
    const watching = [...this.clients.values()].filter((c) => c.visible).length
    const changed = watching !== this.status.watching
    this.status.watching = watching
    // 새 LP 감지(WS)는 브라우저가 연결돼 있는 동안만. 탭을 닫으면 CU 0.
    if (this.canQuery) {
      this.watcher.sync(
        this.wallets.map((w) => w.address),
        this.clients.size > 0
      )
    }
    if (watching > 0) this.schedulePoll(0)
    else this.stopPolling()
    if (changed) this.emitStatus()
  }

  // ── 지갑 관리 ────────────────────────────────────────

  addWallet(address, label = "") {
    if (!isAddress(address, { strict: false })) {
      throw new UserError("올바른 지갑 주소가 아닙니다.")
    }
    const normalized = getAddress(address.toLowerCase())
    if (this.wallets.some((w) => w.address.toLowerCase() === normalized.toLowerCase())) {
      throw new UserError("이미 등록된 지갑입니다.")
    }
    this.wallets.push({ address: normalized, label: String(label).trim().slice(0, 40) })
    writeJson(WALLETS_FILE, this.wallets)
    this.emit("wallets", this.wallets)
    this.syncActivity()
    this.requestDiscovery({ force: true, wallets: [normalized] })
  }

  removeWallet(address) {
    const lower = address.toLowerCase()
    const before = this.wallets.length
    this.wallets = this.wallets.filter((w) => w.address.toLowerCase() !== lower)
    if (this.wallets.length === before) throw new UserError("등록되지 않은 지갑입니다.")
    writeJson(WALLETS_FILE, this.wallets)
    const removed = []
    for (const [key, p] of this.positions) {
      if (p.owner.toLowerCase() === lower) {
        this.positions.delete(key)
        removed.push(key)
      }
    }
    this.emit("wallets", this.wallets)
    if (removed.length) this.emit("positions", { upserts: [], removed })
    this.syncActivity()
  }

  // ── 탐색 ─────────────────────────────────────────────

  requestDiscovery({ force = false, wallets } = {}) {
    if (!this.canQuery) return
    if (this.discoveryRunning) {
      // 탐색 중에 지갑이 추가되면 끝난 뒤 한 번 더 돈다.
      if (force) this.rerunDiscovery = true
      return
    }
    const since = Date.now() - this.lastDiscoveryAt
    if (!force && since < env.discoveryDebounceMs) return
    this.discover(wallets).catch((error) => log.error("탐색 실패:", error))
  }

  async discover(onlyWallets) {
    this.discoveryRunning = true
    this.lastDiscoveryAt = Date.now()
    this.status.discovery = { ...this.status.discovery, running: true, error: null }
    this.emitStatus()

    const wallets = onlyWallets ?? this.wallets.map((w) => w.address)
    const errors = []
    for (const chain of CHAINS) {
      for (const protocol of chain.protocols) {
        for (const wallet of wallets) {
          try {
            const ids = await discoverTokenIds(chain, protocol, wallet)
            this.reconcile(chain.key, protocol.id, wallet, ids)
            const fresh = ids.filter((id) => {
              const key = positionKey(chain.key, protocol.id, id)
              return !this.dead.has(key) && !this.positions.get(key)?.static
            })
            if (fresh.length > 0) {
              await ensureMintTimes(chain, protocol, wallet, fresh).catch((error) =>
                log.warn("민팅 시각 조회 실패:", error.message)
              )
              await this.hydrate(chain.key, protocol.id, wallet, fresh)
            }
            this.markChain(chain.key, null)
          } catch (error) {
            const message = `${chain.name} ${protocol.name}: ${describeError(error)}`
            errors.push(message)
            this.markChain(chain.key, message)
            log.warn("탐색 오류 —", message)
          }
        }
      }
    }

    this.discoveryRunning = false
    this.status.discovery = {
      running: false,
      lastAt: Date.now(),
      error: errors.length ? errors.join(" / ") : null,
    }
    this.emitStatus()
    if (this.rerunDiscovery) {
      this.rerunDiscovery = false
      this.requestDiscovery({ force: true })
    }
  }

  /**
   * NFT API 결과에 없는 기존 포지션(다른 지갑으로 옮김·소각)은 뺀다.
   * 단, 방금 WS로 감지한 포지션은 NFT API 반영이 늦을 수 있어서 10분간 유지한다.
   */
  reconcile(chainKey, protocolId, wallet, ids) {
    const owned = new Set(ids.map((id) => positionKey(chainKey, protocolId, id)))
    const recent = Date.now() - 10 * 60_000
    const removed = []
    for (const [key, p] of this.positions) {
      if (
        !(p.detectedAt > recent) &&
        p.chainKey === chainKey &&
        p.protocolId === protocolId &&
        p.owner.toLowerCase() === wallet.toLowerCase() &&
        !owned.has(key)
      ) {
        this.positions.delete(key)
        removed.push(key)
      }
    }
    if (removed.length) this.emit("positions", { upserts: [], removed })
  }

  /** 새 포지션: 고정 정보를 읽고 첫 값을 계산한다. */
  async hydrate(chainKey, protocolId, owner, tokenIds, { detected = false } = {}) {
    await refreshAnchors()
    for (const tokenId of tokenIds) {
      const key = positionKey(chainKey, protocolId, tokenId)
      if (!this.positions.has(key)) {
        this.positions.set(key, {
          key,
          chainKey,
          protocolId,
          tokenId,
          owner,
          static: null,
          view: null,
          error: null,
          detectedAt: detected ? Date.now() : 0,
        })
      }
    }
    await this.refreshGroup(chainKey, protocolId, tokenIds)
  }

  // ── 폴링 ─────────────────────────────────────────────

  schedulePoll(delay = env.pollIntervalMs) {
    if (this.pollTimer || this.status.watching === 0 || !this.canQuery) return
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null
      this.poll()
    }, delay)
  }

  stopPolling() {
    clearTimeout(this.pollTimer)
    this.pollTimer = null
  }

  async poll() {
    if (this.polling || this.status.watching === 0) return
    this.polling = true
    try {
      await refreshAnchors()
      const groups = new Map()
      for (const p of this.positions.values()) {
        const group = `${p.chainKey}:${p.protocolId}`
        if (!groups.has(group)) groups.set(group, [])
        groups.get(group).push(p.tokenId)
      }
      await Promise.all(
        [...groups].map(([group, tokenIds]) => {
          const [chainKey, protocolId] = group.split(":")
          return this.refreshGroup(chainKey, protocolId, tokenIds)
        })
      )
      this.status.lastPollAt = Date.now()
      this.emitStatus()
    } catch (error) {
      log.error("폴링 오류:", error)
    } finally {
      this.polling = false
      this.schedulePoll()
    }
  }

  /** 한 체인·프로토콜의 포지션들을 읽고, 바뀐 것만 내보낸다. */
  async refreshGroup(chainKey, protocolId, tokenIds) {
    const entries = tokenIds
      .map((id) => this.positions.get(positionKey(chainKey, protocolId, id)))
      .filter(Boolean)
    if (entries.length === 0) return

    const upserts = []
    const removed = []
    try {
      // 1) 고정 정보가 없는 것부터 읽는다.
      const needStatic = entries.filter((p) => !p.static)
      if (needStatic.length > 0) {
        const statics = await loadStatic(chainKey, protocolId, needStatic.map((p) => p.tokenId))
        for (const p of needStatic) {
          const s = statics.get(p.tokenId)
          if (s?.dead) {
            this.markDead(p.key)
            removed.push(p.key)
          } else if (s?.error || !s) {
            p.error = s?.error ?? "조회 실패"
          } else {
            p.static = s
          }
        }
      }

      // 2) 현재 값
      const ready = entries.filter((p) => p.static && this.positions.has(p.key))
      if (ready.length > 0) {
        const results = await readViews(
          chainKey,
          protocolId,
          ready.map((p) => ({ tokenId: p.tokenId, owner: p.owner, static: p.static }))
        )
        for (const p of ready) {
          const r = results.get(p.tokenId)
          if (!r || r.error) {
            const changed = p.error !== (r?.error ?? "조회 실패")
            p.error = r?.error ?? "조회 실패"
            if (changed && p.view) upserts.push(p.key)
            continue
          }
          // 유동성도 수수료도 0이면 죽은 포지션 → 블랙리스트
          if (r.liquidity === 0n && r.fees === 0n) {
            this.markDead(p.key)
            removed.push(p.key)
            continue
          }
          const before = p.view && JSON.stringify(p.view)
          const hadError = Boolean(p.error)
          p.view = r.view
          p.error = null
          if (hadError || before !== JSON.stringify(p.view)) upserts.push(p.key)
        }
      }
      this.markChain(chainKey, null)
    } catch (error) {
      // 일시적 오류든 아니든 블랙리스트에는 넣지 않는다. 마지막 값을 유지하고 표시만 한다.
      const message = describeError(error)
      this.markChain(chainKey, message)
      for (const p of entries) {
        if (!p.error && p.view) upserts.push(p.key)
        p.error = `${message} (마지막 값을 표시 중)`
      }
      log.warn(`${chainKey}:${protocolId} 조회 실패 —`, message)
    }

    for (const key of removed) this.positions.delete(key)
    const views = upserts
      .map((key) => this.positions.get(key))
      .filter((p) => p?.view)
      .map((p) => ({ ...p.view, stale: Boolean(p.error), error: p.error }))
    if (views.length || removed.length) {
      this.emit("positions", { upserts: views, removed })
    }
  }

  markDead(key) {
    if (this.dead.has(key)) return
    this.dead.add(key)
    writeJson(DEAD_FILE, [...this.dead])
    log.info("죽은 포지션 블랙리스트 추가:", key)
  }

  markChain(chainKey, error) {
    const chain = this.status.chains[chainKey]
    if (!chain) return
    chain.ok = !error
    chain.error = error
    chain.at = Date.now()
  }

  // ── 실시간 (WS) ──────────────────────────────────────

  ownWallet(address) {
    return this.wallets.find((w) => w.address.toLowerCase() === address.toLowerCase())
  }

  /** 내 지갑 사이에서 옮겨진 경우: 목록에서 빼지 않고 소유자만 바꾼다. */
  changeOwner(key, to) {
    const p = this.positions.get(key)
    const owner = this.ownWallet(to)
    if (!p || !owner || p.owner === owner.address) return
    p.owner = owner.address
    if (p.view) {
      p.view = { ...p.view, owner: owner.address }
      this.emit("positions", { upserts: [{ ...p.view, stale: Boolean(p.error), error: p.error }], removed: [] })
    }
  }

  onTransferIn(chainKey, protocolId, tokenId, from, to) {
    const key = positionKey(chainKey, protocolId, tokenId)
    const owner = this.ownWallet(to)
    if (!owner) return
    if (this.positions.has(key)) return this.changeOwner(key, to)
    // 같은 NFT가 다시 들어왔다면 블랙리스트에서 빼고 다시 본다.
    if (this.dead.delete(key)) writeJson(DEAD_FILE, [...this.dead])
    log.info("새 포지션 감지:", key)
    const chain = CHAINS.find((c) => c.key === chainKey)
    const protocol = chain?.protocols.find((p) => p.id === protocolId)
    ensureMintTimes(chain, protocol, owner.address, [tokenId])
      .catch((error) => log.warn("민팅 시각 조회 실패:", error.message))
      .finally(() =>
        this.hydrate(chainKey, protocolId, owner.address, [tokenId], { detected: true })
      )
      .catch((error) => log.error("새 포지션 조회 실패:", error))
  }

  onTransferOut(chainKey, protocolId, tokenId, from, to) {
    const key = positionKey(chainKey, protocolId, tokenId)
    const p = this.positions.get(key)
    if (!p || p.owner.toLowerCase() !== from.toLowerCase()) return
    if (this.ownWallet(to)) return this.changeOwner(key, to)
    this.positions.delete(key)
    this.emit("positions", { upserts: [], removed: [key] })
  }

  emitStatus() {
    this.emit("status", this.status)
  }

  shutdown() {
    this.stopPolling()
    this.watcher.stopAll()
  }
}

/** 사용자에게 그대로 보여줘도 되는 오류 */
export class UserError extends Error {}

export { parsePositionKey }
