import { Badge, type badgeVariants } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Legend, LegendItem } from "@workspace/ui/components/legend"
import { RangeBar } from "@workspace/ui/components/range-bar"
import { Separator } from "@workspace/ui/components/separator"
import { SplitBar } from "@workspace/ui/components/split-bar"
import {
  Stat,
  StatHint,
  StatLabel,
  StatValue,
} from "@workspace/ui/components/stat"
import { cn } from "@workspace/ui/lib/utils"
import type { VariantProps } from "class-variance-authority"
import { ExternalLink } from "lucide-react"

import { CopyButton } from "@/components/copy-button"
import {
  formatDays,
  formatNumber,
  formatPercent,
  formatUsd,
  shortAddress,
} from "@/lib/format"
import type { PositionView, Wallet } from "@/lib/types"

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"]

const CHAIN_BADGE: Record<string, BadgeVariant> = {
  eth: "violet",
  base: "info",
  bsc: "warning",
  robinhood: "success",
}

const PROTOCOL_BADGE: Record<string, BadgeVariant> = {
  "uniswap-v4": "primary",
  "pancake-v3": "teal",
}

/** base 비율(0~1)을 두 칸짜리 바로 */
function splitSegments(share: number | null, base: string, quote: string) {
  if (share == null) return []
  return [
    { value: share, variant: "chart-1" as const, label: base },
    { value: 1 - share, variant: "chart-2" as const, label: quote },
  ]
}

function RangeLabel({
  label,
  value,
  className,
}: {
  label: string
  value: number | null
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <span>{label}</span>
      <span className="truncate" title={String(value ?? "")}>
        {formatNumber(value, 6)}
      </span>
    </div>
  )
}

export function PositionCard({
  position: p,
  wallet,
}: {
  position: PositionView
  wallet?: Wallet
}) {
  const pair = `${p.base.symbol} / ${p.quote.symbol}`
  const hasFees = p.fees.base > 0 || p.fees.quote > 0

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 flex-col gap-2">
          <CardTitle className="truncate">{pair}</CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={PROTOCOL_BADGE[p.protocolId] ?? "default"}>
              {p.protocolName}
            </Badge>
            <Badge variant="outline">{formatNumber(p.feeTier, 4)}%</Badge>
            <Badge variant={CHAIN_BADGE[p.chainKey] ?? "default"}>{p.chainName}</Badge>
            <Badge variant={p.inRange ? "success" : "warning"}>
              {p.inRange ? "범위 안" : "범위 밖"}
            </Badge>
            {p.stale && (
              <Badge variant="destructive" title={p.error ?? undefined}>
                갱신 지연
              </Badge>
            )}
          </div>
        </div>
        <CardAction>
          {p.copyAddress && <CopyButton value={p.copyAddress} label="CA 복사" />}
          <Button asChild variant="secondary" size="sm">
            <a href={p.positionUrl} target="_blank" rel="noreferrer">
              포지션 열기
              <ExternalLink />
            </a>
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <Stat>
              <StatLabel>포지션 총액</StatLabel>
              <StatValue size="lg">{formatUsd(p.usd.value)}</StatValue>
            </Stat>
            <SplitBar segments={splitSegments(p.share.value, p.base.symbol, p.quote.symbol)} />
            <Legend>
              <LegendItem
                variant="chart-1"
                label={`${formatNumber(p.amounts.base)} ${p.base.symbol}`}
                value={formatUsd(p.usd.base)}
              />
              <LegendItem
                variant="chart-2"
                label={`${formatNumber(p.amounts.quote)} ${p.quote.symbol}`}
                value={formatUsd(p.usd.quote)}
              />
            </Legend>
          </div>

          <div className="flex flex-col gap-3">
            <Stat>
              <StatLabel>획득 수수료 (미수령)</StatLabel>
              <StatValue size="lg" variant={hasFees ? "success" : "muted"}>
                {formatUsd(p.usd.fees)}
              </StatValue>
            </Stat>
            <SplitBar segments={splitSegments(p.share.fees, p.base.symbol, p.quote.symbol)} />
            <Legend>
              <LegendItem
                variant="chart-1"
                label={`${formatNumber(p.fees.base)} ${p.base.symbol}`}
                value={formatUsd(p.usd.baseFees)}
              />
              <LegendItem
                variant="chart-2"
                label={`${formatNumber(p.fees.quote)} ${p.quote.symbol}`}
                value={formatUsd(p.usd.quoteFees)}
              />
            </Legend>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-3 gap-4">
          <Stat>
            <StatLabel>실현 APR</StatLabel>
            <StatValue variant={p.apr ? "success" : "muted"}>{formatPercent(p.apr)}</StatValue>
            <StatHint>미수령 수수료 기준</StatHint>
          </Stat>
          <Stat>
            <StatLabel>현재가</StatLabel>
            <StatValue className="truncate">{formatNumber(p.price.current, 6)}</StatValue>
            <StatHint>
              {p.quote.symbol} = 1 {p.base.symbol}
            </StatHint>
          </Stat>
          <Stat>
            <StatLabel>보유 기간</StatLabel>
            <StatValue>{formatDays(p.heldDays)}</StatValue>
          </Stat>
        </div>

        <div className="flex flex-col gap-2">
          <RangeBar value={p.price.position} variant={p.inRange ? "success" : "warning"} />
          <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground tabular-nums">
            <RangeLabel label="최저" value={p.price.lower} />
            <RangeLabel label="현재" value={p.price.clamped} className="items-center text-foreground" />
            <RangeLabel label="최고" value={p.price.upper} className="items-end" />
          </div>
        </div>
      </CardContent>

      <CardFooter>
        <span className="text-xs text-muted-foreground tabular-nums">
          #{p.tokenId} · {wallet?.label || shortAddress(p.owner)}
        </span>
      </CardFooter>
    </Card>
  )
}
