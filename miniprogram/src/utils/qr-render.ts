/**
 * 把二维码矩阵变成一张可以直接绑到 `<image>` 的图。
 *
 * ## 为什么最后落在 `<image>` 上
 *
 * 这个组件前后用过三种画法，前两种都栽在小程序端的渲染上：
 *
 * 1. **一格一个 `<view>`**：65×65 要 4000+ 个节点，直接出局。
 * 2. **一行一个 `<view>` + 硬断点 `linear-gradient`**（65 个绝对定位元素 + 每行一两千字符的样式串）：
 *    真机上**固定有一行整个不画**（第 20 行，而它在数据上毫无特别之处；Chromium 在 DPR 1/2/3 下
 *    都复现不出来）。
 * 3. **`<canvas type="2d">`**：开发者工具里画得出来，**真机上 `createSelectorQuery` 拿不到节点**，
 *    退回了降级路径。
 *
 * 于是换成最朴素的一条：**自己编一张 1 位 PNG，交给 `<image>`**。
 * 不依赖任何平台 API、不参与层级/合成打架、H5 与小程序一份代码、可离线逐像素验证。
 * 代价是没有 `<canvas>` 灵活（下面会说明色数限制）。
 *
 * ## 与设计稿的差异
 *
 * 设计稿的二维码**三个定位角是品牌青色**，这里是纯黑白 —— 1 位灰度只能两色，
 * 而换成索引色（青+黑+白）位深要 2 bit、体积翻倍。品牌色由白框本身的
 * `border-primary/30` + `ring-mist-cyan-50` 承担，观感差别很小。
 * （真要恢复青色：改成 2 bit 索引色 PNG 即可，`utils/png.ts` 里加个 PLTE 块。）
 */

import { monoPngDataUri } from './png';

/** 静默区宽度（模块数）。协议要求 4，否则扫码器找不到边界 */
export const QR_QUIET = 4;

/** 目标是这个像素尺寸上下（按格数折算成整数倍放大），和 198px 的展示框 × 常见 DPR 大致匹配 */
const TARGET_PIXELS = 480;

export interface QrRenderOptions {
  /** 静默区宽度（模块数） */
  quiet?: number;
  /** 每格的像素数。不传就按 `TARGET_PIXELS` 折算 */
  scale?: number;
}

/** 该格是否属于三个定位图形之一 */
export function isFinder(size: number, y: number, x: number): boolean {
  return (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
}

/**
 * 把矩阵（`rows[y][x] === '1'` 为深色）编成一张 PNG 的 data URI。
 *
 * 坐标口径：整块画布是 `(码点 + 静默区×2)` 个格子，码点只占中间那段。
 */
export function qrImageDataUri(
  rows: readonly string[],
  size: number,
  options: QrRenderOptions = {},
): string {
  const quiet = options.quiet ?? QR_QUIET;
  const cells = size + quiet * 2;
  const scale = options.scale ?? Math.max(4, Math.round(TARGET_PIXELS / cells));

  const grid = Array.from({ length: cells }, (_, cy) =>
    Array.from({ length: cells }, (_, cx) => {
      const my = cy - quiet;
      const mx = cx - quiet;
      return my >= 0 && my < size && mx >= 0 && mx < size && rows[my][mx] === '1';
    }),
  );

  return monoPngDataUri(scale, grid);
}
