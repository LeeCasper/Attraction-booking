import { request } from '../request';

// ============ 订单 ============

/** 订单列表（状态/单号/手机号/预约日期筛选，分页） */
export function fetchGetOrders(params: Api.Order.OrderSearchParams) {
  return request<Api.Common.BackendPageRecord<Api.Order.OrderRow>>({
    url: '/admin/orders',
    method: 'get',
    params
  });
}

/** 订单详情（含游客脱敏信息、支付与预约） */
export function fetchGetOrderDetail(id: number) {
  return request<Api.Order.OrderDetail>({
    url: `/admin/orders/${id}`,
    method: 'get'
  });
}

// ============ 退款 ============

/** 退款单列表 */
export function fetchGetRefunds(params: Api.Order.RefundSearchParams) {
  return request<Api.Common.BackendPageRecord<Api.Order.RefundRow>>({
    url: '/admin/refunds',
    method: 'get',
    params
  });
}

/** 退款审核（同意→调微信退款，拒绝→记录原因） */
export function fetchAuditRefund(id: number, data: Api.Order.RefundAuditPayload) {
  return request<{ status: number }>({
    url: `/admin/refunds/${id}/audit`,
    method: 'post',
    data
  });
}
