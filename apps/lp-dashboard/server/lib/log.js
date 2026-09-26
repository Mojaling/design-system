import { appendFileSync, statSync, writeFileSync } from "node:fs"

import { dataPath } from "./files.js"

const LOG_FILE = dataPath("dashboard.log")
const MAX_BYTES = 5 * 1024 * 1024

// 로그가 너무 커지면 시작할 때 비운다.
try {
  if (statSync(LOG_FILE).size > MAX_BYTES) writeFileSync(LOG_FILE, "")
} catch {
  // 파일이 없으면 무시
}

function write(level, args) {
  const text = args
    .map((a) => (a instanceof Error ? (a.stack ?? a.message) : String(a)))
    .join(" ")
  const line = `${new Date().toISOString()} [${level}] ${text}`
  if (level === "error") console.error(line)
  else console.log(line)
  try {
    appendFileSync(LOG_FILE, `${line}\n`)
  } catch {
    // 로그 파일에 못 써도 앱은 계속 돈다.
  }
}

export const log = {
  info: (...args) => write("info", args),
  warn: (...args) => write("warn", args),
  error: (...args) => write("error", args),
}
