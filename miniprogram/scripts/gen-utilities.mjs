#!/usr/bin/env node
/**
 * 生成工具类样式：design/classes.json → src/styles/utilities.scss
 *
 * 为什么要生成而不是手写：
 *   设计稿用了 419 个 Tailwind 工具类，其中 139 个含 CSS 不安全字符
 *   （text-[19px] / gap-2.5 / bg-amber-gold/15 / shadow-[0_2px_8px_rgba(...)]）。
 *   手写翻译既会出错也无法复核；生成器把翻译规则写成一张确定的表，
 *   任何视觉差异都能回溯到某条规则。
 *
 * 为什么类名要「消毒」而不是原样保留：
 *   WXSS 选择器对 [ ] / . ( ) # % 这类字符的支持不可靠，转义写法有静默失效风险。
 *   生成器把每个设计类名映射成只含 [a-zA-Z0-9_-] 的安全类名（见 design/classmap.json），
 *   页面模板使用安全类名。
 *
 * 单位：设计稿画布 390pt，rpx = px × 750/390（见 tokens.scss），不是 ×2。
 *   例外：≤1.5px 的细线与 box-shadow 的偏移模糊量保持 px，避免低 DPR 取整后细线消失。
 *
 * 用法：npm run gen:utilities
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLASSES = join(ROOT, 'design/classes.json');
const TOKENS = join(ROOT, 'src/styles/tokens.scss');
const OUT = join(ROOT, 'src/styles/utilities.scss');
const MAP_OUT = join(ROOT, 'design/classmap.json');

const RPX = 750 / 390;
const r = (px) => `${Number((px * RPX).toFixed(2))}rpx`;
const scale = (n) => r(Number(n) * 4);

const SENTINEL = Symbol('grid');

// ---------------------------------------------------------------- 色值来源
const tokensSrc = readFileSync(TOKENS, 'utf8');
const COLORS = {};
for (const m of tokensSrc.matchAll(/^\$c-([a-z0-9-]+):\s*([^;]+);/gm)) COLORS[m[1]] = m[2].trim();
// CSS 具名色与 Tailwind 默认调色板（设计稿里只有 amber-500 不在设计系统内）
Object.assign(COLORS, { white: '#ffffff', black: '#000000', transparent: 'rgba(0,0,0,0)', 'amber-500': '#f59e0b' });

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
function colorOf(name, alpha) {
  // 任意值 hex（bg-[#0d9488] / text-[#1c2826]）不走 token 表，直接用其字面值
  const v = name.startsWith('#') ? name : COLORS[name];
  if (!v) return null;
  if (alpha === undefined) return v;
  if (v.startsWith('#')) {
    const [a, b, c] = hexToRgb(v);
    return `rgba(${a}, ${b}, ${c}, ${alpha})`;
  }
  return v.startsWith('rgba') ? v.replace(/,\s*[\d.]+\)$/, `, ${alpha})`) : v;
}
/** primary | primary/10 | [#0d9488] | [#ccfbee]/70 → { name, alpha } */
function parseColorSpec(rest) {
  if (!rest) return null;
  const slash = rest.split('/');
  let name = slash[0];
  const alpha = slash[1] !== undefined ? Number(slash[1]) / 100 : undefined;
  if (name.startsWith('[') && name.endsWith(']')) name = name.slice(1, -1);
  if (name.startsWith('#')) return { name, alpha };
  return COLORS[name] ? { name, alpha } : null;
}
const specColor = (s) => {
  const spec = parseColorSpec(s);
  return spec ? colorOf(spec.name, spec.alpha) : null;
};

const sanitize = (cls) =>
  cls.replace(/\./g, '_').replace(/[[\]()#%,]/g, '').replace(/\//g, '_').replace(/:/g, '-');

// ---------------------------------------------------------------- 映射表
const SHADOWS = {
  'shadow-[0_-2px_12px_rgba(0,104,95,0.06)]': '0 -2px 12px rgba(0,104,95,.06)',
  'shadow-[0_-4px_16px_rgba(0,104,95,0.08)]': '0 -4px 16px rgba(0,104,95,.08)',
  'shadow-[0_1px_8px_rgba(0,0,0,0.03)]': '0 1px 8px rgba(0,0,0,.03)',
  'shadow-[0_2px_10px_rgba(0,0,0,0.03)]': '0 2px 10px rgba(0,0,0,.03)',
  'shadow-[0_2px_12px_rgba(0,0,0,0.03)]': '0 2px 12px rgba(0,0,0,.03)',
  'shadow-[0_2px_12px_rgba(0,104,95,0.04)]': '0 2px 12px rgba(0,104,95,.04)',
  'shadow-[0_2px_8px_rgba(0,104,95,0.22)]': '0 2px 8px rgba(0,104,95,.22)',
  'shadow-[0_2px_8px_rgba(217,119,6,0.06)]': '0 2px 8px rgba(217,119,6,.06)',
  'shadow-[0_4px_16px_rgba(0,0,0,0.04)]': '0 4px 16px rgba(0,0,0,.04)',
  'shadow-[0_4px_16px_rgba(0,104,95,0.08)]': '0 4px 16px rgba(0,104,95,.08)',
  'shadow-[0_1px_4px_rgba(0,104,95,0.08)]': '0 1px 4px rgba(0,104,95,.08)',
  'shadow-[0_1px_8px_rgba(0,104,95,0.04)]': '0 1px 8px rgba(0,104,95,.04)',
  'shadow-[0_4px_20px_rgba(0,104,95,0.06)]': '0 4px 20px rgba(0,104,95,.06)',
  // 订单支付页带进来的三档（底部操作栏的上投影、页头与角标的下投影）
  'shadow-[0_-4px_16px_rgba(0,106,97,0.08)]': '0 -4px 16px rgba(0,106,97,.08)',
  'shadow-[0_1px_4px_rgba(0,0,0,0.06)]': '0 1px 4px rgba(0,0,0,.06)',
  'shadow-[0_1px_8px_rgba(0,0,0,0.04)]': '0 1px 8px rgba(0,0,0,.04)',
  /** 裸 `shadow`（Tailwind 的第一档）= shadow-sm */
  'shadow': '0 1px 3px 0 rgba(0,0,0,.1), 0 1px 2px -1px rgba(0,0,0,.1)',
  'shadow-2xs': '0 1px rgba(0,0,0,.05)',
  'shadow-xs': '0 1px 2px 0 rgba(0,0,0,.05)',
  'shadow-sm': '0 1px 3px 0 rgba(0,0,0,.1), 0 1px 2px -1px rgba(0,0,0,.1)',
  'shadow-md': '0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.1)',
  'shadow-2xl': '0 25px 50px -12px rgba(0,0,0,.25)',
  // 内阴影（订单支付页那个倒计时数字的「凹槽」底）—— 注意 inset 必须写在最前
  'shadow-inner': 'inset 0 2px 4px 0 rgba(0,0,0,.05)',
};
const GRAD_DIR = {
  'bg-gradient-to-t': 'to top', 'bg-gradient-to-tr': 'to top right', 'bg-gradient-to-r': 'to right',
  'bg-gradient-to-br': 'to bottom right', 'bg-gradient-to-b': 'to bottom', 'bg-gradient-to-bl': 'to bottom left',
  'bg-gradient-to-l': 'to left', 'bg-gradient-to-tl': 'to top left',
};
const RADIUS = { '': r(4), sm: r(2), md: r(6), lg: r(8), xl: r(12), '2xl': r(16), '3xl': r(24), full: '9999px' };
const WEIGHT = { light: 300, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 };
const SPACE_NAMED = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, '2xl': 48, margin: 16, gutter: 16 };
const SIDE_PROPS = {
  p: ['padding'], px: ['padding-left', 'padding-right'], py: ['padding-top', 'padding-bottom'],
  pt: ['padding-top'], pb: ['padding-bottom'], pl: ['padding-left'], pr: ['padding-right'],
  m: ['margin'], mx: ['margin-left', 'margin-right'], my: ['margin-top', 'margin-bottom'],
  mt: ['margin-top'], mb: ['margin-bottom'], ml: ['margin-left'], mr: ['margin-right'],
  gap: ['gap'], 'gap-x': ['column-gap'], 'gap-y': ['row-gap'],
};
const BORDER_SIDE = { t: ['border-top-width'], b: ['border-bottom-width'], x: ['border-left-width', 'border-right-width'], y: ['border-top-width', 'border-bottom-width'] };

/**
 * 设计系统排版 token → [字体族, 字号, 行高, 字重, 字距]。
 *
 * ## 全站只有两套字体（2026-10 定的口径，见 CLAUDE.md 约束 18）
 *
 * | 用在哪 | 族 | SCSS 变量 |
 * | --- | --- | --- |
 * | 标题（`headline-*`） | Noto Serif | `$font-serif` |
 * | **其余一切**（正文、金额、数字、角标、水印、英文标签…） | Plus Jakarta Sans | `$font-body` |
 *
 * 设计稿原本还有第三套 —— **Space Grotesk**（`data-metric-*` / `display-kpi-screen` /
 * `label-badge` / `font-mono`），一套为看板 KPI 准备的几何展示体。但中文界面里它跟汉字
 * 完全不是一套骨架（「¥60」与旁边的「门票」两个字并排就很跳），而且同一屏上三套字体本来
 * 也谈不上统一 —— 所以**整个族退役**，全部并到正文族，字号/字重/字距一律保留。
 * 下面 `font-*` 那张表里 `font-mono` 同样指向正文族：设计稿还在用它（证件号、订单号、
 * 英文品牌行），但落到产物里就是正文族。
 *
 * ⚠️ 加新 token 时**族只能从 `FONT_VAR` 里挑** —— 最后有一段断言守着，写第三个族会直接失败。
 */
const TYPO = {
  'caption-sm': ['Plus Jakarta Sans', 12, 16, 400, null],
  'body-sm': ['Plus Jakarta Sans', 13, 18, 400, null],
  'body-md': ['Plus Jakarta Sans', 14, 22, 400, null],
  'body-lg': ['Plus Jakarta Sans', 16, 24, 500, null],
  'headline-md': ['Noto Serif', 18, 26, 600, null],
  'headline-lg': ['Noto Serif', 22, 30, 600, null],
  'headline-xl': ['Noto Serif', 28, 36, 600, null],
  'headline-xl-mobile': ['Noto Serif', 22, 30, 600, null],
  'data-metric-md': ['Plus Jakarta Sans', 16, 22, 500, null],
  'data-metric-lg': ['Plus Jakarta Sans', 24, 32, 600, '-0.01em'],
  'display-kpi-screen': ['Plus Jakarta Sans', 48, 56, 700, '-0.02em'],
  'label-badge': ['Plus Jakarta Sans', 12, 16, 600, '0.04em'],
};
const FONT_VAR = { 'Plus Jakarta Sans': '$font-body', 'Noto Serif': '$font-serif' };

// 守规矩：族只能来自 FONT_VAR。写第三个族（比如想把 Space Grotesk 请回来）就在这里失败，
// 而不是等到产物里出现一套没人认识的字体 —— `FONT_VAR[fam]` 为 undefined 时
// 生成出来的是 `font-family: undefined;`，浏览器/小程序**静默忽略**，最难查。
for (const [name, spec] of Object.entries(TYPO)) {
  if (!FONT_VAR[spec[0]]) {
    console.error(`✗ TYPO.${name} 用了 FONT_VAR 里没有的字体族「${spec[0]}」`);
    console.error('  全站只允许两套字体：正文族 Plus Jakarta Sans / 标题宋体 Noto Serif（见 CLAUDE.md 约束 18）。');
    console.error('  确实要用第三套，请同时更新本文档、FONT_VAR 与 tokens.scss，并想清楚它和汉字并排的样子。');
    process.exit(1);
  }
}

/**
 * 有意丢弃：触屏无 hover/焦点、小程序无鼠标与文本选择。
 * **显式列出**是有意义的 —— 下面的守卫靠它区分「有意丢弃」与「没写规则」，
 * 后者会静默地让元素少一条样式（见文件末尾的 unmapped 检查）。
 */
const INTENTIONAL_DROP = /^(hover:|group-hover:|selection:|focus:|focus-within:|placeholder:|group$|material-symbols-outlined$|cursor-|select-|antialiased$)/;

/** 任意值里的 px：≤1.5px 保持 px（细线），其余转 rpx */
const pxValue = (inner) => {
  const m = inner.match(/^([\d.]+)px$/);
  if (!m) return inner;
  return Number(m[1]) <= 1.5 ? `${m[1]}px` : r(Number(m[1]));
};

/** 设计类名 → CSS 声明数组。null = 丢弃；含 SENTINEL = 栅格特殊处理 */
function translate(input) {
  if (INTENTIONAL_DROP.test(input)) return null;

  const active = input.startsWith('active:');
  const base0 = active ? input.slice(7) : input;

  // 负值类：递归求正值后把「可负属性」整体取负
  if (base0.startsWith('-') && !/^-(rotate|translate)/.test(base0)) {
    const inner = translate(base0.slice(1));
    if (inner && !inner.includes(SENTINEL)) {
      const NEGATABLE = ['margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'top', 'right', 'bottom', 'left', 'inset'];
      return inner.map((d) => {
        const m = d.match(/^([a-z-]+):\s*(.+);$/);
        return m && NEGATABLE.includes(m[1]) ? `${m[1]}: -${m[2]};` : d;
      });
    }
  }

  const base = base0;
  let m;

  // — 安全区：必须放在间距正则之前。
  //   若放后面，pt-safe / pb-safe 会先被 ^(pt|pb)-(.+)$ 截走，
  //   而 safe 既不是数值也不在命名间距表里，直接被判为无法翻译。
  if (base === 'pt-safe') return ['padding-top: var(--status-bar-height, 0px);'];
  if (base === 'pb-safe') return ['padding-bottom: constant(safe-area-inset-bottom);', 'padding-bottom: env(safe-area-inset-bottom, 0px);'];

  // — 滚动条隐藏由 App.vue 的全局 ::-webkit-scrollbar 规则承担 —
  if (base === 'scrollbar-none' || base === 'no-scrollbar') return ['/* 全局已隐藏滚动条 */'];

  // — 分割线。WXSS 对 :first-child 支持不可靠，故用「相邻兄弟」选择器 + CSS 变量传色，
  //   模板侧不需要额外索引类 —
  if ((m = base.match(/^divide-([xy])$/))) {
    const prop = m[1] === 'x' ? 'border-left' : 'border-top';
    return [`@divide ${m[1]} ${prop}`];
  }
  if ((m = base.match(/^divide-(.+)$/))) {
    const c = specColor(m[1]);
    if (c) return [`--tw-divide-color: ${c};`];
  }

  // — space-x-N / space-y-N：**相邻子元素之间**加外边距（订单支付页的预约信息卡、
  //   费用明细、游客列表都用它，且宿主不是 flex —— 用 gap 表达不了）。
  //   与 divide 同一套路数：此处只产出一个哨兵，真正的规则在主流程里按 `A + B` 展开，
  //   模板侧不需要给第一个子元素加任何豁免类。—
  if ((m = base.match(/^space-([xy])-(.+)$/))) {
    const v = m[2];
    let px;
    if (/^[\d.]+$/.test(v)) px = Number(v) * 4;
    else if (v.startsWith('space-')) px = SPACE_NAMED[v.slice(6)];
    else if (SPACE_NAMED[v] !== undefined) px = SPACE_NAMED[v];
    if (px === undefined || Number.isNaN(px)) return null;
    return [`@space ${m[1]} ${r(px)}`];
  }

  // — 阴影 —
  if (SHADOWS[base]) return [`--tw-shadow: ${SHADOWS[base]};`, `box-shadow: var(--tw-shadow);`];
  if (base === 'drop-shadow-md') return ['filter: drop-shadow(0 4px 3px rgba(0,0,0,.07)) drop-shadow(0 2px 2px rgba(0,0,0,.06));'];
  if (base === 'drop-shadow-sm') return ['filter: drop-shadow(0 1px 1px rgba(0,0,0,.05));'];

  // — 渐变 —
  if (GRAD_DIR[base]) return [`background-image: linear-gradient(${GRAD_DIR[base]}, var(--tw-gradient-stops));`];
  if ((m = base.match(/^from-(.+)$/))) {
    const c = specColor(m[1]);
    if (c) return [`--tw-gradient-from: ${c};`, '--tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to, rgba(0,0,0,0));'];
  }
  if ((m = base.match(/^to-(.+)$/))) {
    const c = specColor(m[1]);
    if (c) return [`--tw-gradient-to: ${c};`];
  }
  if ((m = base.match(/^via-(.+)$/))) {
    const c = specColor(m[1]);
    if (c) return [`--tw-gradient-stops: var(--tw-gradient-from), ${c}, var(--tw-gradient-to, rgba(0,0,0,0));`];
  }

  // — ring：与 shadow 通过 CSS 变量串联，避免两条 box-shadow 互相覆盖 —
  if ((m = base.match(/^ring-(\d+)$/))) {
    return [`box-shadow: var(--tw-shadow, 0 0 0 0 transparent), 0 0 0 ${m[1]}px var(--tw-ring-color, currentColor);`];
  }
  if ((m = base.match(/^ring-(.+)$/))) {
    const c = specColor(m[1]);
    if (c) return [`--tw-ring-color: ${c};`];
  }

  // — 颜色 —
  const DIR_BORDER = { t: 'border-top-color', b: 'border-bottom-color', l: 'border-left-color', r: 'border-right-color' };
  for (const [prefix, prop] of [['bg-', 'background-color'], ['text-', 'color'], ['border-', 'border-color']]) {
    if (!base.startsWith(prefix)) continue;
    const rest = base.slice(prefix.length);
    const dir = prefix === 'border-' && rest.match(/^([tblr])-(.+)$/);
    const c = specColor(dir ? dir[2] : rest);
    if (c) return [`${dir ? DIR_BORDER[dir[1]] : prop}: ${c};`];
    break;
  }

  // — 背景定位 / 尺寸 —
  if (base === 'bg-center') return ['background-position: center;'];
  if (base === 'bg-cover') return ['background-size: cover;'];
  if (base === 'bg-contain') return ['background-size: contain;'];
  if (base === 'bg-no-repeat') return ['background-repeat: no-repeat;'];

  // — 排版 token —
  if (base.startsWith('text-')) {
    const t = TYPO[base.slice(5)];
    if (t) {
      const [fam, size, lh, weight, ls] = t;
      return [`font-family: ${FONT_VAR[fam]};`, `font-size: ${r(size)};`, `line-height: ${r(lh)};`, `font-weight: ${weight};`, ...(ls ? [`letter-spacing: ${ls};`] : [])];
    }
  }

  // — 圆角 —
  // 单边圆角有 8 种写法：四角 tl/tr/br/bl，以及整条边 t/r/b/l（订单支付页的
  // 「竹青竖装饰条」是 rounded-r-full、明细抽屉是 rounded-t-2xl）。
  // 整条边的写法**要展开成两条声明**，所以这里 return 的是数组而不是单条。
  if ((m = base.match(/^rounded(-(?:tl|tr|br|bl|t|r|b|l)-[a-z0-9]+|-none|-2xl|-3xl|-full|-sm|-md|-lg|-xl)?$/))) {
    const suffix = m[1] || '';
    const side = suffix.match(/^-(tl|tr|br|bl|t|r|b|l)-(.+)$/);
    if (side) {
      const map = {
        tl: ['border-top-left-radius'], tr: ['border-top-right-radius'],
        br: ['border-bottom-right-radius'], bl: ['border-bottom-left-radius'],
        t: ['border-top-left-radius', 'border-top-right-radius'],
        b: ['border-bottom-left-radius', 'border-bottom-right-radius'],
        l: ['border-top-left-radius', 'border-bottom-left-radius'],
        r: ['border-top-right-radius', 'border-bottom-right-radius'],
      };
      return map[side[1]].map((p) => `${p}: ${RADIUS[side[2]] ?? RADIUS['']};`);
    }
    const key = suffix.replace(/^-/, '');
    return [`border-radius: ${key === 'none' ? '0' : RADIUS[key] ?? RADIUS['']};`];
  }

  // — 边框 —
  if (base === 'border') return ['border-width: 1px;', 'border-style: solid;'];
  if (base === 'border-dashed') return ['border-style: dashed;'];
  if ((m = base.match(/^border-\[([\d.]+)px\]$/))) return [`border-width: ${pxValue(`${m[1]}px`)};`, 'border-style: solid;'];
  if ((m = base.match(/^border-(\d+)$/))) return [`border-width: ${m[1]}px;`, 'border-style: solid;'];
  if ((m = base.match(/^border-([tbxy])$/))) return BORDER_SIDE[m[1]].map((p) => `${p}: 1px;`).concat('border-style: solid;');
  if ((m = base.match(/^border-([tbxy])-(\d+)$/))) return BORDER_SIDE[m[1]].map((p) => `${p}: ${m[2]}px;`).concat('border-style: solid;');
  if ((m = base.match(/^border-([tbxy])-\[([\d.]+)px\]$/))) return BORDER_SIDE[m[1]].map((p) => `${p}: ${pxValue(`${m[2]}px`)};`).concat('border-style: solid;');
  if ((m = base.match(/^border-([tbxy])-transparent$/))) return BORDER_SIDE[m[1]].map((p) => `${p.replace('-width', '-color')}: transparent;`);

  // — 尺寸 —
  if ((m = base.match(/^(w|h|min-w|min-h|max-w|max-h)-(.+)$/))) {
    const prop = { w: 'width', h: 'height', 'min-w': 'min-width', 'min-h': 'min-height', 'max-w': 'max-width', 'max-h': 'max-height' }[m[1]];
    const v = m[2];
    let val;
    if (v === 'full') val = '100%';
    else if (v === 'screen') val = m[1].includes('w') ? '100vw' : '100vh';
    else if (v === 'auto') val = 'auto';
    // 发丝线：1 逻辑像素，不能跟着 750/390 一起放大
    else if (v === 'px') val = '1px';
    else if (v === 'md') val = r(448);
    else if (v.startsWith('[')) val = pxValue(v.slice(1, -1));
    else if (/^[\d.]+$/.test(v)) val = scale(v);
    else return null;
    return [`${prop}: ${val};`];
  }

  // — 间距 —
  if ((m = base.match(/^(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y)-(.+)$/))) {
    const v = m[2];
    if (v === 'auto') {
      if (m[1] === 'mx') return ['margin-left: auto;', 'margin-right: auto;'];
      if (m[1] === 'my') return ['margin-top: auto;', 'margin-bottom: auto;'];
      return null;
    }
    let px;
    if (/^[\d.]+$/.test(v)) px = Number(v) * 4;
    else if (v.startsWith('[')) px = Number(v.slice(1, -1).replace('px', ''));
    else if (SPACE_NAMED[v] !== undefined) px = SPACE_NAMED[v];
    else if (v.startsWith('space-')) px = SPACE_NAMED[v.slice(6)];
    else return null;
    if (Number.isNaN(px)) return null;
    return SIDE_PROPS[m[1]].map((p) => `${p}: ${r(px)};`);
  }

  // — 定位 —
  if (base === 'relative') return ['position: relative;'];
  if (base === 'absolute') return ['position: absolute;'];
  if (base === 'fixed') return ['position: fixed;'];
  if (base === 'sticky') return ['position: sticky;'];
  // inset-x-N / inset-y-N 必须排在下面的通用 inset- 分支**之前** ——
  // 否则会被当成「inset: x-0」这种不存在的值，直接 return null（静默无样式）
  if ((m = base.match(/^inset-([xy])-(.+)$/))) {
    const v = m[2];
    let val;
    if (v === '0') val = '0';
    else if (v === 'full') val = '100%';
    else if (v === 'auto') val = 'auto';
    else if (v.startsWith('[')) val = pxValue(v.slice(1, -1));
    else if (/^[\d.]+$/.test(v)) val = scale(v);
    else return null;
    return (m[1] === 'x' ? ['left', 'right'] : ['top', 'bottom']).map((p) => `${p}: ${val};`);
  }
  if ((m = base.match(/^(top|right|bottom|left|inset)-(.+)$/))) {
    const v = m[2];
    let val;
    if (v === '0') val = '0';
    else if (v === 'full') val = '100%';
    else if (v === '1/2') val = '50%';
    else if (v === 'auto') val = 'auto';
    else if (v.startsWith('[')) val = pxValue(v.slice(1, -1));
    else if (/^[\d.]+$/.test(v)) val = scale(v);
    else return null;
    return [`${m[1]}: ${val};`];
  }

  // — 文字 —
  if ((m = base.match(/^text-\[(\d+(?:\.\d+)?)px\]$/))) return [`font-size: ${r(Number(m[1]))};`];
  if ((m = base.match(/^text-(base|sm|xs|lg|xl|2xl|3xl)$/))) return [`font-size: ${r({ xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30 }[m[1]])};`];
  if (base === 'text-center') return ['text-align: center;'];
  if (base === 'text-left') return ['text-align: left;'];
  if (base === 'text-right') return ['text-align: right;'];
  if ((m = base.match(/^font-(normal|medium|semibold|bold|extrabold|light)$/))) return [`font-weight: ${WEIGHT[m[1]]};`];
  // 字体族：**只有两个去处** —— 标题宋体，其余正文族（见 TYPO 上的那张表）。
  // 设计稿的 `font-display-kpi-screen` / `font-label-badge` / `font-mono` 是第三套（Space Grotesk），
  // 已整个并到正文族；`font-mono` 这个名字留着是因为设计稿还在用（证件号、订单号、英文品牌行），
  // 但落到产物里就是正文族 —— 全站不再有等宽的观感。
  const FONT_TOKENS = {
    'font-body-md': '$font-body', 'font-body-sm': '$font-body', 'font-body-lg': '$font-body', 'font-caption-sm': '$font-body',
    'font-headline-md': '$font-serif', 'font-headline-lg': '$font-serif', 'font-headline-xl': '$font-serif',
    // `font-data-metric-*` 与 `text-data-metric-*` 两层都指向正文族，漏一层就会漏一处
    'font-data-metric-md': '$font-body', 'font-data-metric-lg': '$font-body',
    'font-display-kpi-screen': '$font-body', 'font-label-badge': '$font-body',
    'font-mono': '$font-body', 'font-serif': '$font-serif',
  };
  if (FONT_TOKENS[base]) return [`font-family: ${FONT_TOKENS[base]};`];
  if (base === 'leading-none') return ['line-height: 1;'];
  if (base === 'leading-tight') return ['line-height: 1.25;'];
  if (base === 'leading-snug') return ['line-height: 1.375;'];
  if (base === 'leading-normal') return ['line-height: 1.5;'];
  if (base === 'leading-relaxed') return ['line-height: 1.625;'];
  if ((m = base.match(/^tracking-(tight|wide|wider|widest)$/))) return [`letter-spacing: ${{ tight: '-0.025em', wide: '0.025em', wider: '0.05em', widest: '0.1em' }[m[1]]};`];
  if (base === 'uppercase') return ['text-transform: uppercase;'];
  if (base === 'truncate') return ['overflow: hidden;', 'white-space: nowrap;', 'text-overflow: ellipsis;'];
  if (base === 'whitespace-nowrap') return ['white-space: nowrap;'];
  if (base === 'line-through') return ['text-decoration: line-through;'];
  if (base === 'underline') return ['text-decoration: underline;'];
  // 下划线的「颜色」与「下划位置」—— 设计稿用它给闸机名做了个淡青色的强调下划线。
  // 两条都必须排在 `underline` 之后无所谓（属性不同，不会互相覆盖），但颜色属性名
  // 是 text-decoration-color，别写成 text-decoration。
  if ((m = base.match(/^decoration-(.+)$/))) {
    const c = specColor(m[1]);
    if (c) return [`text-decoration-color: ${c};`];
  }
  if ((m = base.match(/^underline-offset-(\d+)$/))) return [`text-underline-offset: ${r(Number(m[1]))};`];
  if (base === 'align-middle') return ['vertical-align: middle;'];

  // — 布局 —
  const DISPLAY = { flex: 'flex', 'inline-flex': 'inline-flex', grid: 'grid', block: 'block', 'inline-block': 'inline-block', hidden: 'none' };
  if (DISPLAY[base]) return [`display: ${DISPLAY[base]};`];
  if (base === 'flex-col') return ['flex-direction: column;'];
  if (base === 'flex-row') return ['flex-direction: row;'];
  if (base === 'flex-wrap') return ['flex-wrap: wrap;'];
  if (base === 'flex-1') return ['flex: 1 1 0%;'];
  if (base === 'flex-shrink-0' || base === 'shrink-0') return ['flex-shrink: 0;'];
  if ((m = base.match(/^items-(start|center|end|baseline|stretch)$/))) return [`align-items: ${{ start: 'flex-start', end: 'flex-end' }[m[1]] ?? m[1]};`];
  if ((m = base.match(/^justify-(start|center|end|between|around|evenly)$/))) return [`justify-content: ${{ start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between', around: 'space-around', evenly: 'space-evenly' }[m[1]]};`];
  if (base === 'self-center') return ['align-self: center;'];
  if (base === 'mx-auto') return ['margin-left: auto;', 'margin-right: auto;'];
  // 栅格用原生 CSS Grid：小程序 WebView（Chromium 86+/WKWebView）支持良好，
  // 且 gap 能正确参与列宽计算。曾试过「flex + 子项百分比宽度」，但叠加 gap 后会
  // 超过 100% 导致换行错乱（4 列 × 25% + 3 个 gap > 100%）。
  if ((m = base.match(/^grid-cols-(\d+)$/))) return [`grid-template-columns: repeat(${m[1]}, minmax(0, 1fr));`];

  // — 溢出 / 层级 / 其它 —
  if (base === 'overflow-hidden') return ['overflow: hidden;'];
  if (base === 'overflow-x-auto') return ['overflow-x: auto;'];
  if (base === 'overflow-x-hidden') return ['overflow-x: hidden;'];
  if ((m = base.match(/^z-(\d+)$/))) return [`z-index: ${m[1]};`];
  if ((m = base.match(/^opacity-(\d+)$/))) return [`opacity: ${Number(m[1]) / 100};`];
  if ((m = base.match(/^opacity-\[([\d.]+)\]$/))) return [`opacity: ${m[1]};`];
  if (base === 'pointer-events-none') return ['pointer-events: none;'];
  if (base === 'object-cover') return ['object-fit: cover;'];

  // — 过渡 / 动画 —
  if (base.startsWith('transition-')) return ['transition-property: all;', 'transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);', 'transition-duration: 150ms;'];
  if ((m = base.match(/^duration-(\d+)$/))) return [`transition-duration: ${m[1]}ms;`];
  // 裸 `transform` 在 Tailwind 里只是「打开 transform 通道」的占位类，真正的变换写在
  // rotate-/scale-/translate- 上。它本身没有任何声明可写，但**不能丢** —— 丢了会被漏网检查
  // 判为「译不出且没被认领」，而它确实是有意为之的空规则。
  if (base === 'transform') return ['/* transform 通道由 rotate-/scale-/translate- 类写，本类无需声明 */'];
  if (base === 'animate-spin') return ['animation: pg-spin 1s linear infinite;'];
  if (base === 'animate-pulse') return ['animation: pg-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;'];
  if (base === 'animate-ping') return ['animation: pg-ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;'];
  if ((m = base.match(/^-rotate-(\d+)$/))) return [`transform: rotate(-${m[1]}deg);`];
  if ((m = base.match(/^rotate-(\d+)$/))) return [`transform: rotate(${m[1]}deg);`];
  if ((m = base.match(/^scale-(\d+)$/))) return [`transform: scale(${Number(m[1]) / 100});`];
  if ((m = base.match(/^scale-\[([\d.]+)\]$/))) return [`transform: scale(${m[1]});`];
  if ((m = base.match(/^-translate-x-(.+)$/))) return [`transform: translateX(-${m[1] === '1/2' ? '50%' : pxValue(`${m[1]}px`)});`];
  if ((m = base.match(/^translate-x-(.+)$/))) return [`transform: translateX(${m[1] === '1/2' ? '50%' : pxValue(`${m[1]}px`)});`];
  if ((m = base.match(/^translate-y-(.+)$/))) return [`transform: translateY(${m[1] === '1/2' ? '50%' : pxValue(`${m[1]}px`)});`];
  if ((m = base.match(/^origin-(center|top|bottom|left|right)$/))) return [`transform-origin: ${m[1]};`];

  // — 安全区 —
  if (base === 'pt-safe') return ['padding-top: var(--status-bar-height, 0px);'];
  if (base === 'pb-safe') return ['padding-bottom: constant(safe-area-inset-bottom);', 'padding-bottom: env(safe-area-inset-bottom, 0px);'];

  // — backdrop-blur：小程序渲染器支持不稳，降级为无模糊（底色本身已接近不透明）—
  if (base.startsWith('backdrop-blur')) return ['/* backdrop-blur 降级，见 README 已知偏差 */'];

  // — 普通 blur（不是 backdrop-）：只是给装饰光斑做柔化，能支持 —
  if ((m = base.match(/^blur-(sm|md|lg|xl|2xl|3xl)$/))) {
    const px = { sm: 4, md: 12, lg: 16, xl: 24, '2xl': 40, '3xl': 64 }[m[1]];
    return [`filter: blur(${px}px);`];
  }

  // — 滚动 —
  if (base === 'snap-x') return ['scroll-snap-type: x mandatory;'];
  if (base === 'snap-start') return ['scroll-snap-align: start;'];

  return null;
}

// ---------------------------------------------------------------- 输出顺序（关键）
/**
 * 所有工具类都是单类选择器、特异性相同，**靠后写的赢**。
 * 因此输出顺序不能按类名字母序，必须按 CSS 语义分层，否则会被覆盖。
 *
 * 踩过的坑：`border-t`（设 border-style: solid）按字母序排在 `border-dashed` 后面，
 * 把虚线覆盖成实线，票卡的虚线分隔线变成了实线方框。
 */
function priority(cls) {
  const b = cls.replace(/^active:/, '');
  // 先写 shadow，再让 ring 追加，两者靠 --tw-shadow 串联。
  // 注意 `shadow(-|$)`：裸 `shadow` 也是阴影，只写 `^shadow-` 会让它拿不到这一档优先级
  if (/^shadow(-|$)/.test(b)) return 20;
  if (/^ring-\d+$/.test(b)) return 26;
  if (/^ring-/.test(b)) return 25;
  if (/^from-/.test(b)) return 50; // 渐变从 → 经 → 到，顺序不能乱
  if (/^via-/.test(b)) return 51;
  if (/^to-/.test(b)) return 52;
  if (b === 'border-dashed' || b === 'border-solid' || b === 'border-dotted' || b === 'border-none') return 41; // 样式必须晚于宽度
  if (/^border(-[tbxy])?(-\d+px|-\d+|\[\d[\d.]*px\])?$/.test(b)) return 40;
  if (/^border-/.test(b)) return 42; // 颜色
  return 10;
}

// ---------------------------------------------------------------- 主流程
const classes = JSON.parse(readFileSync(CLASSES, 'utf8'));
const classmap = {};
const normalRules = [];
const activeRules = [];
const gridRules = [];
const divideRules = [];
const spaceRules = [];
const dropped = [];
const unmapped = [];

for (const cls of classes) {
  const safe = sanitize(cls);
  classmap[cls] = safe;

  const decls = translate(cls);
  if (decls === null) {
    // 「译不出」分两种：有意丢弃（hover/伪类等，触屏无对应能力）与**漏网**（既没规则、
    // 也不该丢）。后者以前被混进 dropped 只报一个计数，而类照旧进了 classmap，
    // 于是 check:classes 放行、产物里却**一条样式都没有** —— 静默无样式就是这么来的。
    (INTENTIONAL_DROP.test(cls) ? dropped : unmapped).push(cls);
    continue;
  }
  // 分割线：相邻兄弟之间加边。WXSS 不支持 :not(:first-child)，故用 A + B 选择器表达
  if (decls[0]?.startsWith('@divide ')) {
    const [, , prop] = decls[0].split(' '); // 已经是 border-left / border-top
    divideRules.push(
      `.${safe} > view + view, .${safe} > text + text { ${prop}-width: 1px; ${prop}-style: solid; ${prop}-color: var(--tw-divide-color, rgba(0,0,0,0.06)); }`,
    );
    continue;
  }

  // 相邻子元素间距：与 divide 同样的 `A + B` 写法（WXSS 不支持 :not(:first-child)）。
  // 每种标签组合都要列出来 —— 相邻兄弟选择器只在**同标签**之间生效，
  // 而设计稿里同一个容器下混着 view / text / image 是常态（图标是 view、文字是 text）。
  if (decls[0]?.startsWith('@space ')) {
    const [, axis, val] = decls[0].split(' ');
    const prop = axis === 'x' ? 'margin-left' : 'margin-top';
    const tags = ['view', 'text', 'image'];
    spaceRules.push(
      tags.flatMap((a) => tags.map((b) => `.${safe} > ${a} + ${b}`)).join(', ') + ` { ${prop}: ${val}; }`,
    );
    continue;
  }

  if (decls.includes(SENTINEL)) {
    const cols = decls[decls.indexOf(SENTINEL) + 1];
    normalRules.push(`.${safe} { ${decls.slice(0, decls.indexOf(SENTINEL)).join(' ')} }`);
    gridRules.push(`.${safe} > view, .${safe} > text, .${safe} > image { width: ${(100 / Number(cols)).toFixed(4)}%; box-sizing: border-box; }`);
    continue;
  }
  const rule = `.${safe} { ${decls.join(' ')} }`;
  // active: 前缀不生成 :active 伪类 —— 微信小程序的 <view> 不触发 :active，
  // 真机需要靠 hover-class。这里生成普通类，由 gen-pages 把它挂到 hover-class 上。
  if (cls.startsWith('active:')) activeRules.push(rule);
  else normalRules.push(rule);
}

normalRules.sort((a, b) => {
  const ca = a.slice(1, a.indexOf(' '));
  const cb = b.slice(1, b.indexOf(' '));
  return priority(ca) - priority(cb) || ca.localeCompare(cb);
});

const out = `// =============================================================================
// 自动生成，请勿手改 —— 由 scripts/gen-utilities.mjs 产出
// 输入：design/classes.json（设计稿实际用到的 ${classes.length} 个 Tailwind 类）
// 映射表：design/classmap.json（设计类名 → 安全类名）
// 重新生成：npm run gen:utilities
//
// 类名做了消毒：WXSS 选择器对 [ ] / . ( ) # 的支持不可靠，
// 故 text-[19px] → .text-19px、gap-2.5 → .gap-2_5、bg-primary/10 → .bg-primary_10。
// 页面模板用的是消毒后的类名。
//
// 单位：rpx = px × 750/390（设计稿画布 390pt）。≤1.5px 细线与 box-shadow 保持 px。
// =============================================================================

${normalRules.join('\n')}

// — active: 前缀 → 触屏按下态。
//   这些类**不写进元素的 class**，而是由 gen-pages 挂到 hover-class 上，
//   因为微信小程序的 <view> 不触发 :active 伪类，只有 hover-class 在真机上生效。
//   类名直接沿用消毒后的设计类名（active:scale-[0.98] → .active-scale-0_98），便于回查设计稿。
${activeRules.join('\n')}

// — 栅格：转 flex + 子项百分比宽度 —
${gridRules.join('\n')}

// — 分割线：相邻子元素之间加边 —
${divideRules.join('\n')}

// — 相邻子元素间距（space-x-N / space-y-N）：A + B 展开 —
${spaceRules.join('\n')}

// — 动画关键帧 —
@keyframes pg-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes pg-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
@keyframes pg-ping {
  75%, 100% { transform: scale(2); opacity: 0; }
}
`;

writeFileSync(OUT, out);
writeFileSync(MAP_OUT, JSON.stringify(classmap, null, 2));

console.log(`✓ 生成 ${normalRules.length} 条规则 + ${activeRules.length} 条按下态 + ${gridRules.length} 条栅格`);
console.log(`  映射表 ${Object.keys(classmap).length} 条 → design/classmap.json`);
console.log(`  有意丢弃 ${dropped.length} 个（hover/group-hover/selection/focus/placeholder/光标/文本选择/图标字体类）`);

// 漏网类必须**炸出来**：它们会进 classmap（所以 check:classes 放行）却没有规则，
// 表现是元素静默少一条样式 —— 比报错难查得多。
if (unmapped.length) {
  console.error('');
  console.error(`✗ ${unmapped.length} 个类既没有规则、也没有被 INTENTIONAL_DROP 认领：`);
  unmapped.forEach((c) => console.error(`      ${c}`));
  console.error('  处理方式二选一：在 gen-utilities.mjs 里补 translate() 规则，');
  console.error('  或（确实无对应能力时）把它的前缀加进 INTENTIONAL_DROP 并补进注释。');
  process.exitCode = 1;
}
console.log(`  产物大小 ${(Buffer.byteLength(out) / 1024).toFixed(1)} KB`);
