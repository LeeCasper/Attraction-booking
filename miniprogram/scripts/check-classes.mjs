#!/usr/bin/env node
/**
 * 校验 src 下所有 .vue 用到的 class 都真实存在。
 *
 * 为什么需要：交互组件的 class 是从设计稿**逐字搬**过来的（手写，不是生成）。
 * 拼错一个字符既不会报错、也不会警告，只会静默少一条样式 —— 肉眼几乎发现不了。
 * 这里把 classmap.json（设计类名 → 安全类名）的**产物名集合**当白名单，
 * 任何不在其中的 token 都列出来。
 *
 * 只检查**字面量**，不碰表达式：
 *   - 模板里 class="…" / hover-class="…" 的整串
 *   - 模板里 :class="…" / :hover-class="…" 内部的引号字符串
 *   - <script setup> 里 SCREAMING_CASE 的常量（本项目放 class 串的约定）
 * 表达式里的标识符（RADIO_BASE、isOn(v)）不参与匹配，否则满屏误报。
 *
 * 用法：npm run check:classes
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

const classmap = JSON.parse(readFileSync(join(ROOT, 'design/classmap.json'), 'utf8'));
/** 设计类消毒后的产物名 = 合法 class 全集 */
const KNOWN = new Set(Object.values(classmap));

/** 本项目自有的类：全局结构类，不由 classmap 管 */
const LOCAL_PREFIX = ['pg-', 'is-', 'msi'];
/** `hover-class="none"` 是小程序约定：不施加任何按下态，不是类名 */
const LOCAL_EXACT = new Set(['none', '']);
const isLocal = (c) => LOCAL_EXACT.has(c) || LOCAL_PREFIX.some((p) => c.startsWith(p));

/**
 * `icon-*` **不做无条件放行** —— 它必须指向 `styles/icons.scss` 里真实生成的规则。
 *
 * 为什么单独管：`.msi` 是「一个 1em×1em、底色为 currentColor 的方块 + mask 挖出图形」。
 * 一旦引用了不存在的图标名，mask 那条规则就没有，方块不会消失 —— 它会**实心渲染**成一个
 * 深色方块。所以 `icon-arrow_back`（而生成器里只有 `arrow_forward`）的表现是
 * 返回键变成一个黑方块，肉眼只会当成图标风格问题，不会想到是拼写漏了。
 * 这个 bug 真发生过（常用出行人页），所以才从 LOCAL_PREFIX 里摘出来单查。
 */
const ICONS = new Set(
  [...readFileSync(join(ROOT, 'src/styles/icons.scss'), 'utf8').matchAll(/^\.icon-([a-z0-9_]+)\s*\{/gm)].map(
    (m) => m[1],
  ),
);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.vue')) out.push(p);
  }
  return out;
}

/** 从一个 .vue 里抽出所有「字面量 class 串」 */
function literalClassStrings(src) {
  const found = [];
  const template = src.slice(src.indexOf('<template>'), src.indexOf('</template>') + 11);

  // 静态 class / hover-class。前面用 (?<![:\w-]) 排掉 `:class=` ——
  // 否则 `:class="cardClass(d)"` 会被当成静态串，把函数名也算成 class。
  for (const m of template.matchAll(/(?<![:\w-])(class|hover-class)="([^"]*)"/g)) found.push(m[2]);
  // 绑定内的引号字符串：:class="[BTN_BASE, canSubmit ? '' : 'opacity-60']" → 只取 ' 之间的内容
  for (const m of template.matchAll(/:(class|hover-class)="([^"]*)"/g)) {
    for (const s of m[2].matchAll(/'([^']*)'/g)) found.push(s[1]);
  }
  // <script setup> 里的 SCREAMING_CASE 常量
  for (const m of src.matchAll(/const\s+[A-Z][A-Z0-9_]*\s*=\s*'([^']*)'/g)) found.push(m[1]);

  return found;
}

let bad = 0;
let checked = 0;

for (const file of walk(SRC).sort()) {
  const strings = literalClassStrings(readFileSync(file, 'utf8'));
  const unknown = new Set();
  for (const str of strings) {
    for (const token of str.split(/\s+/).filter(Boolean)) {
      checked++;
      if (token.startsWith('icon-')) {
        if (!ICONS.has(token.slice('icon-'.length))) unknown.add(token);
        continue;
      }
      if (!KNOWN.has(token) && !isLocal(token)) unknown.add(token);
    }
  }
  if (unknown.size) {
    bad += unknown.size;
    console.error(`✗ ${relative(ROOT, file)}`);
    for (const t of unknown) console.error(`    ${t}`);
  }
}

if (bad) {
  console.error(`\n${bad} 个 class 没有出处：既不在 design/classmap.json 里、也不是 pg-/is-/msi，`);
  console.error(`也不在 styles/icons.scss 的 ${ICONS.size} 个图标里。`);
  console.error('多半是抄设计稿时拼错了 —— 对照设计稿原文核实；');
  console.error('若是图标名，把它加进 design/icons.txt 再跑 npm run gen:icons。');
  process.exitCode = 1;
} else {
  console.log(
    `✓ ${checked} 个 class 全部有出处（design/classmap.json / pg-/is-/msi / icons.scss 的 ${ICONS.size} 个图标）`,
  );
}
