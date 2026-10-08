#!/usr/bin/env node
/**
 * 生成图标样式：design/icons.txt + (缓存或下载) 的 SVG → src/styles/icons.scss
 *
 * 为什么用 mask 而不是把颜色烘进 SVG：
 *   设计稿里同一个图标有多种着色（text-primary / text-ink-light-gray / text-white /
 *   text-amber-gold / text-cinnabar-red），把颜色烘进 SVG 会变成「图标 × 颜色」的组合爆炸。
 *   mask 方案下每个图标只需一份 SVG，颜色由 background-color 决定。
 *
 * 尺寸：.msi 用 width/height: 1em，所以图标随 font-size 缩放 ——
 *   设计稿里 <span class="material-symbols-outlined text-[19px]">，
 *   移植后写成 <view class="msi icon-park text-[19px]" /> 即可，尺寸自动对上。
 *
 * 用法：npm run gen:icons
 *   优先读 design/icons-svg/<name>.svg 缓存；缺失时才走 curl 下载并回填缓存
 *   （本机访问 fonts.gstatic.com 需要代理，Node 的 fetch 不走代理，故用 curl）
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIST = join(ROOT, 'design/icons.txt');
const CACHE = join(ROOT, 'design/icons-svg');
const OUT = join(ROOT, 'src/styles/icons.scss');
const REMOTE = (name) =>
  `https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/${name}/default/24px.svg`;

mkdirSync(CACHE, { recursive: true });

const names = readFileSync(LIST, 'utf8')
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);

if (names.length === 0) {
  console.error('design/icons.txt 为空');
  process.exit(1);
}

/** 规范化 SVG：去掉固定 width/height（交给 CSS 的 1em 控制），保留 viewBox */
function normalize(svg) {
  return svg
    .replace(/\s(width|height)="[^"]*"/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

let downloaded = 0;
const entries = [];

for (const name of names) {
  const cacheFile = join(CACHE, `${name}.svg`);
  let svg;

  if (existsSync(cacheFile)) {
    svg = readFileSync(cacheFile, 'utf8');
  } else {
    try {
      svg = execFileSync('curl', ['-sL', '--max-time', '60', REMOTE(name)], {
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
      });
    } catch (err) {
      console.error(`✗ 下载失败 ${name}：${err.message}`);
      process.exitCode = 1;
      continue;
    }
    if (!svg.includes('<svg')) {
      console.error(`✗ ${name} 返回的不是 SVG，跳过`);
      process.exitCode = 1;
      continue;
    }
    writeFileSync(cacheFile, svg.trim());
    downloaded++;
  }

  entries.push({ name, b64: Buffer.from(normalize(svg), 'utf8').toString('base64') });
}

const header = `// =============================================================================
// 自动生成，请勿手改 —— 由 scripts/gen-icons.mjs 产出
// 图标源：Google Material Symbols Outlined（Apache-2.0），共 ${entries.length} 个
// 缓存：design/icons-svg/    重新生成：npm run gen:icons
// =============================================================================

/// 图标基类。尺寸用 1em 跟随 font-size，颜色用 currentColor 跟随 color。
/// 用法：<view class="msi icon-forest text-primary text-[19px]" />
.msi {
  display: inline-block;
  width: 1em;
  height: 1em;
  flex-shrink: 0;
  background-color: currentColor;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
}
`;

const rules = entries
  .map(
    ({ name, b64 }) =>
      `.icon-${name} {\n` +
      `  -webkit-mask-image: url("data:image/svg+xml;base64,${b64}");\n` +
      `  mask-image: url("data:image/svg+xml;base64,${b64}");\n` +
      `}`,
  )
  .join('\n\n');

writeFileSync(OUT, `${header}\n${rules}\n`);

const cached = readdirSync(CACHE).filter((f) => f.endsWith('.svg')).length;
console.log(`✓ 生成 ${entries.length} 个图标 → src/styles/icons.scss`);
console.log(`  本次下载 ${downloaded} 个，缓存共 ${cached} 个（design/icons-svg/）`);
console.log(`  产物大小 ${(Buffer.byteLength(readFileSync(OUT)) / 1024).toFixed(1)} KB`);
