#!/usr/bin/env node
/**
 * 生成字体样式：拉丁子集 woff2 → src/styles/fonts.scss（base64 内联）
 *
 * 背景：
 *   设计稿用 Google Fonts（Noto Serif / Plus Jakarta Sans / Space Grotesk），
 *   国内小程序既不可达、也不在白名单里，不能用 CDN 引用。
 *   ⚠️ 现在只内嵌前两套 —— Space Grotesk 已随「全站只留两套字体」退役（见 FAMILIES 上的说明）。
 *   小程序的 @font-face 又**不支持本地文件路径**，只能 base64 内联或网络地址。
 *
 * 做法：
 *   用 Google Fonts 的 &text= 参数只取设计稿实际用到的字符子集。
 *   实测设计稿全部非中日韩字符只有 51 个，子集后每个字重只有几 KB，
 *   三个字体族 × 4 个字重合计远小于主包 2MB 上限。
 *
 * 中文：不内嵌（宋体子集动辄 2–5MB，会直接撞主包上限）。
 *   中文走系统字体栈，属已知偏差，见 README。
 *
 * 用法：npm run gen:fonts
 *   需要能访问 fonts.googleapis.com / fonts.gstatic.com（本机需经代理）
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHARS_FILE = join(ROOT, 'design/latin-chars.txt');
const CACHE = join(ROOT, 'design/fonts-cache');
const OUT = join(ROOT, 'src/styles/fonts.scss');

// 全站只有两套字体（见 CLAUDE.md 约束 18）：标题宋体 + 其余正文族。
// 这里原本还有第三套 Space Grotesk（设计系统给看板 KPI 的几何展示体），已退役删掉。
// ⚠️ 仓库里现成的 `src/styles/fonts.scss` 仍带着它的 @font-face（那是联网跑出来的产物）——
// 下次联网执行 `npm run gen:fonts` 就会真正瘦掉那 ~20KB。在那之前它只是白打的体积。
const FAMILIES = [
  { css: 'Noto Serif', var: 'Noto Serif Subset', weights: [400, 600, 700] },
  { css: 'Plus Jakarta Sans', var: 'Plus Jakarta Sans Subset', weights: [400, 500, 600, 700] },
];

/** 现代 UA，否则 Google Fonts 只会返回 ttf 而不是 woff2 */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const chars = readFileSync(CHARS_FILE, 'utf8').trim();
if (!chars) {
  console.error('design/latin-chars.txt 为空');
  process.exit(1);
}

mkdirSync(CACHE, { recursive: true });

/** 走 curl（Node 的 fetch 不走 HTTPS_PROXY，本机访问 Google 必须经代理） */
function curl(url, opts = {}) {
  return execFileSync('curl', ['-sL', '--max-time', '120', ...(opts.binary ? [] : []), url], {
    encoding: opts.binary ? 'buffer' : 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, ...(opts.ua ? {} : {}) },
  });
}

/** 带 UA 的请求（Google Fonts 按 UA 决定返回 woff2 还是 ttf） */
function curlCss(url) {
  return execFileSync('curl', ['-sL', '--max-time', '120', '-A', UA, url], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
}

const faces = [];
const byUrl = new Map();
let totalBytes = 0;

for (const fam of FAMILIES) {
  const familyParam = fam.css.replace(/ /g, '+');
  const url =
    `https://fonts.googleapis.com/css2?family=${familyParam}:wght@${fam.weights.join(';')}` +
    `&text=${encodeURIComponent(chars)}&display=swap`;

  const css = curlCss(url);
  if (!css.includes('@font-face')) {
    console.error(`✗ ${fam.css} 未返回 @font-face，响应片段：${css.slice(0, 200)}`);
    process.exitCode = 1;
    continue;
  }

  // 逐段解析：每个 @font-face 附带一个 /* latin */ 注释与 font-weight
  const blocks = css.split('@font-face').slice(1);
  for (const block of blocks) {
    const weight = (block.match(/font-weight:\s*(\d+)/) || [])[1];
    // 注意：子集接口返回的是 /l/font?kit=… 形式，URL 里并没有 .woff2 后缀，
    // 必须以 format('woff2') 为准来识别
    const src = (block.match(/url\((https:[^)]+)\)\s*format\('woff2'\)/) || [])[1];
    if (!weight || !src) continue;

    const cacheFile = join(CACHE, `${familyParam}-${weight}.woff2`);
    let buf;
    if (existsSync(cacheFile)) {
      buf = readFileSync(cacheFile);
    } else {
      buf = curl(src, { binary: true });
      writeFileSync(cacheFile, buf);
    }
    // Google 对同一字体族的多个字重返回的是**同一个可变字体文件**（kit URL 完全相同）。
    // 按 URL 归并，否则同一份文件会被内嵌 3–4 遍（实测 243 KB → 57 KB）。
    const key = `${fam.var}|${src}`;
    const prev = byUrl.get(key);
    if (prev) prev.weights.push(Number(weight));
    else {
      const entry = { family: fam.var, weights: [Number(weight)], b64: buf.toString('base64'), size: buf.length, src };
      byUrl.set(key, entry);
      faces.push(entry);
    }
  }
}

if (faces.length === 0) {
  console.error('没有取到任何字体文件');
  process.exit(1);
}

const rawTotal = faces.reduce((n, f) => n + f.size, 0);
const body = faces
  .map(
    (f) => {
      const ws = f.weights.slice().sort((a, b) => a - b);
      // 可变字体：单文件覆盖一段字重，用区间语法声明
      const weightDecl = ws.length > 1 ? `${ws[0]} ${ws[ws.length - 1]}` : `${ws[0]}`;
      return (
      `@font-face {\n` +
      `  font-family: '${f.family}';\n` +
      `  font-style: normal;\n` +
      `  font-weight: ${weightDecl};\n` +
      `  font-display: swap;\n` +
      `  src: url('data:font/woff2;base64,${f.b64}') format('woff2');\n` +
      `}`
      );
    },
  )
  .join('\n\n');

const header = `// =============================================================================
// 自动生成，请勿手改 —— 由 scripts/gen-fonts.mjs 产出
// 来源：Google Fonts 的拉丁子集（仅设计稿实际用到的字符，见 design/latin-chars.txt）
// 字符数：${chars.length}    字体文件：${faces.length} 个    原始体积：${(rawTotal / 1024).toFixed(1)} KB
// 缓存：design/fonts-cache/    重新生成：npm run gen:fonts
//
// 中文不在此列 —— 走系统字体栈（见 tokens.scss 的 $font-serif / $font-body），
// 这是与设计稿的已知偏差：中文标题会丢失宋体书卷感。原因与取舍见 README。
// =============================================================================

`;

writeFileSync(OUT, header + body + '\n');

console.log(`✓ 生成 ${faces.length} 个 @font-face → src/styles/fonts.scss`);
for (const f of faces) {
  const ws = f.weights.slice().sort((a, b) => a - b);
  console.log(`    ${f.family.padEnd(28)} 字重 ${ws.join('/')}  ${(f.size / 1024).toFixed(1)} KB`);
}
console.log(`  原始合计 ${(rawTotal / 1024).toFixed(1)} KB，base64 后约 ${((totalBytes * 1.34) / 1024).toFixed(0)} KB`);
console.log(`  产物大小 ${(Buffer.byteLength(readFileSync(OUT)) / 1024).toFixed(1)} KB`);
