import { useEffect, useState } from "react"

import type { PositionView } from "@/lib/types"

const RESORT_MS = 5 * 60_000

function sortKeys(positions: PositionView[]) {
  return [...positions]
    .sort((a, b) => (b.usd.value ?? -1) - (a.usd.value ?? -1) || a.key.localeCompare(b.key))
    .map((p) => p.key)
}

/**
 * 카드 순서(가치 높은 순)를 정하되, 값이 조금 바뀔 때마다 카드가 자리를 바꾸지 않도록
 * 포지션이 추가·삭제될 때와 5분마다만 다시 정렬한다.
 */
export function useStableOrder(positions: PositionView[]) {
  const [round, setRound] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setRound((r) => r + 1), RESORT_MS)
    return () => clearInterval(timer)
  }, [])

  const signature = `${round}|${positions
    .map((p) => p.key)
    .sort()
    .join(",")}`
  const [previous, setPrevious] = useState(signature)
  const [order, setOrder] = useState(() => sortKeys(positions))
  if (signature !== previous) {
    setPrevious(signature)
    setOrder(sortKeys(positions))
  }

  const byKey = new Map(positions.map((p) => [p.key, p]))
  return order.flatMap((key) => {
    const position = byKey.get(key)
    return position ? [position] : []
  })
}
