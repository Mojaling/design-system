# 결정 사항

이 레포에서 무엇을 왜 이렇게 만들었는지 정리한 문서입니다. 새 세션에서 작업을 이어갈 때 가장 먼저 읽으세요.

## 목표

1. **디자인 시스템**을 만들고 `@shadcn/lint`로 규칙을 강제한다. AI가 UI를 만들 때 기존 틀에서 벗어나면 lint 에러가 나고, 에러 메시지가 "대신 무엇을 써라"까지 알려준다.
2. 그 디자인 시스템으로 첫 사이트인 **LP 대시보드**를 만든다. 원래 명세는 [`BUILD-PROMPT.md`](./BUILD-PROMPT.md).

## 명세에서 바꾼 것

| 항목 | 원래 명세 | 바꾼 것 | 이유 |
|---|---|---|---|
| 프론트엔드 | 바닐라 JS/HTML/CSS, 빌드 없음 | Vite + React + TypeScript + Tailwind v4 | `@shadcn/lint`는 JSX와 Tailwind 클래스만 검사한다. 바닐라로 만들면 디자인 규칙을 강제할 수 없다. |
| 깜빡임 방지 | 바뀐 텍스트만 직접 patch | React의 key 기반 렌더링 | 카드 전체를 다시 그리지 않고 바뀐 값만 DOM에 반영된다. |
| 폴더 구조 | `src/`, `public/` | 모노레포: `packages/ui` + `apps/lp-dashboard` | 디자인 시스템을 다른 사이트에서도 재사용하기 위해. |
| 실행 | `node src/index.js` | `npm run build` 후 `npm start` (Windows는 `.bat`) | 프론트 빌드 결과(`web/dist`)를 express가 제공한다. |

백엔드(온체인 조회, CU 최적화, 함정 회피)는 명세를 그대로 따른다.

## 구조

```
packages/ui/                 디자인 시스템 (@workspace/ui)
  src/styles/globals.css     색·간격·radius 토큰 (@theme). 색은 여기서만 정의
  src/components/*.tsx       cva variant가 정의된 컴포넌트
  src/lib/utils.ts           cn()
apps/lp-dashboard/           LP 대시보드
  server/                    Node(ESM) 백엔드 — 명세의 src/
  web/                       React 프론트엔드 — 명세의 public/
  scripts/                   verify-addresses, selftest, analyze-pnl
  windows/                   .bat/.vbs 실행 파일 (CRLF)
design-system.lint.json      디자인 lint 정책 (공유용)
eslint.config.mjs            ESLint 설정 (위 정책을 읽음)
```

## 도구 선택

- **패키지 매니저: npm workspaces.** Node에 기본 포함이라 따로 설치할 게 없다.
- **린터: ESLint.** `@shadcn/lint`는 Oxlint도 지원하지만 Oxlint의 JS 플러그인 API가 아직 alpha라서 ESLint로 간다. `eslint-disable` 우회를 막는 규칙(`eslint-comments/no-restricted-disable`)도 ESLint 플러그인이다.
- **TypeScript 5.9.** typescript-eslint가 아직 6.1 미만만 지원한다.

## 작업 환경

- **개발: 클라우드 세션.** 코드는 GitHub에 있어서 어느 컴퓨터에서든 이어서 작업할 수 있다.
- **실행: 본인 Windows PC.** 대시보드는 localhost에서 상시 실행하는 앱이다. 클라우드 컨테이너는 작업이 끝나면 사라진다.
- **실데이터 검증:** 클라우드 환경의 네트워크 정책이 Alchemy와 CoinGecko를 막고 있다. 검증이 필요해지면 환경 설정에서
  1. Network access 허용 도메인에 `eth-mainnet.g.alchemy.com`, `base-mainnet.g.alchemy.com`, `bnb-mainnet.g.alchemy.com`, Robinhood용 Alchemy 호스트, `api.coingecko.com` 추가
  2. 환경 변수 `ALCHEMY_API_KEY` 추가 (개발용 키를 따로 만드는 것을 권장 — 실사용 대시보드의 월 한도를 깎지 않게)

  설정은 새 세션부터 적용된다.

## 아직 확인 못 한 것

- Robinhood 체인의 chainId(4663), Alchemy 슬러그, Uniswap v4 주소 → `npm run verify` 로 실측 필요
- Alchemy NFT API와 `alchemy_getAssetTransfers`가 BSC·Robinhood에서도 지원되는지
- Windows `.bat`/`.vbs` 실행 (Linux 환경에서는 테스트 불가)
