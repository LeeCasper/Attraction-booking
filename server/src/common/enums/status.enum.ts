/**
 * 状态机枚举（与设计文档 §2.3 一致，与 init.sql 各表注释对齐）
 *
 * 状态迁移必须走带前置状态校验的 UPDATE ... WHERE status = <期望前置态>。
 */

/** 订单状态 */
export enum OrderStatus {
  /** 待支付 */
  PENDING_PAY = 10,
  /** 已支付 / 待核销 */
  PAID = 20,
  /** 部分核销 */
  PARTIAL_VERIFIED = 30,
  /** 已核销 */
  VERIFIED = 40,
  /** 已取消（未支付超时/主动取消） */
  CANCELLED = 50,
  /** 已退款 */
  REFUNDED = 60,
  /** 已过期 */
  EXPIRED = 70
}

/** 订单明细（按游客）状态 */
export enum OrderItemStatus {
  /** 待核销 */
  PENDING = 10,
  /** 已核销 */
  VERIFIED = 20,
  /** 已退款 */
  REFUNDED = 30
}

/** 预约状态 */
export enum ReservationStatus {
  /** 待使用 */
  PENDING = 10,
  /** 已使用 */
  USED = 20,
  /** 已取消 */
  CANCELLED = 30,
  /** 已过期 */
  EXPIRED = 40,
  /** 已改签（原单终态） */
  RESCHEDULED = 50
}

/** 支付流水状态 */
export enum PaymentStatus {
  /** 支付中 */
  PAYING = 1,
  /** 成功 */
  SUCCESS = 2,
  /** 失败 */
  FAILED = 3,
  /** 已关闭 */
  CLOSED = 4
}

/** 退款单状态 */
export enum RefundStatus {
  /** 待审核 */
  PENDING_AUDIT = 10,
  /** 退款中 */
  REFUNDING = 20,
  /** 已退款 */
  REFUNDED = 30,
  /** 已拒绝 */
  REJECTED = 40,
  /** 退款失败（需人工处理） */
  FAILED = 50
}

/** 库存流水类型 */
export enum StockChangeType {
  MANUAL_ADD = 'manual_add',
  MANUAL_SUB = 'manual_sub',
  GENERATE = 'generate',
  REFUND_BACK = 'refund_back',
  /** 下单锁定释放（超时/取消） */
  LOCK_RELEASE = 'lock_release'
}

/** 订单渠道 */
export enum OrderChannel {
  MINI = 'mini',
  OTA = 'ota',
  WINDOW = 'window'
}
