import { CHAINS } from "../config/chains.js"
import { transferEvent } from "../config/contracts.js"
import { log } from "../lib/log.js"
import { createWsClient } from "./rpc.js"

/**
 * PositionManager의 Transfer 이벤트를 WebSocket으로 구독한다.
 * - to=내 지갑: 새 LP가 생기거나 들어오면 즉시 표시
 * - from=내 지갑: 다른 지갑으로 옮겨지면 목록에서 제거
 *
 * ⚠️ poll: false — WS가 실패해도 getLogs 폴링으로 대체하지 않는다 (CU 폭발 방지).
 * ⚠️ args로 내 지갑만 구독한다 (전체 Transfer를 받지 않는다).
 */
export function createWatcher({ onTransferIn, onTransferOut }) {
  const subscriptions = new Map() // chainKey → { signature, client, stops }

  /**
   * 구독을 끊는다. closeSocket이면 연결도 닫는다.
   * (바로 다시 구독할 때 닫으면, 같은 연결을 재사용하는 새 구독까지 끊기므로 닫지 않는다.)
   */
  function stop(chainKey, { closeSocket }) {
    const sub = subscriptions.get(chainKey)
    if (!sub) return
    sub.stops.forEach((fn) => fn())
    if (closeSocket) {
      sub.client.transport
        .getRpcClient?.()
        .then((rpc) => rpc.close())
        .catch(() => {})
    }
    subscriptions.delete(chainKey)
  }

  function start(chain, wallets, signature) {
    const client = createWsClient(chain.key)
    const byAddress = new Map(
      chain.protocols.map((p) => [p.positionManager.toLowerCase(), p])
    )
    const handle = (direction) => (logs) => {
      for (const entry of logs) {
        const protocol = byAddress.get(entry.address.toLowerCase())
        const tokenId = entry.args?.tokenId
        if (!protocol || tokenId == null) continue
        const { from, to } = entry.args
        const callback = direction === "in" ? onTransferIn : onTransferOut
        callback(chain.key, protocol.id, tokenId.toString(), from, to)
      }
    }
    const onError = (error) =>
      log.warn(`${chain.name} 실시간 구독 오류:`, error.shortMessage ?? error.message)

    const common = {
      address: [...byAddress.keys()],
      abi: [transferEvent],
      eventName: "Transfer",
      poll: false,
      onError,
    }
    const stops = [
      client.watchContractEvent({ ...common, args: { to: wallets }, onLogs: handle("in") }),
      client.watchContractEvent({ ...common, args: { from: wallets }, onLogs: handle("out") }),
    ]
    subscriptions.set(chain.key, { signature, client, stops })
  }

  return {
    /** 지갑 목록이나 활성 상태가 바뀔 때마다 호출. 필요한 구독만 유지한다. */
    sync(walletAddresses, active) {
      const wallets = [...walletAddresses].map((a) => a.toLowerCase()).sort()
      const signature = active && wallets.length > 0 ? wallets.join(",") : null
      for (const chain of CHAINS) {
        if (subscriptions.get(chain.key)?.signature === signature) continue
        stop(chain.key, { closeSocket: !signature })
        if (!signature) continue
        try {
          start(chain, wallets, signature)
        } catch (error) {
          log.warn(`${chain.name} 실시간 구독 시작 실패:`, error.message)
        }
      }
    },
    stopAll() {
      for (const key of [...subscriptions.keys()]) stop(key, { closeSocket: true })
    },
  }
}
