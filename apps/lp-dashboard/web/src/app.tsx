import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { LoaderCircle, Power, RefreshCw, Wallet as WalletIcon } from "lucide-react"
import { useState } from "react"

import { LoadingCards } from "@/components/loading-cards"
import { PositionCard } from "@/components/position-card"
import { StatusAlerts } from "@/components/status-alerts"
import { Summary } from "@/components/summary"
import { WalletPanel } from "@/components/wallet-panel"
import { useDashboard } from "@/hooks/use-dashboard"
import { useStableOrder } from "@/hooks/use-stable-order"
import { api } from "@/lib/api"

const CONNECTION_BADGE = {
  open: { variant: "success", text: "실시간" },
  connecting: { variant: "default", text: "연결 중" },
  closed: { variant: "destructive", text: "연결 끊김" },
} as const

export function App() {
  const { connection, loaded, wallets, positions, status } = useDashboard()
  const ordered = useStableOrder([...positions.values()])
  const [showWallets, setShowWallets] = useState(false)
  const [stopped, setStopped] = useState(false)

  const walletByAddress = new Map(wallets.map((w) => [w.address.toLowerCase(), w]))
  const discovering = status?.discovery.running ?? false
  const badge = CONNECTION_BADGE[connection]

  const shutdown = async () => {
    if (!window.confirm("대시보드 서버를 종료할까요? 다시 켜려면 실행 파일을 다시 실행해야 합니다.")) return
    await api.shutdown().catch(() => {})
    setStopped(true)
  }

  if (stopped) {
    return (
      <main className="mx-auto flex min-h-svh max-w-md items-center px-4">
        <Card className="w-full">
          <CardHeader>
            <div className="flex flex-col gap-1">
              <CardTitle>서버를 종료했습니다</CardTitle>
              <CardDescription>이 탭은 닫아도 됩니다.</CardDescription>
            </div>
          </CardHeader>
        </Card>
      </main>
    )
  }

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">LP 대시보드</h1>
            <Badge variant={badge.variant}>{badge.text}</Badge>
            {discovering && (
              <Badge variant="info">
                <LoaderCircle className="animate-spin" />
                포지션 찾는 중
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            DEX 사이트를 거치지 않고 체인에서 직접 읽은 LP 포지션
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={discovering}
            onClick={() => api.refresh()}
            title="지갑의 포지션 목록을 다시 찾습니다"
          >
            <RefreshCw />
            다시 찾기
          </Button>
          <Button
            variant={showWallets ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowWallets((v) => !v)}
          >
            <WalletIcon />
            지갑 관리
          </Button>
          <Button variant="ghost" size="sm" onClick={shutdown}>
            <Power />
            서버 종료
          </Button>
        </div>
      </header>

      <StatusAlerts status={status} connection={connection} />

      {(showWallets || (loaded && wallets.length === 0)) && <WalletPanel wallets={wallets} />}

      {loaded && wallets.length > 0 && <Summary positions={ordered} status={status} />}

      <section className="grid gap-4 lg:grid-cols-2">
        {!loaded && <LoadingCards />}
        {loaded && ordered.length === 0 && wallets.length > 0 && discovering && <LoadingCards />}
        {ordered.map((position) => (
          <PositionCard
            key={position.key}
            position={position}
            wallet={walletByAddress.get(position.owner.toLowerCase())}
          />
        ))}
      </section>

      {loaded && ordered.length === 0 && wallets.length > 0 && !discovering && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-1">
              <CardTitle>표시할 포지션이 없습니다</CardTitle>
              <CardDescription>
                등록한 지갑에 유동성이 있는 Uniswap v4 / PancakeSwap v3 포지션이 없거나, 아직 찾는
                중입니다. 새로 LP를 만들면 자동으로 나타납니다.
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      )}
    </main>
  )
}
