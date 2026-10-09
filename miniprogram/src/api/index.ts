import { del, get, post, put } from './request';

/**
 * 按域分组的小程序端接口。
 *
 * 类型按后端实际返回逐字对齐（都是 `{ code, msg, data }` 里的 `data`）：
 * 金额一律是**分**；`/stocks` 不含价格；`/orders` 列表**没有 items**（只有 `itemCount`），要明细得调详情。
 */

// ---------------------------------------------------------------- 景区 / 票务 / 库存

export interface MiniArea {
  id: number;
  name: string;
  coverUrl: string | null;
  openTime: string | null;
  intro: string | null;
}

export interface Announcement {
  id: number;
  title: string;
  content: string | null;
  publishedAt: string | null;
}

export interface TimeSlot {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
}

export interface AreaDetail extends MiniArea {
  address: string | null;
  maxCapacity: number;
  status: number;
  timeSlots: TimeSlot[];
  announcements: Announcement[];
}

export interface MiniTicket {
  id: number;
  name: string;
  audience: string | null;
  /** 0/1，1 表示需要实名 */
  needRealname: number;
  /** 单位：分 */
  price: number;
  refundRule: Record<string, unknown> | null;
}

export interface StockItem {
  timeSlotId: number;
  slotName: string;
  /** `HH:mm:ss` */
  startTime: string;
  endTime: string;
  available: number;
  stockId: number;
}

export const areaApi = {
  /** 免登录 */
  list: () => get<MiniArea[]>('/areas', undefined, { anonymous: true }),
  /** 免登录；含时段与公告 */
  detail: (id: number) => get<AreaDetail>(`/areas/${id}`, undefined, { anonymous: true }),
};

export const ticketApi = {
  /** 免登录；含当日价格（分） */
  list: (areaId: number, date: string) => get<MiniTicket[]>('/tickets', { areaId, date }, { anonymous: true }),
};

export const stockApi = {
  /** 免登录；分时余票 */
  byDate: (ticketTypeId: number, date: string) =>
    get<StockItem[]>('/stocks', { ticketTypeId, date }, { anonymous: true }),
};

// ---------------------------------------------------------------- 常用出行人

export interface MiniVisitor {
  id: number;
  name: string;
  /** 已脱敏，如 `110***********1234` */
  idCardMask: string;
  /** 已脱敏，如 `138****8820`；无手机号时为空串 */
  phoneMask: string;
  isDefault: boolean;
  /** 后端直接给好的「主出行人 / 同行」 */
  badge: string;
}

export interface VisitorPayload {
  name: string;
  /** **明文**身份证号，服务端会做校验位验真与脱敏 */
  idCard: string;
  /** 传空串表示清空 */
  phone?: string;
  isDefault?: boolean;
}

export const visitorApi = {
  list: () => get<MiniVisitor[]>('/visitors'),
  create: (body: VisitorPayload) => post<MiniVisitor>('/visitors', body),
  update: (id: number, body: Partial<VisitorPayload>) => put<MiniVisitor>(`/visitors/${id}`, body),
  remove: (id: number) => del<null>(`/visitors/${id}`),
};

// ---------------------------------------------------------------- 订单 / 凭证

export interface Reservation {
  id: number;
  orderId: number;
  /** `yyyy-MM-dd` */
  date: string;
  timeSlotId: number;
  status: number;
  verifyCount: number;
  totalCount: number;
}

export interface OrderSummary {
  id: number;
  orderNo: string;
  /** 单位：分 */
  amount: number;
  /** 10 待支付 / 20 已支付 / 30 部分核销 / 40 已核销 / 50 已取消 / 60 已退款 / 70 已过期 */
  status: number;
  itemCount: number;
  reservation: Reservation | null;
  createdAt: string;
}

export interface OrderItem {
  id: number;
  visitorId: number;
  /** 单位：分 */
  price: number;
  status: number;
  visitorName: string;
  /** 已脱敏 */
  visitorIdCard: string;
  ticketName: string;
}

export interface OrderDetail extends OrderSummary {
  timeSlot: TimeSlot | null;
  items: OrderItem[];
}

export interface Credential {
  /** HMAC 动态码本体 */
  token: string;
  /** 有效期（秒），服务端固定 60 */
  expiresIn: number;
  /** 建议刷新间隔（秒），服务端固定 50 */
  refreshAfter: number;
  /** `yyyy-MM-dd` */
  reservationDate: string;
  remainingCount: number;
}

export interface CreateOrderPayload {
  ticketTypeId: number;
  /** `yyyy-MM-dd` */
  date: string;
  timeSlotId: number;
  /** 每位游客：**二选一** —— 选已保存的出行人（`visitorId`）或直接录明文（`name`+`idCard`） */
  visitors: OrderVisitorInput[];
}

/**
 * 游客的两种写法。
 *
 * `{ visitorId }` 是「选一位常用出行人」——**这条路径是必需的**：
 * `GET /api/mini/visitors` 出于隐私只返回脱敏证件号，客户端手里没有明文。
 */
export type OrderVisitorInput =
  | { visitorId: number }
  | { name: string; idCard: string; phone?: string };

export interface CreateOrderResult {
  orderId: number;
  orderNo: string;
  reservationId: number;
  /** 单位：分 */
  amount: number;
  ticketName: string;
  slotName: string;
  visitorCount: number;
  payParams: { timeStamp: string; nonceStr: string; package: string; signType: string; paySign: string };
  /** true = 服务端处于微信支付模拟模式 */
  mock: boolean;
}

export const orderApi = {
  create: (body: CreateOrderPayload) => post<CreateOrderResult>('/orders', body),
  list: (status?: number) => get<OrderSummary[]>('/orders', status ? { status } : undefined),
  detail: (id: number) => get<OrderDetail>(`/orders/${id}`),
  credential: (id: number) => get<Credential>(`/orders/${id}/credential`),
  /**
   * 模拟支付成功回调（仅服务端 `WXPAY_MOCK=true` 时可用）。
   * ⚠️ orderNo 是**查询参数**不是请求体，所以拼在 URL 上。
   */
  mockPay: (orderNo: string) =>
    post<unknown>(`/pay/mock-notify?orderNo=${encodeURIComponent(orderNo)}`),
};
