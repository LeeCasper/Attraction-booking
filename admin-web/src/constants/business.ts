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

/** 通行方向 */
export const passageDirectionRecord: Record<number, string> = {
  1: '入园',
  2: '出园'
};

/** 通行结果 */
export const passageResultRecord: Record<number, string> = {
  1: '通过',
  2: '拒绝',
  3: '异常',
  4: '应急放行'
};

/** 通行结果标签颜色 */
export const passageResultTagType: Record<number, UI.ThemeColor> = {
  1: 'success',
  2: 'danger',
  3: 'warning',
  4: 'info'
};

/** 闸机方向 */
export const gateDirectionRecord: Record<number, string> = {
  1: '入口',
  2: '出口',
  3: '双向'
};

/** 闸机状态（由服务端按心跳计算 online 字段，此处仅作兜底展示） */
export const gateStatusRecord: Record<number, string> = {
  1: '在线',
  2: '离线',
  3: '禁用',
  4: '故障'
};

/** 核销渠道 */
export const verifyChannelRecord: Record<string, string> = {
  gate: '闸机',
  pda: '扫码',
  manual: '手动'
};

/** 告警类型 */
export const alarmTypeRecord: Record<string, string> = {
  gate_offline: '闸机离线',
  tailgate: '尾随',
  force_pass: '强行通过',
  duplicate_verify: '重复核销',
  offline_conflict: '离线记录冲突',
  capacity_80: '承载量 80%',
  capacity_90: '承载量 90%',
  capacity_100: '承载量 100%'
};

/** 告警等级 */
export const alarmLevelRecord: Record<number, string> = {
  1: '提示',
  2: '警告',
  3: '严重'
};

/** 告警等级标签颜色 */
export const alarmLevelTagType: Record<number, UI.ThemeColor> = {
  1: 'info',
  2: 'warning',
  3: 'danger'
};

/** 核销结果码 → 中文提示 */
export const verifyCodeRecord: Record<string, string> = {
  OK: '核销成功',
  INVALID_CREDENTIAL: '凭证无效',
  EXPIRED: '凭证已过期',
  NOT_PAID: '订单未支付',
  WRONG_DATE: '非预约日期',
  WRONG_SLOT: '不在预约时段',
  ALREADY_VERIFIED: '该票已核销',
  BLACKLIST: '证件已被限制通行',
  GATE_NO_PERMISSION: '闸机权限不符'
};
