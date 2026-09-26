# design-system

디자인 시스템(`packages/ui`)과, 그걸로 만든 첫 사이트인 **LP 대시보드**(`apps/lp-dashboard`)가 들어 있는 레포입니다.

- 디자인 규칙은 문서가 아니라 **lint가 강제**합니다. AI가 틀에서 벗어나면 에러가 나고, 에러 메시지가 "대신 무엇을 쓰라"고 알려줍니다. → [docs/DESIGN-RULES.md](docs/DESIGN-RULES.md)
- 왜 이렇게 만들었는지 → [docs/DECISIONS.md](docs/DECISIONS.md)

---

## LP 대시보드

Uniswap v4 / PancakeSwap v3 LP 포지션을 **DEX 사이트를 거치지 않고 체인에서 직접** 읽어서 보여주는 내 PC 전용 대시보드입니다.
등록한 지갑의 포지션을 자동으로 찾고, 새 LP를 만들면 바로 나타납니다. **조회만 하는 앱이라 지갑 주소만 있으면 되고, 개인키는 필요 없습니다.**

지원: Ethereum · Base · BSC · Robinhood 체인의 Uniswap v4, BSC의 PancakeSwap v3

### Windows에서 처음 실행하기

1. **Node.js 설치** — <https://nodejs.org> 에서 LTS 버전을 받아 설치합니다.
2. **코드 받기** — GitHub에서 `Code → Download ZIP`으로 받아 압축을 풀거나, `git clone` 합니다.
3. **Alchemy 키 만들기** — <https://dashboard.alchemy.com> 에서 무료 가입 후 앱을 하나 만들고 API 키를 복사합니다.
   네트워크는 Ethereum, Base, BNB Smart Chain, Robinhood를 켜 두세요.
4. **설치** — `apps/lp-dashboard/windows/setup.bat`을 더블클릭합니다.
   설치가 끝나면 메모장으로 `.env` 파일이 열립니다. `ALCHEMY_API_KEY=` 뒤에 키를 붙여 넣고 저장하세요.
5. **실행** — `apps/lp-dashboard/windows/start-dashboard.bat`을 더블클릭합니다.
   창 없이 뒤에서 실행되고, 브라우저에 <http://127.0.0.1:4747> 이 열립니다.
6. 화면에서 **지갑 관리 → 주소 추가**를 하면 포지션을 찾기 시작합니다.

| 파일 (`apps/lp-dashboard/windows/`) | 하는 일 |
|---|---|
| `setup.bat` | 처음 한 번: 패키지 설치, 화면 빌드, `.env` 만들기 |
| `start-dashboard.bat` | 대시보드 켜기 (꺼지면 자동으로 다시 켬) |
| `stop-dashboard.bat` | 대시보드 끄기 (화면의 "서버 종료" 버튼과 같음) |
| `install-autostart.bat` / `uninstall-autostart.bat` | Windows 켤 때 자동 실행 켜기 / 끄기 |

코드를 새로 받았으면(업데이트) `setup.bat`을 다시 실행하세요.

### Alchemy 무료 한도(CU) 아끼는 방식

무료 티어는 한 달에 약 3천만 CU입니다. 아래 방식으로 아껴 씁니다.

- **브라우저 탭이 보일 때만** 2초마다 값을 읽습니다. 탭을 닫거나 다른 탭으로 가면 조회하지 않습니다.
- 여러 조회를 Multicall로 묶어서 한 번에 요청합니다.
- 포지션 목록은 대시보드를 열 때 한 번만 찾고, 새 LP는 실시간 알림(WebSocket)으로 받습니다.
- 유동성이 0인 포지션은 기록해 두고 다시 조회하지 않습니다.

조회 간격을 늘리거나 체인을 줄이려면 `.env`의 `POLL_INTERVAL_MS`, `ENABLED_CHAINS`를 바꾸세요. ([.env.example](apps/lp-dashboard/.env.example) 참고)

### 알아둘 점

- **처음 며칠은 숫자를 Uniswap/PancakeSwap 사이트와 몇 개 비교해 보세요.** 계산식은 공식 SDK와 대조해 검증했지만 실제 데이터로는 아직 확인 전입니다.
- 거래량이 적은 토큰의 USD 가격은 풀 가격으로 추정한 값입니다.
- 실현 APR은 **미수령 수수료** 기준입니다. 이미 수령한 수수료는 들어가지 않습니다.
- 지갑 목록·캐시·로그는 `apps/lp-dashboard/data/`에 저장되고 git에 올라가지 않습니다.

### 명령어 (개발용)

레포 루트에서 실행합니다.

| 명령 | 하는 일 |
|---|---|
| `npm install` | 패키지 설치 |
| `npm run dev` | 개발 모드 (백엔드 + 화면 자동 새로고침, <http://127.0.0.1:5173>) |
| `npm run build` / `npm start` | 화면 빌드 / 대시보드 실행 |
| `npm run check` | lint + 타입 검사 + 계산 검증 |
| `npm run verify` | 컨트랙트 주소·Alchemy API 실측 (키 필요) |
| `npm run pnl -- base uniswap-v4 <tokenId>` | 포지션 손익 분석 (넣은 수량 대비) |

데모 모드: `.env`에 `MOCK=1`을 넣고 실행하면 키 없이 가짜 데이터로 화면을 볼 수 있습니다.
