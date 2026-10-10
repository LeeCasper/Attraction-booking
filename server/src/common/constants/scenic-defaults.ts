import { DEFAULT_REFUND_RULE } from './config-defaults';

/**
 * 景点分类枚举（`scenic_area.category`）。
 *
 * 「全部景点」是**前端**的概念、不入库，所以不在这个列表里。
 * 小程序端的 `CATEGORIES`（`pages/area/behavior.ts`）与它必须逐字一致 ——
 * 对不上就会出现「点了某个分类一个景点都没有」。
 */
export const AREA_CATEGORIES = ['main', 'nature', 'culture', 'cable', 'night'] as const;

/**
 * 新建景区时「一键生成默认时段/票种/库存」用的默认值。
 *
 * **纯数据** —— `scripts/seed.ts` 会直接 import 本文件，而它跑在
 * `ts-node --transpile-only` 下且不在 `tsconfig.json` 的 `include` 里；
 * 一旦这里引入任何 Nest/TypeORM 依赖，种子脚本就会被拖进一整套装饰器元数据里。
 * （`config-defaults` 同样是纯数据，所以这条链上没有任何装饰器。）
 *
 * 放在一处的意义：种子（示例景区）与生成器（后台新建景区）**共用同一套默认值**，
 * 否则两边会慢慢漂移，出现「新建的景区和示例景区长得不一样」。
 */

/** 默认时段（与示例景区一致）。sortOrder 取数组下标 */
export const DEFAULT_TIME_SLOTS: { name: string; startTime: string; endTime: string }[] = [
  { name: '上午场 08:00-10:00', startTime: '08:00', endTime: '10:00' },
  { name: '上午场 10:00-12:00', startTime: '10:00', endTime: '12:00' },
  { name: '下午场 13:00-15:00', startTime: '13:00', endTime: '15:00' },
  { name: '下午场 15:00-17:00', startTime: '15:00', endTime: '17:00' },
];

/**
 * 默认票种（与示例景区、以及小程序设计稿上的三张票卡对齐）。
 *
 * `audience` 在小程序端被当作票卡的第二行说明文案渲染，所以直接填设计稿的副标题。
 * `saleUnit: 'ticket'` 是必须的：家庭年卡在设计稿上是 ¥388/**张**，而下单只有
 * 「单价 × 人数」一种计价，按人数算会变成 388 × 人数 —— 标成 `ticket` 后
 * 客户端据此提示「暂不支持在线预约」（见 miniprogram/src/views/booking/behavior.ts）。
 */
export const DEFAULT_TICKET_TYPES: {
  name: string;
  audience: string;
  basePrice: number;
  saleUnit: 'person' | 'ticket';
}[] = [
  { name: '成人全票', audience: '含核心景区及山水栈道通用', basePrice: 12000, saleUnit: 'person' },
  {
    name: '优待票（长者 / 学生）',
    audience: '60周岁及以上长者、全日制在读学生',
    basePrice: 6000,
    saleUnit: 'person',
  },
  {
    name: '四季家庭年卡',
    audience: '两大一小全年无限次入园 · 赠观光缆车',
    basePrice: 38800,
    saleUnit: 'ticket',
  },
];

/** 默认限购规则（A-014） */
export const DEFAULT_PURCHASE_RULE = {
  perUserPerOrder: 4,
  perUserPerDay: 5,
  perIdcardPerDay: 1,
};

/**
 * 默认退改规则：提前 1 天免手续费、窗口内 20%、过期不退（设计文档 §6.2）。
 * 与全局兜底规则同值 —— 票种自带规则会按字段覆盖 `sys_config.refund`，
 * 默认票种没理由和全局不一致。
 */
export const DEFAULT_TICKET_REFUND_RULE = DEFAULT_REFUND_RULE;

/** 一键生成库存的默认天数（含今天） */
export const DEFAULT_STOCK_DAYS = 7;

/** 一键生成库存的默认每时段张数 */
export const DEFAULT_SLOT_STOCK = 100;
