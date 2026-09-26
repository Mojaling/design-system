// PostToolUse 훅: Claude가 파일을 고칠 때마다 그 파일만 ESLint로 검사한다.
// 위반이 있으면 exit 2로 에러를 Claude에게 돌려줘서 바로 고치게 한다.
import path from "node:path"

const LINTABLE = new Set([".ts", ".tsx", ".js", ".mjs", ".jsx"])

const input = JSON.parse(await readStdin())
const file = input.tool_input?.file_path
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

if (!file || !LINTABLE.has(path.extname(file))) process.exit(0)
if (path.relative(projectDir, file).startsWith("..")) process.exit(0)

let ESLint
try {
  ;({ ESLint } = await import("eslint"))
} catch {
  // 아직 npm install 전이면 검사하지 않는다.
  process.exit(0)
}

const eslint = new ESLint({ cwd: projectDir })
if (await eslint.isPathIgnored(file)) process.exit(0)

const results = await eslint.lintFiles([file])
const problems = results.reduce(
  (sum, r) => sum + r.errorCount + r.warningCount,
  0
)
if (problems === 0) process.exit(0)

const formatter = await eslint.loadFormatter("stylish")
process.stderr.write(
  "lint 위반이 있습니다. 아래 메시지가 알려주는 방법으로 고치세요. " +
    "eslint-disable 주석은 무시되고, lint 설정을 바꾸는 것은 사람의 승인이 필요합니다.\n" +
    (await formatter.format(results))
)
process.exit(2)

function readStdin() {
  return new Promise((resolve) => {
    let data = ""
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (chunk) => (data += chunk))
    process.stdin.on("end", () => resolve(data || "{}"))
  })
}
