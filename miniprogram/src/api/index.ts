import { del, get, post, put } from './request';

// 资源地址拼装（后台上传的封面存的是相对路径）—— 从 api 层统一出口，组件不用去够 config
export { mediaUrl } from './config';

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
  /**
   * 计价单位。`person` = 按人卖（下单金额 = 单价 × 人数），`ticket` = 按张卖。
   *
   * ⚠️ **后端目前只有 `person` 实现了计价** —— 下单是硬编码的 `单价 × 人数`。
   * 所以 `ticket` 的票种**不能放进购票流程**，否则会按人数算成错金额；
   * 客户端只把它标为「暂不支持在线预约」。完整支持按张是后续独立的一件事。
   */
  saleUnit: 'person' | 'ticket';
}

/** 实时在园情况（首页「在园率」）。口径与后台看板一致，在园人数以**闸机通行回执**为准。 */
export interface AreaPresence {
  current: number;
  maxCapacity: number;
  /** 承载率 0~1 */
  capacityRate: number;
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

/**
 * 平台信息（顶栏品牌、客服电话、版本号…）。
 *
 * 后端存在 `sys_config.platform` 里、由后台「参数配置」页维护，所以改名不需要发版。
 * 字段全部可选：配置行缺失或管理员只填了几项时，服务端也会补齐默认值，
 * 但客户端仍然按「可能缺」来用（`store/settings.ts` 里再兜一层）。
 */
export interface PlatformSettings {
  name: string;
  nameEn: string;
  subtitle: string;
  logoUrl?: string;
  contactPhone?: string;
  icp?: string;
  copyright?: string;
  /** 产品名，页脚渲染成「{name}{productName} {version}」（默认「智慧文旅」） */
  productName?: string;
  /** 版本号，自带 V 前缀 */
  version?: string;
}

export const platformApi = {
  /** 免登录；顶栏与页脚的品牌信息 */
  settings: () => get<PlatformSettings>('/platform/settings', undefined, { anonymous: true }),
};

// ---------------------------------------------------------------- 景点选择页

/**
 * 「景点选择与预约」页里一个景点的全部展示数据。
 *
 * 卡片的起价 / 今日余票 / 在园情况都不是 `scenic_area` 上的字段，所以后端专门做了
 * `GET /areas/overview` **一次取回**（逐景点各查一次就是 N+1）。
 */
export interface AreaOverview extends MiniArea {
  /** 分类：main/nature/culture/cable/night；null = 未分类（只在「全部景点」里出现） */
  category: string | null;
  presence: AreaPresence;
  /** 在线可售（按人计价）票种里的最低价，单位**分**；没有可售票种时为 null */
  minPrice: number | null;
  /** 今日分时余票之和（仅可售票种） */
  remaining: number;
  /** 有没有启用中的时段 */
  hasSlots: boolean;
  /** 可售票种里有没有要求实名的 */
  needRealname: boolean;
}

/** 全部开放景点的承载汇总（口径与后台看板「全部景区」一致：Σ在园 / Σ容量） */
export interface AreaOverviewSummary {
  current: number;
  maxCapacity: number;
  capacityRate: number;
}

export interface AreaOverviewResult {
  areas: AreaOverview[];
  summary: AreaOverviewSummary;
}

export const areaApi = {
  /** 免登录 */
  list: () => get<MiniArea[]>('/areas', undefined, { anonymous: true }),
  /**
   * 免登录；景区一览（含分类/起价/今日余票/实时在园），「景点选择」页专用。
   *
   * 与 `list()` 的区别：`list()` 只给景区基本信息（首页/购票页只需要这个），
   * 这个把每张卡片要显示的东西一次带回来，避免逐景点去查票种与库存。
   */
  overview: () => get<AreaOverviewResult>('/areas/overview', undefined, { anonymous: true }),
  /** 免登录；含时段与公告 */
  detail: (id: number) => get<AreaDetail>(`/areas/${id}`, undefined, { anonymous: true }),
  /** 免登录；实时在园情况（首页在园率用） */
  presence: (id: number) => get<AreaPresence>(`/areas/${id}/presence`, undefined, { anonymous: true }),
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
  /** 景区 id。详情不返回景区名，只有这个 id（列表接口同样） */
  scenicAreaId: number;
  /** 单位：分 */
  amount: number;
  /** 10 待支付 / 20 已支付 / 30 部分核销 / 40 已核销 / 50 已取消 / 60 已退款 / 70 已过期 */
  status: number;
  itemCount: number;
  /** 票种名。一张单只有一个票种（下单时单选） */
  ticketName: string;
  reservation: Reservation | null;
  createdAt: string;
  /**
   * 该单**最新一条退款单**的状态；没有退款记录时为 `null`。
   *
   * ⚠️ 申请退款**不会改 `status`** —— 单据仍是 20/30，只是多了一条待审的退款单。
   * 所以「退款审核中」只能看这个字段，光看 `status` 会一直显示「待入园」。
   */
  refundStatus: number | null;
}

/** 退款单（整单退时 `orderItemId` 为 null） */
export interface RefundInfo {
  id: number;
  refundNo: string;
  /** 10 待审核 / 20 退款中 / 30 已退款 / 40 已拒绝 / 50 退款失败 */
  status: number;
  /** 申请退款金额（分） */
  amount: number;
  /** 扣手续费后实退（分） */
  actualAmount: number | null;
  /** 手续费（分） */
  fee: number;
  reason: string;
  /** 审核备注（被拒时后端会写原因） */
  auditRemark: string | null;
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
  /**
   * 支付截止时间（ISO 绝对时刻，下单 + `sys_config` 的支付超时）。
   *
   * 支付页的倒计时**读它**，不在本地另起一个「15 分钟」—— 否则杀掉小程序再进来，
   * 屏幕上的剩余时间就和库存真正释放的时刻对不上了。
   * 列表接口不带这个字段（只有详情有）。
   */
  payDeadline: string;
  timeSlot: TimeSlot | null;
  items: OrderItem[];
  /** 最新一条退款单，没有则为 null */
  refund: RefundInfo | null;
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
  /** 取消订单。**仅待支付(10)可取消**，其余状态服务端返回 400 原话 */
  cancel: (id: number) => post<null>(`/orders/${id}/cancel`),
  /**
   * 提交退款申请（不是直接退款）。**仅已支付(20)可申请** ——
   * 部分核销(30)会被服务端拒（退款按整单金额算，会把已核销的票一起退掉）。
   * `reason` 服务端必填 1~255。
   */
  applyRefund: (id: number, reason: string) => post<{ refundId: number; refundNo: string; fee: number; actualAmount: number }>(`/orders/${id}/refund`, { reason }),
  /** 重新拉起支付（待支付单）。服务端**不校验状态**，调用方自己限定只在 10 时用 */
  payParams: (id: number) =>
    get<{ orderNo: string; payParams: CreateOrderResult['payParams']; mock: boolean }>(`/orders/${id}/pay-params`),
  /**
   * 模拟支付成功回调（仅服务端 `WXPAY_MOCK=true` 时可用）。
   * ⚠️ orderNo 是**查询参数**不是请求体，所以拼在 URL 上。
   */
  mockPay: (orderNo: string) =>
    post<unknown>(`/pay/mock-notify?orderNo=${encodeURIComponent(orderNo)}`),
};
