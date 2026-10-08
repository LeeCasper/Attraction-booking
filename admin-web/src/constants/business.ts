/**
 * 业务枚举与选项
 *
 * 服务端状态位统一以 number 返回（见 server/deploy/sql/init.sql 各表注释），
 * 与模板 mock 契约的字符串状态不同，故本文件自行定义。
 */

/** 通用启用状态：1 启用 / 2 禁用 */
export const enableStatusRecord: Record<number, string> = {
  1: '启用',
  2: '禁用'
};

export const enableStatusOptions = [
  { value: 1, label: '启用' },
  { value: 2, label: '禁用' }
];

/** 票种状态：1 上架 / 2 下架 */
export const ticketStatusRecord: Record<number, string> = {
  1: '上架',
  2: '下架'
};

/** 公告状态：1 已发布 / 2 下架 */
export const announcementStatusRecord: Record<number, string> = {
  1: '已发布',
  2: '下架'
};

/** 是否实名 */
export const needRealnameRecord: Record<number, string> = {
  0: '否',
  1: '是'
};

/** 时段状态 */
export const slotStatusRecord: Record<number, string> = enableStatusRecord;

/** 订单状态（与服务端 OrderStatus 一致） */
export const orderStatusRecord: Record<number, string> = {
  10: '待支付',
  20: '待核销',
  30: '部分核销',
  40: '已核销',
  50: '已取消',
  60: '已退款',
  70: '已过期'
};

/** 订单状态对应的标签颜色 */
export const orderStatusTagType: Record<number, UI.ThemeColor> = {
  10: 'warning',
  20: 'primary',
  30: 'primary',
  40: 'success',
  50: 'info',
  60: 'danger',
  70: 'info'
};

/** 退款单状态（与服务端 RefundStatus 一致） */
export const refundStatusRecord: Record<number, string> = {
  10: '待审核',
  20: '退款中',
  30: '已退款',
  40: '已拒绝',
  50: '退款失败'
};

/** 退款状态标签颜色 */
export const refundStatusTagType: Record<number, UI.ThemeColor> = {
  10: 'warning',
  20: 'primary',
  30: 'success',
  40: 'info',
  50: 'danger'
};

/** 订单来源渠道 */
export const orderChannelRecord: Record<string, string> = {
  mini: '小程序',
  ota: 'OTA',
  window: '窗口'
};
