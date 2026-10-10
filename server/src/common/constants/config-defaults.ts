/**
 * `sys_config` 里三条业务配置的默认值。
 *
 * 每一条都有**两个消费方**，必须同一份：种子（写进 `sys_config` 那行）
 * 与读取方的兜底（配置行缺失/字段缺失时用）。两边写字面量就会漂移，
 * 出现「库里是 0.8，代码兜底是 0.9」这种只有把配置行删掉才会暴露的问题。
 *
 * **纯数据、零依赖**（`scripts/seed.ts` 会 import 本文件）。
 */

/** 预约规则 → 下单时的支付超时（`order.service.ts`） */
export const DEFAULT_RESERVATION = {
  payTimeoutMinutes: 15,
  cancelOnTimeout: true,
};

/** 承载量分级预警阈值，按**在园率**（在园人数 / 最大承载量）（`jobs/stats.job.ts`） */
export const DEFAULT_CAPACITY_ALARM = {
  warn: 0.8,
  serious: 0.9,
  critical: 1.0,
};

/**
 * 全局退改规则（`pay.service.ts`），键名与 `ticket_type.refund_rule` **故意一致** ——
 * 票种自身的规则按字段覆盖它，两套键名对不上就会出现「票种覆盖了但没生效」。
 */
export const DEFAULT_REFUND_RULE = {
  beforeDay: 1,
  feeRate: 0.2,
  expiredNoRefund: true,
};
