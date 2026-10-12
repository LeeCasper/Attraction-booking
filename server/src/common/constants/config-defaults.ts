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

/**
 * 天气（首页 banner 那一行，`modules/system/weather.service.ts`）。
 *
 * ⚠️ **默认 `provider: 'off'`（关闭）**，这是刻意的：新部署不该在运营配好密钥与地点之前
 * 就往上游打请求，更不该在首页显示一份不知道哪个城市的天气。
 * 开关就是下拉的第三个选项 —— **不另设 `enabled` 布尔量**，免得出现
 * 「provider=off 但 enabled=true」这种自相矛盾、还得猜谁赢的配置。
 *
 * 密钥（`QWEATHER_KEY` / `AMAP_KEY`）**不在库里、只在服务器 .env** ——
 * 与微信支付凭据同一套理由：进库 = 明文落库 + 进备份 + 任何有 `config:read` 的角色都能读到。
 * 两份 key 都留着，所以在后台切换数据源不用登服务器改配置。
 */
export const DEFAULT_WEATHER_CONFIG = {
  /** `off` = 不显示 | `qweather` = 和风天气 | `amap` = 高德开放平台 */
  provider: 'off',
  /**
   * 地点，两种数据源填法不同：
   *   - 和风：`经度,纬度`（如 `113.60,33.00`）
   *   - 高德：行政区编码 adcode（驻马店市 = `411700`）
   */
  location: '',
  /** 缓存分钟数（上游本身十几分钟才更新一次） */
  cacheMinutes: 10,
};
