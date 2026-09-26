# AGENTS.md

AI 코딩 에이전트를 위한 작업 안내입니다. 사용자는 한국어를 쓰고 개발 초보자이므로, 설명은 쉽게 하고 전문 용어는 풀어서 말하세요.

## 이 레포

- `packages/ui` — 디자인 시스템(토큰 + 컴포넌트). 패키지 이름 `@workspace/ui`
- `apps/lp-dashboard` — Uniswap v4 / PancakeSwap v3 LP 대시보드 (백엔드 `server/`, 화면 `web/`)
- 왜 이렇게 만들었는지: [`docs/DECISIONS.md`](docs/DECISIONS.md), 원래 명세: [`docs/BUILD-PROMPT.md`](docs/BUILD-PROMPT.md)

## 명령어

| 명령 | 하는 일 |
|---|---|
| `npm run check` | lint + 타입 검사 + selftest. **작업이 끝나면 반드시 통과시킬 것** |
| `npm run lint` | 코드·디자인 규칙 검사 (경고도 실패) |
| `npm run typecheck` | TypeScript 타입 검사 |
| `npm test` | 오프라인 계산 검증(selftest) |
| `npm run dev` | 개발 서버 (백엔드 + Vite) |
| `npm run build` / `npm start` | 화면 빌드 / 대시보드 실행 |
| `npm run verify` | 컨트랙트 주소 실측 (Alchemy 키 필요) |
| `npm run pnl -- <체인> <프로토콜> <tokenId>` | 포지션 손익 분석 (Alchemy 키 필요) |

키 없이 화면을 확인하려면 `MOCK=1`로 실행한다(데모 모드, `apps/lp-dashboard/data/mock/` 사용).

## UI 작업 규칙

작업 후 `npm run lint`를 돌리고 에러를 전부 고치세요. 에러 메시지가 대신 쓸 것을 알려줍니다.
lint가 못 잡는 규칙은 [`docs/DESIGN-RULES.md`](docs/DESIGN-RULES.md)에 있습니다. 특히 토큰·variant·컴포넌트를 추가했다면 사용자에게 보고하세요.

## 백엔드 작업 규칙

[`docs/BUILD-PROMPT.md`](docs/BUILD-PROMPT.md)의 **"CU 최적화"와 "반드시 피할 함정"**을 지키세요. 요약하면:

- 브라우저 탭이 보일 때만 폴링한다. 주기적 재탐색을 하지 않는다.
- 여러 조회는 Multicall3로 묶는다.
- 일시적 오류(429, 타임아웃)는 블랙리스트에 넣지 않는다.
- NFT API가 실패해도 `getLogs(fromBlock: 0)` 전체 스캔으로 대체하지 않는다.
- v4 `StateView.getPositionInfo`의 owner는 PositionManager 주소, salt는 tokenId다.

## 보안

- 이 앱은 조회 전용이다. 개인키·시드 문구를 요구하거나 저장하는 코드를 만들지 않는다.
- API 키는 `.env`에만 둔다. `.env`, `apps/lp-dashboard/data/`(지갑 목록·캐시·로그)는 커밋하지 않는다.
- 서버는 `127.0.0.1`에만 바인딩한다.
