#!/usr/bin/env node
/**
 * 从 `design/reference/*.html` 重建 `design/classes.json`（`gen-utilities` 的输入）。
 *
 * 为什么要有这个脚本：**在这之前 `classes.json` 是个没有任何生成器的静态文件** ——
 * 加一页设计稿就得手工往数组里补类名（`design/reference/README.md` 里写的「由 scripts/
 * 提取」其实是不存在的）。漏一个的后果不是报错，而是 `gen-utilities` 里静默少一条规则：
 * 类因为进了 classmap 所以 `check:classes` 照样放行，但产物里**没有任何样式**。
 *
 * 抽取口径：整份 HTML 里所有 `class="…"` 的 token（**含 `<header>` 这类最终不会进模板的区域** ——
 * 既有 419 条里就有只在 header 出现的 `z-50` / `pt-safe` / `hover:*`）。
 * `active:*` / `hover:*` / `selection:*` 等状态类**原样保留**，译不译得出、要不要有意丢弃，
 * 是 `gen-utilities` 的事。
 *
 * 排序用**默认的 `Array.prototype.sort()`**（UTF-16 码元序）—— 实测它能逐字节复现既有文件；
 * 换成 `localeCompare` 会把整个数组重排，classmap 的 diff 就不再是纯插入了。
 * 输出也不加缩进与尾换行，与既有文件保持一致。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = join(ROOT, 'design/reference');
const OUT = join(ROOT, 'design/classes.json');

const files = readdirSync(REF)
  .filter((f) => f.endsWith('.html'))
  .sort();

const set = new Set();
for (const f of files) {
  const html = readFileSync(join(REF, f), 'utf8');
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    for (const t of m[1].split(/\s+/)) if (t) set.add(t);
  }
}

const classes = [...set].sort();
writeFileSync(OUT, JSON.stringify(classes));

console.log(`✓ ${files.length} 份设计稿（${files.join(' ')}）`);
console.log(`  共 ${classes.length} 个去重类名 → design/classes.json`);
