import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Plus, Trash2 } from "lucide-react"
import { useState, type FormEvent } from "react"

import { api } from "@/lib/api"
import type { Wallet } from "@/lib/types"

export function WalletPanel({ wallets }: { wallets: Wallet[] }) {
  const [address, setAddress] = useState("")
  const [label, setLabel] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await task()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const ok = await run(() => api.addWallet(address.trim(), label.trim()))
    if (ok) {
      setAddress("")
      setLabel("")
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle>지갑</CardTitle>
          <CardDescription>
            주소만 등록합니다. 개인키나 시드 문구는 절대 필요하지 않습니다.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {wallets.length > 0 && (
          <ul className="flex flex-col divide-y divide-border">
            {wallets.map((wallet) => (
              <li
                key={wallet.address}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="flex min-w-0 flex-col">
                  {wallet.label && (
                    <span className="text-sm font-medium">{wallet.label}</span>
                  )}
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {wallet.address}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${wallet.label || wallet.address} 삭제`}
                  disabled={busy}
                  onClick={() => run(() => api.removeWallet(wallet.address))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Label className="flex-1 flex-col items-stretch">
              지갑 주소
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
                autoComplete="off"
                aria-invalid={Boolean(error)}
              />
            </Label>
            <Label className="flex-col items-stretch sm:w-44">
              이름 (선택)
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="예: 메인 지갑"
                maxLength={40}
              />
            </Label>
            <Button type="submit" disabled={busy || !address.trim()}>
              <Plus />
              추가
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </CardContent>
    </Card>
  )
}
