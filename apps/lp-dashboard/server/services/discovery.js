import { alchemyFetch } from "./rpc.js"

/** NFT API는 tokenId를 10진수 또는 0x 16진수 문자열로 준다. 10진수로 통일. */
function toDecimalId(tokenId) {
  return BigInt(String(tokenId)).toString()
}

/**
 * 지갑이 가진 포지션 NFT의 tokenId 목록 (Alchemy NFT API getNFTsForOwner).
 * v4 PositionManager는 ERC721Enumerable이 아니라서 컨트랙트로는 열거할 수 없다.
 *
 * ⚠️ 실패해도 getLogs 전체 스캔으로 대체하지 않는다 — CU가 폭발한다. 그냥 throw.
 */
export async function discoverTokenIds(chain, protocol, wallet) {
  const ids = []
  let pageKey
  do {
    const params = new URLSearchParams({
      owner: wallet,
      withMetadata: "false",
      pageSize: "100",
    })
    params.append("contractAddresses[]", protocol.positionManager)
    if (pageKey) params.set("pageKey", pageKey)
    const body = await alchemyFetch(`${chain.nftApiUrl}/getNFTsForOwner?${params}`)
    for (const nft of body.ownedNfts ?? []) {
      if (nft.tokenId != null) ids.push(toDecimalId(nft.tokenId))
    }
    pageKey = body.pageKey
  } while (pageKey)
  return ids
}
