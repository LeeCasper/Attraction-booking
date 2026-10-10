/**
 * 承载量分级预警的等级表（PRD 6.3.3 / 技术方案 §5.7、§5.7 的 80/90/100 三档）。
 *
 * 单独抽成纯函数有两个原因：
 *   1. 阈值现在来自 `sys_config.capacity_alarm`，要在**任务体里按次读**，
 *      不能再是 `stats.job.ts` 里的模块级常量；
 *   2. 冒烟要能脱离「在园人数必须 > 0」这个数据前置条件去断言映射关系
 *      （`smoke:m4` 的端到端触发用例在空库上本来就跑不出来）。
 *
 * ⚠️ **返回顺序是「高等级在前」，调用方依赖它**：`stats.job` 是
 * `for (...) { if (rate < lv.rate) continue; ...; break; }` —— 命中即 break，只报最高一档。
 * 改这里的顺序会让告警从「报最高档」变成「报最低档」。
 */
export interface CapacityLevel {
  /** 触发阈值（在园率） */
  rate: number;
  /** 告警类型，写进 `alarm.type` */
  type: string;
  /** 告警级别，写进 `alarm.level` */
  level: number;
  /** 写进告警文案的档位名 */
  label: string;
}

export function buildCapacityLevels(cfg: {
  warn?: unknown;
  serious?: unknown;
  critical?: unknown;
}): CapacityLevel[] {
  return [
    { rate: Number(cfg.critical ?? 1.0), type: 'capacity_100', level: 3, label: '100%' },
    { rate: Number(cfg.serious ?? 0.9), type: 'capacity_90', level: 3, label: '90%' },
    { rate: Number(cfg.warn ?? 0.8), type: 'capacity_80', level: 2, label: '80%' },
  ];
}
