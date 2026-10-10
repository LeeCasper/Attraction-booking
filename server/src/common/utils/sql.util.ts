/**
 * 查询里按景点过滤的小工具。
 *
 * **不传 `areaId` = 全部景点** —— 这是多景区下的统一口径：不传就是聚合，
 * 而不是「默认 1 号景区」。以前各处写的是 `areaId ?? 1`，把「全部」静默变成
 * 「示例山景区」，数字看着合理、其实只是一家的（看板/统计/分析/导出都踩过）。
 *
 * 为什么把「条件」和「参数」绑在一起返回：占位符顺序必须与参数顺序一致，
 * 分开拼是这类查询最容易犯又最不容易发现的错误 —— 不报错，只是数字不对。
 */
export function areaCondition(
  areaId: number | undefined,
  column: string,
): { sql: string; params: number[] } {
  // 全部景点时给一个恒真条件，WHERE 的其余部分保持原样，参数数组也不用动
  return areaId === undefined ? { sql: '1 = 1', params: [] } : { sql: `${column} = ?`, params: [areaId] };
}
