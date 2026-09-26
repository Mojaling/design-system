// Stop 훅: Claude가 작업을 끝내려 할 때, 바뀐 파일이 있으면 전체 lint를 돌린다.
// 실패하면 exit 2로 종료를 막고 에러를 보여줘서 한 번 더 고치게 한다.
// 이미 한 번 막았던 상태(stop_hook_active)라면 무한 반복을 피하려고
// 종료는 허용하되, 사용자에게 lint가 아직 실패 중이라고 알린다.
import { execFileSync } from "node:child_process"

const input = JSON.parse(await readStdin())
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

if (!hasRelevantChanges()) process.exit(0)

let ESLint
try {
  ;({ ESLint } = await import("eslint"))
} catch {
  process.exit(0)
}

const eslint = new ESLint({ cwd: projectDir })
const results = await eslint.lintFiles(["."])
const problems = results.reduce(
  (sum, r) => sum + r.errorCount + r.warningCount,
  0
)
if (problems === 0) process.exit(0)

if (input.stop_hook_active) {
  process.stdout.write(
    JSON.stringify({
      systemMessage: `lint 문제가 ${problems}개 남아 있습니다. npm run lint 로 확인하세요.`,
    })
  )
  process.exit(0)
}

const formatter = await eslint.loadFormatter("stylish")
process.stderr.write(
  "작업을 끝내기 전에 lint 위반을 고치세요. " +
    "eslint-disable 주석은 무시되고, lint 설정을 바꾸는 것은 사람의 승인이 필요합니다.\n" +
    (await formatter.format(results))
)
process.exit(2)

/** 커밋되지 않은 코드·스타일 변경이 있을 때만 검사한다. */
function hasRelevantChanges() {
  try {
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: projectDir,
      encoding: "utf8",
    })
    return status
      .split("\n")
      .some((line) => /\.(tsx?|jsx?|mjs|css|json)$/.test(line.trim()))
  } catch {
    return false
  }
}

function readStdin() {
  return new Promise((resolve) => {
    let data = ""
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (chunk) => (data += chunk))
    process.stdin.on("end", () => resolve(data || "{}"))
  })
}
