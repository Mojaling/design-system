import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"

import type { Connection, ServerStatus } from "@/lib/types"

export function StatusAlerts({
  status,
  connection,
}: {
  status: ServerStatus | null
  connection: Connection
}) {
  const chainErrors = status
    ? Object.values(status.chains).filter((c) => c.error)
    : []

  return (
    <>
      {connection === "closed" && (
        <Alert variant="destructive">
          <AlertTitle>서버와 연결이 끊겼습니다</AlertTitle>
          <AlertDescription>
            자동으로 다시 연결합니다. 계속 안 되면 대시보드를 다시 실행하세요.
          </AlertDescription>
        </Alert>
      )}
      {status?.mock && (
        <Alert variant="warning">
          <AlertTitle>데모 모드</AlertTitle>
          <AlertDescription>
            실제 데이터가 아닌 가짜 포지션입니다. 화면 확인용으로만 쓰세요.
          </AlertDescription>
        </Alert>
      )}
      {status && !status.hasKey && (
        <Alert variant="destructive">
          <AlertTitle>Alchemy API 키가 없습니다</AlertTitle>
          <AlertDescription>
            apps/lp-dashboard/.env 파일에 ALCHEMY_API_KEY를 넣고 대시보드를 다시 실행하세요.
          </AlertDescription>
        </Alert>
      )}
      {chainErrors.length > 0 && (
        <Alert variant="warning">
          <AlertTitle>일부 체인을 조회하지 못했습니다</AlertTitle>
          <AlertDescription>
            <ul className="flex flex-col gap-0.5">
              {chainErrors.map((c) => (
                <li key={c.name}>
                  {c.name}: {c.error}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}
