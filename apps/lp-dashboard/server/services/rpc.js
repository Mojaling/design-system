import { createPublicClient, defineChain, http, webSocket } from "viem"

import { getChain, MULTICALL3 } from "../config/chains.js"

const httpClients = new Map()
const multicallSupport = new Map()

function viemChain(chain) {
  return defineChain({
    id: chain.chainId,
    name: chain.name,
    nativeCurrency: { name: chain.native.symbol, symbol: chain.native.symbol, decimals: 18 },
    rpcUrls: { default: { http: [chain.rpcUrl], webSocket: [chain.wsUrl] } },
  })
}

/** 체인별 HTTP 클라이언트 (캐시). 429 등에서 재시도를 많이 하면 CU가 늘어나므로 1회만. */
export function getClient(chainKey) {
  let client = httpClients.get(chainKey)
  if (!client) {
    const chain = getChain(chainKey)
    client = createPublicClient({
      chain: viemChain(chain),
      transport: http(chain.rpcUrl, { retryCount: 1, timeout: 15_000 }),
    })
    httpClients.set(chainKey, client)
  }
  return client
}

/**
 * WebSocket 클라이언트. keepAlive 핑(net_version)도 요청이라 끄고,
 * 끊기면 viem이 다시 연결하고 구독을 되살린다.
 */
export function createWsClient(chainKey) {
  const chain = getChain(chainKey)
  return createPublicClient({
    chain: viemChain(chain),
    transport: webSocket(chain.wsUrl, {
      keepAlive: false,
      reconnect: { attempts: 10, delay: 5_000 },
      retryCount: 1,
    }),
  })
}

/** Multicall3가 배포된 체인인지 (체인당 한 번만 확인) */
async function hasMulticall(chainKey) {
  if (!multicallSupport.has(chainKey)) {
    const check = getClient(chainKey)
      .getCode({ address: MULTICALL3 })
      .then((code) => Boolean(code && code !== "0x"))
      .catch((error) => {
        multicallSupport.delete(chainKey)
        throw error
      })
    multicallSupport.set(chainKey, check)
  }
  return multicallSupport.get(chainKey)
}

/**
 * 여러 view 호출을 Multicall3 한 번으로 묶는다. 미배포 체인은 하나씩 조회한다.
 * 결과: [{ status: "success", result } | { status: "failure", error }]
 * 요청 자체가 실패하면(429·타임아웃 등) throw 한다.
 */
export async function multiRead(chainKey, calls) {
  if (calls.length === 0) return []
  const client = getClient(chainKey)
  if (await hasMulticall(chainKey)) {
    const results = await client.multicall({
      contracts: calls,
      allowFailure: true,
      multicallAddress: MULTICALL3,
      batchSize: 0,
    })
    // allowFailure면 요청 자체가 429로 실패해도 각 호출이 "failure"로 돌아온다.
    // 그걸 영구 실패로 오해하지 않도록 여기서 다시 던진다.
    const transient = results.find(
      (r) => r.status === "failure" && isTransientError(r.error)
    )
    if (transient) throw transient.error
    return results
  }
  return Promise.all(
    calls.map((call) =>
      client.readContract(call).then(
        (result) => ({ status: "success", result }),
        (error) => {
          if (isTransientError(error)) throw error
          return { status: "failure", error }
        }
      )
    )
  )
}

/**
 * 잠깐의 장애(429, 타임아웃, 네트워크 끊김, 5xx)인지 판별한다.
 * 이런 오류로 포지션을 블랙리스트에 넣으면 멀쩡한 포지션이 영구히 사라진다.
 */
export function isTransientError(error) {
  for (let e = error; e; e = e.cause) {
    const status = e.status ?? e.statusCode
    if (status === 429 || (status >= 500 && status < 600)) return true
    if (e.code === -32005 || e.code === 429) return true
    if (
      [
        "TimeoutError",
        "HttpRequestError",
        "WebSocketRequestError",
        "SocketClosedError",
        "LimitExceededRpcError",
        "AbortError",
        "TransientError",
      ].includes(e.name)
    ) {
      return true
    }
    const text = `${e.shortMessage ?? ""} ${e.message ?? ""}`.toLowerCase()
    if (
      /rate limit|too many requests|timed? ?out|econnreset|etimedout|enotfound|eai_again|socket hang up|fetch failed|network error|compute units|exceeded .*capacity|throughput/.test(
        text
      )
    ) {
      return true
    }
  }
  return false
}

/** 사용자에게 보여줄 오류 설명 */
export function describeError(error) {
  for (let e = error; e; e = e.cause) {
    const status = e.status ?? e.statusCode
    if (status === 401 || status === 403) {
      return `Alchemy가 요청을 거부했습니다(${status}). API 키가 맞는지, Alchemy 앱에서 이 네트워크를 켰는지 확인하세요.`
    }
    if (status === 429 || e.code === 429 || e.code === -32005) {
      return "요청 한도를 넘었습니다(429). 잠시 뒤 자동으로 다시 시도합니다."
    }
  }
  if (isTransientError(error)) return `일시적 오류: ${error.shortMessage ?? error.message}`
  return error.shortMessage ?? error.message
}

export class TransientError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = "TransientError"
  }
}

/** Alchemy REST/JSON-RPC 요청. 429·5xx·네트워크 오류는 TransientError로 던진다. */
export async function alchemyFetch(url, init) {
  let response
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) })
  } catch (error) {
    throw new TransientError(`네트워크 오류: ${error.message}`, { cause: error })
  }
  if (response.status === 429 || response.status >= 500) {
    throw new TransientError(`Alchemy 응답 ${response.status}`)
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = body?.message ?? body?.error?.message
    const error = new Error(`Alchemy 응답 ${response.status}${detail ? `: ${detail}` : ""}`)
    error.status = response.status
    throw error
  }
  if (body?.error) {
    const error = new Error(`Alchemy 오류: ${body.error.message}`)
    error.code = body.error.code
    if (isTransientError(error)) throw new TransientError(error.message, { cause: error })
    throw error
  }
  return body
}
