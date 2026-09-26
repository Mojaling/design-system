import { Card } from "@workspace/ui/components/card"
import {
  Stat,
  StatHint,
  StatLabel,
  StatValue,
} from "@workspace/ui/components/stat"

import { formatTime, formatUsd } from "@/lib/format"
import type { PositionView, ServerStatus } from "@/lib/types"

function total(values: (number | null)[]) {
  const known = values.filter((v): v is number => v != null)
  return { sum: known.reduce((a, b) => a + b, 0), missing: values.length - known.length }
}

export function Summary({
  positions,
  status,
}: {
  positions: PositionView[]
  status: ServerStatus | null
}) {
  const value = total(positions.map((p) => p.usd.value))
  const fees = total(positions.map((p) => p.usd.fees))
  const inRange = positions.filter((p) => p.inRange).length

  return (
    <Card>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Stat>
          <StatLabel>총 포지션 가치</StatLabel>
          <StatValue size="lg">{formatUsd(value.sum)}</StatValue>
          {value.missing > 0 && <StatHint>USD 가격을 모르는 포지션 {value.missing}개 제외</StatHint>}
        </Stat>
        <Stat>
          <StatLabel>미수령 수수료</StatLabel>
          <StatValue size="lg" variant={fees.sum > 0 ? "success" : "muted"}>
            {formatUsd(fees.sum)}
          </StatValue>
        </Stat>
        <Stat>
          <StatLabel>포지션</StatLabel>
          <StatValue size="lg">{positions.length}개</StatValue>
          <StatHint>
            범위 안 {inRange} · 범위 밖 {positions.length - inRange}
          </StatHint>
        </Stat>
        <Stat>
          <StatLabel>마지막 갱신</StatLabel>
          <StatValue size="lg">{formatTime(status?.lastPollAt)}</StatValue>
          <StatHint>
            {status && status.watching > 0
              ? `${status.pollIntervalMs / 1000}초마다 갱신`
              : "탭이 보일 때만 갱신"}
          </StatHint>
        </Stat>
      </div>
    </Card>
  )
}
