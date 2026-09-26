import { hexToString } from "viem"

import { getChain, NATIVE } from "../config/chains.js"
import { erc20Abi, erc20Bytes32SymbolAbi } from "../config/contracts.js"
import { readJson, writeJson } from "../lib/files.js"
import { multiRead } from "./rpc.js"

// 토큰 이름·소수 자릿수는 바뀌지 않으므로 파일에 캐시해서 재시작 때 다시 조회하지 않는다.
const FILE = "token-meta.json"
const cache = new Map(Object.entries(readJson(FILE, {})))
let saveTimer

function save() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => writeJson(FILE, Object.fromEntries(cache)), 1_000)
}

const cacheKey = (chainKey, address) => `${chainKey}:${address.toLowerCase()}`

/** 여러 토큰의 { address, symbol, decimals, isNative }를 돌려준다. */
export async function getTokenMetas(chainKey, addresses) {
  const chain = getChain(chainKey)
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))]
  const missing = unique.filter(
    (a) => a !== NATIVE && !cache.has(cacheKey(chainKey, a))
  )

  if (missing.length > 0) {
    const results = await multiRead(
      chainKey,
      missing.flatMap((address) => [
        { address, abi: erc20Abi, functionName: "decimals" },
        { address, abi: erc20Abi, functionName: "symbol" },
      ])
    )
    const needBytes32 = []
    missing.forEach((address, i) => {
      const decimals = results[i * 2]
      const symbol = results[i * 2 + 1]
      if (decimals.status !== "success") return // 다음에 다시 시도
      const meta = { symbol: "???", decimals: Number(decimals.result) }
      if (symbol.status === "success") meta.symbol = String(symbol.result)
      else needBytes32.push(address)
      cache.set(cacheKey(chainKey, address), meta)
    })
    if (needBytes32.length > 0) {
      const fallback = await multiRead(
        chainKey,
        needBytes32.map((address) => ({
          address,
          abi: erc20Bytes32SymbolAbi,
          functionName: "symbol",
        }))
      )
      needBytes32.forEach((address, i) => {
        if (fallback[i].status !== "success") return
        const symbol = hexToString(fallback[i].result, { size: 32 }).replace(
          /\0/g,
          ""
        )
        if (symbol) cache.get(cacheKey(chainKey, address)).symbol = symbol
      })
    }
    save()
  }

  return new Map(
    unique.map((address) => {
      if (address === NATIVE) {
        return [
          address,
          { address, symbol: chain.native.symbol, decimals: 18, isNative: true },
        ]
      }
      const meta = cache.get(cacheKey(chainKey, address))
      return [address, meta ? { address, ...meta, isNative: false } : null]
    })
  )
}
