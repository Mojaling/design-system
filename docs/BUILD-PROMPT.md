# Uniswap v4 / PancakeSwap v3 LP 실시간 대시보드 — 빌드 프롬프트

> 아래 내용을 AI 코딩 어시스턴트(Claude Code 등)에게 그대로 주면 거의 동일한 대시보드를 만들 수 있습니다.
> 실제 운영에서 나온 함정과 최적화까지 포함되어 있으니 **"CU 최적화"와 "반드시 피할 함정" 섹션을 특히 지키게 하세요.**

---

## 0. 만들 것 (개요)
로컬 전용(localhost) 웹 대시보드. **DEX 프론트를 거치지 않고 온체인에서 직접** 내 LP 포지션·수수료를 실시간 조회한다. Uniswap 프론트가 버벅이거나 잔고가 틀릴 때도 체인 실제값을 정확히 보여주는 게 목적. 등록한 지갑들의 포지션을 자동 인식하고, 새 LP를 만들면 바로 뜬다.

## 1. 기술 스택
- **런타임**: Node.js (LTS), ESM(`"type":"module"`)
- **온체인**: `viem` (멀티체인 client, Multicall)
- **서버**: `express`(정적파일+REST) + `ws`(WebSocket 실시간 push)
- **프론트**: 바닐라 JS/HTML/CSS (빌드 스텝 없음)
- **RPC**: **Alchemy** (키 1개로 모든 체인). `.env`에 `ALCHEMY_API_KEY`
- 외부 가격: CoinGecko 무료 API (ETH/BNB 앵커만)

## 2. 지원 체인 (Alchemy 네트워크 슬러그)
| 체인 | chainId | 슬러그 | 네이티브 |
|---|---|---|---|
| Ethereum | 1 | eth-mainnet | ETH |
| Base | 8453 | base-mainnet | ETH |
| BSC | 56 | bnb-mainnet | BNB |
| Robinhood | 4663 | robinhood-mainnet | ETH |
- 엔드포인트: RPC `https://<슬러그>.g.alchemy.com/v2/<KEY>`, WS `wss://.../v2/<KEY>`, NFT API `https://<슬러그>.g.alchemy.com/nft/v3/<KEY>`
- 슬러그가 불확실한 체인은 `.env`로 RPC/WS/NFT URL 오버라이드 가능하게 할 것.

## 3. 지원 프로토콜 + 컨트랙트 주소
**프로토콜 어댑터 구조**: 각 체인이 `protocols[]`를 가지며 `kind`로 리더를 분기. 키 형식은 `${chainKey}:${protocolId}:${tokenId}`.

**Uniswap v4** (Base/BSC/ETH/Robinhood):
| 체인 | PositionManager | StateView |
|---|---|---|
| Ethereum | 0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e | 0x7ffe42c4a5deea5b0fec41c94c136cf115597227 |
| Base | 0x7C5f5A4bBd8fD63184577525326123B519429bDc | 0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71 |
| BSC | 0x7A4a5c919aE2541AeD11041A1AEeE68f1287f95b | 0xd13Dd3D6E93f276FAfc9Db9E6BB47C1180aeE0c4 |
| Robinhood | 0x58daec3116aae6d93017baaea7749052e8a04fa7 | 0xf3334192d15450cdd385c8b70e03f9a6bd9e673b |

**PancakeSwap v3** (BSC, Uniswap v3 포크):
- NonfungiblePositionManager: 0x46A15B0b27311cedF172AB29E4f4766fbE7F4364
- Factory: 0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865

**공통**: Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11`
- ⚠️ 주소는 반드시 실행 전 `getBytecode`로 실측 검증하는 verify 스크립트를 만들 것. 체크섬 오타 주의(BSC StateView 등).

## 4. 폴더 구조
```
src/
  index.js              엔트리(서버+폴러+워처 기동)
  config/chains.js      체인별 엔드포인트+protocols[]+USD앵커(스테이블/래핑네이티브)
  config/contracts.js   ABI (v4 PositionManager/StateView, v3 posm/factory/pool, ERC20, Transfer이벤트)
  core/                 decode(PositionInfo)·poolId(재계산)·math(TickMath/LiquidityAmounts/수수료/가격)
  services/
    rpc.js              viem client 캐시 + multiRead(Multicall) + isTransientError
    discovery.js        지갑→tokenId (Alchemy NFT API getNFTsForOwner, 프로토콜별)
    position.js         프로토콜 디스패처(kind→리더)
    readers/common.js   buildView(가격/USD/clamp/APR/복사토큰 조립) + getTokenMeta
    readers/uniswapV4.js  v4 리더
    readers/pancakeV3.js  v3 리더
    pricing.js          pool-anchored USD + quote 판별
    mintTime.js         민팅시각(APR용) getAssetTransfers 캐시
    watcher.js          WS Transfer 구독(내 지갑 대상)→신규 즉시 감지
  store.js              지갑관리+폴링 오케스트레이션+이벤트+블랙리스트
  server.js             Express(REST)+WebSocket
public/                 index.html, app.js, style.css (다크테마 카드 UI)
scripts/                verify-addresses.js, selftest.js, analyze-pnl.js
```

## 5. 온체인 조회 메커니즘 (정확히 구현할 것)
**Uniswap v4**:
1. `posm.getPoolAndPositionInfo(tokenId)` → (PoolKey, PositionInfo). PositionInfo는 packed uint256: `tickLower=int24(info>>8)`, `tickUpper=int24(info>>32)`.
2. `poolId = keccak256(abi.encode(PoolKey{currency0,currency1,fee,tickSpacing,hooks}))` — 직접 재계산(PositionInfo 내부 poolId는 truncated).
3. StateView: `getSlot0(poolId)`→sqrtPriceX96,tick / `getPositionInfo(poolId, owner=POSM주소, tickLower, tickUpper, salt=bytes32(tokenId))`→liquidity,feeGrowthLast / `getFeeGrowthInside(poolId,tickLower,tickUpper)`. **⚠️ owner는 지갑이 아니라 PositionManager 주소, salt는 tokenId.**
4. 토큰수량 = v3 `getAmountsForLiquidity(sqrtPriceX96, tickLower, tickUpper, liquidity)` (TickMath `getSqrtRatioAtTick` 정수 알고리즘).
5. 미수령수수료 = `(feeGrowthInside_now − feeGrowthInside_last) mod 2^256 × liquidity / 2^128`.

**PancakeSwap v3** (Uniswap v3 동일):
1. `posm.positions(tokenId)` → token0,token1,fee,tickLower,tickUpper,liquidity,feeGrowthInside0/1Last,tokensOwed0/1.
2. `factory.getPool(token0,token1,fee)` → pool 주소(캐시).
3. `pool.slot0/feeGrowthGlobal0X128/feeGrowthGlobal1X128/ticks(tickLower)/ticks(tickUpper)`.
4. `feeGrowthInside = global − below − above` (현재 tick 기준). 수수료 = diff×L/2^128 **+ tokensOwed**.

**포지션 탐색**: v4 PositionManager는 ERC721Enumerable 미지원 → **Alchemy NFT API `getNFTsForOwner`**(contractAddresses=PositionManager 필터)로 (체인×프로토콜×지갑) tokenId 열거.

**Multicall**: 폴링 시 여러 read를 Multicall3로 1콜에 묶어 CU 절감(미배포 체인은 개별조회 폴백).

## 6. 기능
- **지갑 관리**: 대시보드 UI에서 주소 추가/삭제, `wallets.json`에 저장(서버 재시작 없이 반영).
- **카드 UI(유니스왑 프론트 스타일, 큰 레이아웃)**: 페어명, 프로토콜/수수료/체인 뱃지, In/Out of Range, 현재가, **포지션 총액 + 토큰별 수량·USD + 구성비 바**, **획득 수수료 + 구성비 바**, **실현 APR**, **가격 범위 바**(최저/현재/최고).
- **USD 가격 (pool-anchored)**: 외부 API에 없는 DEX 롱테일 토큰 대응. 페어에 스테이블 있으면 $1 기준, WETH/WBNB면 CoinGecko로 ETH/BNB 앵커, 나머지는 풀 `sqrtPriceX96` 비율로 산출. 스테이블은 **주소 목록 + 유명 심볼(USDG/USDC/USDT/DAI/USDe 등) 폴백**으로 판별.
- **가격 방향**: 항상 "X quote = 1 base"로 표기(quote=스테이블/네이티브). 레인지 밖이면 현재가를 범위 경계로 **clamp**(극단값 폭발 방지).
- **실현 APR**: `(미수령수수료USD / 현재가치) × (365 / 보유일수)`. 보유일수는 **민팅 블록 타임스탬프**로 계산 — `alchemy_getAssetTransfers`(지갑당 1회, 파일 캐시)로 조회. ⚠️ 무료티어 `eth_getLogs`는 10블록 제한이라 못 씀.
- **CA 복사 버튼**: 카드마다 **비-quote(롱테일) 토큰의 컨트랙트주소** 복사. quote(스테이블/네이티브)는 제외.
- **포지션 열기 링크**: 카드마다 해당 DEX 포지션 페이지로 새 탭 이동하는 버튼("↗ 포지션 열기"). 대시보드에 포지션이 안 잡혀도 이 링크로 가서 수동 제거/관리 가능. 프로토콜별 URL을 config(`protocols[].posUrl(tokenId)`)에서 생성:
  - Uniswap v4: `https://app.uniswap.org/positions/v4/<slug>/<tokenId>` (slug: `ethereum`/`base`/`bnb`(BSC)/`robinhood`)
  - PancakeSwap v3: `https://pancakeswap.finance/liquidity/<tokenId>?chain=bsc`
  - payload에 `positionUrl` 문자열로 실어 프론트에서 `<a target="_blank">` 렌더.
- **실시간**: WS로 PositionManager `Transfer(to=내지갑)` 구독 → 새 LP 즉시 등장. 값은 폴링으로 갱신.
- **깜빡임 방지**: 갱신 시 카드 전체 innerHTML 교체 금지. **바뀐 텍스트/바 너비만 patch**. 순서는 실제 변할 때만 재배치.
- **서버 종료 버튼**: 대시보드 상단 버튼 → `POST /api/shutdown` → 프로세스 정상종료.

## 7. ⭐ CU 최적화 (무료 티어 필수 — 이게 핵심 노하우)
Alchemy 무료 30M CU/월(≈초당 11 CU). 아래 없으면 하루만에 소진됨:
- **탭이 보일 때만 폴링/스캔**. 브라우저가 `visibilitychange`로 visible/hidden을 WS로 전송 → 서버는 `watching>0`일 때만 조회. 탭 닫거나 백그라운드면 **CU 0**.
- **Multicall3로 read 묶기** (포지션당 콜 수 3~6배↓).
- **주기적 재탐색 금지**. 탐색은 **브라우저 접속 시 1회**(15초 디바운스) + 신규는 WS가 담당. 빠른 폴링(2초)은 **화면에 뜬 활성 포지션만** 조회.
- **죽은 포지션(유동성 0) 블랙리스트를 파일에 영구 저장** → 재시작 시 재조회 안 함.
- **일시적 오류(429/타임아웃)는 블랙리스트 금지** (`isTransientError`로 판별해 throw, null 반환 금지). 안 그러면 잠깐의 장애로 멀쩡한 포지션이 영구 삭제됨.
- **NFT API 실패 시 전체 로그 스캔(getLogs fromBlock:0) 폴백 절대 금지** — CU 폭발. WS는 `poll:false`(WS 실패 시 getLogs 폴백 차단), `args.to`로 내 지갑만 구독.

## 8. 실행/배포 (Windows, 창 없이 상시)
- `.bat` 더블클릭 → `.vbs`가 콘솔 없이 백그라운드 실행(node용 pythonw 대용) → 자동재시작 루프(정상종료 exit0면 재시작 안 함).
- ⚠️ **`.bat`/`.vbs`는 반드시 CRLF 줄바꿈** (LF면 goto/label 깨져서 실행 안 됨).
- (선택) 부팅 시 자동실행 등록 bat.

## 9. 반드시 피할 함정 (실제로 겪은 것들)
1. **Uniswap v4 flash accounting**: 스왑/LP의 한쪽 leg가 ERC20 Transfer로 안 잡힘 → 전송내역만 합산하면 틀림.
2. **무료티어 eth_getLogs 10블록 제한** → 이력 조회는 `alchemy_getAssetTransfers` 사용.
3. **StateView.getPositionInfo owner=PositionManager**(지갑 아님), salt=bytes32(tokenId). 틀리면 liquidity 0.
4. **poolId 재계산** 필수(PositionInfo 내부는 truncated).
5. **.bat CRLF** 필수.
6. **주소 체크섬** 오타(viem은 잘못된 체크섬 거부) → verify 스크립트로 실측.
7. 클립보드 복사는 **localhost=보안컨텍스트**라 정상 동작.

## 10. 보안
- API 키·프라이빗키는 **반드시 `.env`** (gitignore). 예시는 `.env.example`에 더미값.
- `wallets.json`, `dead-tokens.json`, `mint-times.json`, `dashboard.log`도 gitignore.
- 읽기 전용 대시보드(트랜잭션 실행 없음). 프라이빗키 불필요, 주소만 등록.

## 11. 검증 스크립트도 만들 것
- `verify-addresses.js`: 체인×프로토콜 컨트랙트 주소 바이트코드/뷰콜 실측.
- `selftest.js`: TickMath가 Uniswap 공식 상수와 일치하는지(오프라인, RPC 불필요) 단위 검증.

---
**한 줄 요약 프롬프트**: "Node+viem+express+ws로 Alchemy 통해 Base/BSC/ETH/Robinhood의 Uniswap v4·PancakeSwap v3 LP 포지션을 온체인 직접 조회하는 로컬 대시보드를 만들어줘. 프로토콜 어댑터 구조, 지갑 UI등록, WS 실시간 신규감지, pool-anchored USD가격, 실현 APR, CA 복사버튼 포함. CU 절약을 위해 탭 보일 때만 폴링·Multicall·주기재탐색 없음·죽은포지션 블랙리스트·일시오류는 블랙리스트 금지를 반드시 지켜. 위 상세 스펙 준수."
