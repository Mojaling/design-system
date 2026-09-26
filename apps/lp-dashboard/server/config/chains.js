import { chainOverride, env } from "../lib/env.js"

// 주소는 모두 소문자로 둔다. 대소문자가 섞인 주소는 체크섬이 틀리면 viem이 거부하기 때문.
// 실제로 배포돼 있는지는 `npm run verify`로 확인한다.

export const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11"
export const NATIVE = "0x0000000000000000000000000000000000000000"

const uniswapV4 = (appSlug, positionManager, stateView) => ({
  id: "uniswap-v4",
  kind: "uniswapV4",
  name: "Uniswap v4",
  positionManager,
  stateView,
  posUrl: (tokenId) =>
    `https://app.uniswap.org/positions/v4/${appSlug}/${tokenId}`,
})

const pancakeV3 = {
  id: "pancake-v3",
  kind: "pancakeV3",
  name: "PancakeSwap v3",
  positionManager: "0x46a15b0b27311cedf172ab29e4f4766fbe7f4364",
  factory: "0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865",
  posUrl: (tokenId) =>
    `https://pancakeswap.finance/liquidity/${tokenId}?chain=bsc`,
}

const ALL_CHAINS = [
  {
    key: "eth",
    name: "Ethereum",
    chainId: 1,
    alchemySlug: "eth-mainnet",
    native: { symbol: "ETH", coingeckoId: "ethereum" },
    wrappedNative: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    stables: [
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
      "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
      "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
      "0x4c9edd5852cd905f086c759e8383e09bff1e68b3", // USDe
      "0xdc035d45d973e3ec169d2276ddab16f1e407384f", // USDS
      "0x6c3ea9036406852006290770bedfcaba0e23a0e8", // PYUSD
    ],
    protocols: [
      uniswapV4(
        "ethereum",
        "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e",
        "0x7ffe42c4a5deea5b0fec41c94c136cf115597227"
      ),
    ],
  },
  {
    key: "base",
    name: "Base",
    chainId: 8453,
    alchemySlug: "base-mainnet",
    native: { symbol: "ETH", coingeckoId: "ethereum" },
    wrappedNative: "0x4200000000000000000000000000000000000006",
    stables: [
      "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC
      "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", // USDbC
      "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", // DAI
      "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2", // USDT
    ],
    protocols: [
      uniswapV4(
        "base",
        "0x7c5f5a4bbd8fd63184577525326123b519429bdc",
        "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71"
      ),
    ],
  },
  {
    key: "bsc",
    name: "BSC",
    chainId: 56,
    alchemySlug: "bnb-mainnet",
    native: { symbol: "BNB", coingeckoId: "binancecoin" },
    wrappedNative: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
    stables: [
      "0x55d398326f99059ff775485246999027b3197955", // USDT
      "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", // USDC
      "0xe9e7cea3dedca5984780bafc599bd69add087d56", // BUSD
      "0xc5f0f7b66764f6ec8c8dff7ba683102295e16409", // FDUSD
    ],
    protocols: [
      uniswapV4(
        "bnb",
        "0x7a4a5c919ae2541aed11041a1aeee68f1287f95b",
        "0xd13dd3d6e93f276fafc9db9e6bb47c1180aee0c4"
      ),
      pancakeV3,
    ],
  },
  {
    key: "robinhood",
    name: "Robinhood",
    chainId: 4663,
    alchemySlug: "robinhood-mainnet",
    native: { symbol: "ETH", coingeckoId: "ethereum" },
    // 확인되지 않음: 래핑 ETH·스테이블 주소는 심볼 폴백으로 판별한다.
    wrappedNative: null,
    stables: [],
    protocols: [
      uniswapV4(
        "robinhood",
        "0x58daec3116aae6d93017baaea7749052e8a04fa7",
        "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b"
      ),
    ],
  },
]

function withEndpoints(chain) {
  const key = env.alchemyKey
  const host = `${chain.alchemySlug}.g.alchemy.com`
  return {
    ...chain,
    rpcUrl: chainOverride("RPC_URL", chain.key) ?? `https://${host}/v2/${key}`,
    wsUrl: chainOverride("WS_URL", chain.key) ?? `wss://${host}/v2/${key}`,
    nftApiUrl:
      chainOverride("NFT_API_URL", chain.key) ?? `https://${host}/nft/v3/${key}`,
  }
}

export const CHAINS = ALL_CHAINS.filter(
  (c) => env.enabledChains.length === 0 || env.enabledChains.includes(c.key)
).map(withEndpoints)

export function getChain(key) {
  const chain = CHAINS.find((c) => c.key === key)
  if (!chain) throw new Error(`알 수 없는 체인: ${key}`)
  return chain
}

export function getProtocol(chainKey, protocolId) {
  const protocol = getChain(chainKey).protocols.find((p) => p.id === protocolId)
  if (!protocol) throw new Error(`알 수 없는 프로토콜: ${chainKey}:${protocolId}`)
  return protocol
}

/** 포지션 키: `${chainKey}:${protocolId}:${tokenId}` */
export function positionKey(chainKey, protocolId, tokenId) {
  return `${chainKey}:${protocolId}:${tokenId}`
}

export function parsePositionKey(key) {
  const [chainKey, protocolId, tokenId] = key.split(":")
  return { chainKey, protocolId, tokenId }
}
