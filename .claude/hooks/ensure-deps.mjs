// SessionStart 훅: 새 클라우드 세션에서 node_modules가 없으면 설치한다.
// 설치가 되어 있어야 lint 훅이 동작한다.
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

if (!existsSync(path.join(projectDir, "node_modules", "eslint"))) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm"
  spawnSync(npm, ["install", "--no-audit", "--no-fund"], {
    cwd: projectDir,
    stdio: ["ignore", "ignore", "inherit"],
    shell: process.platform === "win32",
  })
}
