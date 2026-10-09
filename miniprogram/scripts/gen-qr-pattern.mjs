#!/usr/bin/env node
/**
 * 从设计稿的二维码 SVG 抽出方块数据 → src/components/qr-pattern.ts
 *
 * 设计稿的二维码是 <svg viewBox="0 0 100 100"> 下的 58 个 <rect>：
 * 3 个定位角（带圆角，竹青色）+ 一组数据点（深墨色）。
 *
 * 抽出来的用途：让 DynamicQr 组件以**设计稿原图案**作为初始渲染
 * （这样首屏与设计稿逐像素一致），刷新时只重排数据点、保留三个定位角。
 *
 * 用法：npm run gen:qr
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'design/reference/credential.html');
const OUT = join(ROOT, 'src/components/qr-pattern.ts');

const html = readFileSync(SRC, 'utf8');
const svgStart = html.indexOf('<svg');
const svg = html.slice(svgStart, html.indexOf('</svg>', svgStart) + 6);

/** 递归收集 rect，fill 从祖先 <g fill="..."> 继承（设计稿用它给数据点统一着色） */
const rects = [];
(function walk(src, inherited) {
  const re = /<(g|rect)([^>]*)>/g;
  let m;
  while ((m = re.exec(src))) {
    const attrs = Object.fromEntries(
      [...m[2].matchAll(/([a-zA-Z-]+)="([^"]*)"/g)].map((x) => [x[1], x[2]]),
    );
    const fill = attrs.fill || inherited;
    if (m[1] === 'rect') rects.push({ ...attrs, fill });
  }
})(svg, (svg.match(/<g[^>]*fill="([^"]+)"/) || [])[1] || '#121e1c');

// 定位角 vs 数据点：按填充色区分，而不是按尺寸。
// 设计稿的三个回字形定位角是竹青(#00685f)+白，数据点统一是深墨(<g fill="#121e1c">)。
// 用尺寸判断会把 8×8 的数据点误判成定位角。
const DATA_FILL = '#121e1c';
const finder = rects.filter((r) => (r.fill || '').toLowerCase() !== DATA_FILL);
const data = rects.filter((r) => (r.fill || '').toLowerCase() === DATA_FILL);

const num = (v, d = 0) => (v === undefined ? d : Number(v));

const out = `// =============================================================================
// 自动生成，请勿手改 —— 由 scripts/gen-qr-pattern.mjs 从设计稿的二维码 SVG 抽出
// 来源：design/reference/credential.html
// 定位角 ${finder.length} 个 + 数据点 ${data.length} 个（共 ${rects.length} 个方块，坐标系为 0–100）
// 重新生成：npm run gen:qr
// =============================================================================

export interface QrRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 圆角，按 viewBox 单位（0–100） */
  rx: number;
  fill: string;
}

/** 定位角（三个回字形），真二维码里这部分是固定的，刷新时不重排 */
export const QR_FINDER: QrRect[] = ${JSON.stringify(
  finder.map((r) => ({
    x: num(r.x),
    y: num(r.y),
    w: num(r.width),
    h: num(r.height),
    rx: num(r.rx),
    fill: r.fill,
  })),
  null,
  2,
)};

/** 数据点。首屏用设计稿原图案，刷新时按 seed 重排 */
export const QR_DATA: QrRect[] = ${JSON.stringify(
  data.map((r) => ({
    x: num(r.x),
    y: num(r.y),
    w: num(r.width),
    h: num(r.height),
    rx: num(r.rx),
    fill: r.fill,
  })),
  null,
  2,
)};
`;

writeFileSync(OUT, out);
console.log(`✓ 抽出 ${rects.length} 个方块（定位角 ${finder.length} + 数据点 ${data.length}）→ src/components/qr-pattern.ts`);
console.log(`  产物 ${(Buffer.byteLength(out) / 1024).toFixed(1)} KB`);
