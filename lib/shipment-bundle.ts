/** 입고·이력·출하 묶음 이어쓰기 중에는 다른 건으로 바꾸지 않도록 URL에 붙인다. */
export const SHIPMENT_BUNDLE_QUERY = 'bundle'

export function isShipmentBundleLocked(search: string | URLSearchParams) {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search
  return params.get(SHIPMENT_BUNDLE_QUERY) === '1'
}

export function withShipmentBundle(openId: string, path: string) {
  return `${path}?open=${encodeURIComponent(openId)}&${SHIPMENT_BUNDLE_QUERY}=1`
}