import type { Wallet } from "./types"

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error ?? `요청 실패 (${response.status})`)
  return body as T
}

export const api = {
  addWallet: (address: string, label: string) =>
    request<{ wallets: Wallet[] }>("/api/wallets", {
      method: "POST",
      body: JSON.stringify({ address, label }),
    }),
  removeWallet: (address: string) =>
    request<{ wallets: Wallet[] }>(`/api/wallets/${address}`, {
      method: "DELETE",
    }),
  refresh: () => request<{ ok: true }>("/api/refresh", { method: "POST", body: "{}" }),
  shutdown: () => request<{ ok: true }>("/api/shutdown", { method: "POST", body: "{}" }),
}
