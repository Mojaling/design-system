import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"

import { DATA_DIR } from "./env.js"

mkdirSync(DATA_DIR, { recursive: true })

export function dataPath(name) {
  return path.join(DATA_DIR, name)
}

/** JSON 파일을 읽는다. 없거나 깨졌으면 fallback. */
export function readJson(name, fallback) {
  try {
    return JSON.parse(readFileSync(dataPath(name), "utf8"))
  } catch {
    return fallback
  }
}

/** 임시 파일에 쓴 뒤 이름을 바꿔서, 쓰는 도중에 꺼져도 파일이 깨지지 않게 한다. */
export function writeJson(name, value) {
  const target = dataPath(name)
  const tmp = `${target}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2))
  renameSync(tmp, target)
}
