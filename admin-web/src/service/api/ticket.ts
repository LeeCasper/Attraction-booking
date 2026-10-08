import { request } from '../request';

// ============ 票种 ============

/** 票种列表 */
export function fetchGetTicketTypes(params: Api.Ticket.TicketTypeSearchParams) {
  return request<Api.Ticket.TicketType[]>({
    url: '/admin/ticket-types',
    method: 'get',
    params
  });
}

/** 票种详情（含限购规则与可用时段） */
export function fetchGetTicketTypeDetail(id: number) {
  return request<Api.Ticket.TicketTypeDetail>({
    url: `/admin/ticket-types/${id}`,
    method: 'get'
  });
}

/** 新建票种 */
export function fetchCreateTicketType(data: Api.Ticket.TicketTypePayload) {
  return request<{ id: number }>({
    url: '/admin/ticket-types',
    method: 'post',
    data
  });
}

/** 修改票种 */
export function fetchUpdateTicketType(id: number, data: Partial<Api.Ticket.TicketTypePayload>) {
  return request<null>({
    url: `/admin/ticket-types/${id}`,
    method: 'put',
    data
  });
}

/** 设置限购规则 */
export function fetchUpdatePurchaseRule(id: number, data: Partial<Api.Ticket.PurchaseRule>) {
  return request<null>({
    url: `/admin/ticket-types/${id}/purchase-rule`,
    method: 'put',
    data
  });
}

/** 下架票种（软删除，保护历史订单） */
export function fetchDeleteTicketType(id: number) {
  return request<null>({
    url: `/admin/ticket-types/${id}`,
    method: 'delete'
  });
}

// ============ 时段 ============

/** 时段列表 */
export function fetchGetTimeSlots(areaId: number) {
  return request<Api.Ticket.TimeSlot[]>({
    url: '/admin/time-slots',
    method: 'get',
    params: { areaId }
  });
}

/** 新建时段 */
export function fetchCreateTimeSlot(data: Api.Ticket.TimeSlotPayload) {
  return request<{ id: number }>({
    url: '/admin/time-slots',
    method: 'post',
    data
  });
}

/** 修改时段 */
export function fetchUpdateTimeSlot(id: number, data: Partial<Api.Ticket.TimeSlotPayload>) {
  return request<null>({
    url: `/admin/time-slots/${id}`,
    method: 'put',
    data
  });
}

/** 删除时段 */
export function fetchDeleteTimeSlot(id: number) {
  return request<null>({
    url: `/admin/time-slots/${id}`,
    method: 'delete'
  });
}

// ============ 价格日历 ============

/** 价格日历查询 */
export function fetchGetPriceCalendar(params: Api.Ticket.PriceCalendarSearchParams) {
  return request<Api.Ticket.PriceCalendar[]>({
    url: '/admin/price-calendar',
    method: 'get',
    params
  });
}

/** 设置某日价格 */
export function fetchUpsertPrice(data: { ticketTypeId: number; date: string; price: number }) {
  return request<null>({
    url: '/admin/price-calendar',
    method: 'put',
    data
  });
}

/** 删除某日特殊价（回落基础价） */
export function fetchDeletePrice(ticketTypeId: number, date: string) {
  return request<null>({
    url: `/admin/price-calendar/${ticketTypeId}/${date}`,
    method: 'delete'
  });
}

// ============ 库存 ============

/** 库存查询（含已售/锁定/剩余） */
export function fetchGetStocks(params: Api.Ticket.StockSearchParams) {
  return request<Api.Ticket.TicketStock[]>({
    url: '/admin/stocks',
    method: 'get',
    params
  });
}

/** 批量生成分时库存（已有记录不覆盖） */
export function fetchGenerateStock(data: Api.Ticket.GenerateStockParams) {
  return request<{ created: number }>({
    url: '/admin/stocks/generate',
    method: 'post',
    data
  });
}

/** 手动调整库存 */
export function fetchAdjustStock(id: number, data: Api.Ticket.AdjustStockParams) {
  return request<Api.Ticket.AdjustStockResult>({
    url: `/admin/stocks/${id}/adjust`,
    method: 'put',
    data
  });
}
