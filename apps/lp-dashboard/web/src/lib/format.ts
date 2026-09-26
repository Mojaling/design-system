const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
})

export function formatUsd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—"
  if (value === 0) return "$0.00"
  if (Math.abs(value) < 0.01) return "<$0.01"
  if (Math.abs(value) >= 1_000_000) return usdCompact.format(value)
  return usd.format(value)
}

const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉"

/** 0.000000799 → "0.0₆799" (DEX 사이트처럼 0이 몇 개인지 아래 첨자로) */
function formatTiny(value: number, significant: number) {
  const abs = Math.abs(value)
  let zeros = -Math.floor(Math.log10(abs)) - 1
  let rounded = Math.round(abs * 10 ** (zeros + significant))
  // 9.9999e-7처럼 반올림하다 자릿수가 넘치면 0을 하나 줄인다.
  if (rounded >= 10 ** significant) {
    zeros -= 1
    rounded = Math.round(rounded / 10)
  }
  const digits = rounded.toString().replace(/0+$/, "")
  const count = [...String(zeros)].map((d) => SUBSCRIPT[Number(d)]).join("")
  return `${value < 0 ? "-" : ""}0.0${count}${digits || "0"}`
}

/** 토큰 수량·가격: 크기에 맞춰 자릿수를 고른다. 극단값은 지수 표기. */
export function formatNumber(value: number | null | undefined, significant = 5) {
  if (value == null || !Number.isFinite(value)) return "—"
  if (value === 0) return "0"
  const abs = Math.abs(value)
  if (abs >= 1e15 || abs < 1e-30) return value.toExponential(3)
  if (abs < 0.0001) return formatTiny(value, Math.min(significant, 4))
  if (abs >= 1_000_000) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(value)
  }
  if (abs >= 1) {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: Math.max(0, significant - Math.floor(Math.log10(abs)) - 1),
    }).format(value)
  }
  return new Intl.NumberFormat("en-US", {
    maximumSignificantDigits: significant,
  }).format(value)
}

export function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—"
  const percent = value * 100
  if (Math.abs(percent) >= 10_000) return `${formatNumber(percent, 3)}%`
  return `${percent.toFixed(Math.abs(percent) < 10 ? 2 : 1)}%`
}

export function formatDays(days: number | null | undefined) {
  if (days == null) return "—"
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}시간`
  return `${formatNumber(days, 3)}일`
}

export function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function formatTime(timestamp: number | null | undefined) {
  if (!timestamp) return "—"
  return new Date(timestamp).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}
