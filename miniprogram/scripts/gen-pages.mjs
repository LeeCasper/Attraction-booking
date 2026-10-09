#!/usr/bin/env node
/**
 * 设计稿 HTML → uni-app 页面模板
 *
 * 为什么用生成而不是手抄：
 *   4 个页面共约 800 个标签，手抄既慢又必然出现「少个 class / 标签套错」这类
 *   肉眼难查的偏差。生成器把 HTML→WXML 的映射写成一张确定的表，
 *   产物与设计稿结构一一对应，任何视觉差异都能回溯。
 *
 * 转换规则：
 *   header/main/nav/section/div → view        （小程序无 HTML 语义标签）
 *   span/h1-h3/p               → text        （必须是 text 才有正确的行内布局与 truncate）
 *   a/button                   → view + @tap （原生 button 自带样式，会与设计稿冲突）
 *   img                        → image mode="aspectFill"
 *   裸文本节点                  → 包一层 <text>
 *   material-symbols-outlined  → msi + icon-<名>（图标名取自该 span 的文字内容）
 *   style="background-image"   → 插入一个绝对定位的 <image>
 *                                （WXSS 禁止 background-image 用本地路径，且外链在国内不可达）
 *   class                      → 经 design/classmap.json 消毒
 *
 * 用法：npm run gen:pages
 *   产物写在 src/pages/<name>/index.vue，会覆盖手工改动，改前请注意。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESIGN = join(ROOT, 'design/reference');
const OUT_DIR = join(ROOT, 'src/pages');
const classmap = JSON.parse(readFileSync(join(ROOT, 'design/classmap.json'), 'utf8'));

import { PAGE_BINDINGS } from './page-bindings.mjs';

/** 页面定义：设计稿文件名 → 页面名 / 底部 tab 的 active 值 / 正文底部留白 */
const PAGES = [
  { file: 'home.html', name: 'home', activeTab: 'home', img: { 'aida-public': '/static/images/banner-home.jpg' } },
  { file: 'booking.html', name: 'booking', activeTab: 'booking', img: { 'aida-public': '/static/images/banner-booking.jpg' } },
  { file: 'credential.html', name: 'credential', activeTab: 'digital-pass', img: {} },
  { file: 'profile.html', name: 'profile', activeTab: 'profile', img: { 'aida-public': '/static/images/bg-profile.jpg' } },
];

/**
 * 标签映射的关键在于**保持块级/行内的区别**：
 *   HTML 里 div/p/h1-3/li 是块级 → view（块级），span/strong/em 是行内 → text（行内）。
 * 曾经把 div 也映射成 text，结果两个本该上下排列的块级元素变成行内排在一行，
 * 整个卡片布局塌掉 —— 这类偏差肉眼极难定位，务必守住这条不变量。
 *
 * 安全性前提：<text> 不能包含 <view>。已核验设计稿中 301 个 <span> 无一嵌套块级元素，
 * 故 span → text 不会产生非法嵌套。
 */
const TAG_MAP = {
  // 块级 → view
  div: 'view', header: 'view', main: 'view', nav: 'view', section: 'view', footer: 'view', aside: 'view',
  ul: 'view', li: 'view', p: 'view', h1: 'view', h2: 'view', h3: 'view', h4: 'view', figure: 'view',
  // 行内 → text
  span: 'text', strong: 'text', em: 'text', b: 'text', i: 'text', small: 'text', label: 'text',
  // 交互 → view（原生 button 自带样式，会与设计稿冲突）
  a: 'view', button: 'view',
};
const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'path', 'circle', 'rect', 'use', 'source']);

/** 把 class 串按映射表消毒；未在映射表里的（如自定义类）原样保留 */
function mapClasses(classStr) {
  if (!classStr) return '';
  return classStr
    .split(/\s+/)
    .filter(Boolean)
    .map((c) => classmap[c] ?? c)
    .join(' ');
}

/**
 * 拆分 class 串：`active:*` 前缀的类不能留在元素的 class 上。
 * 微信小程序的 <view> 不触发 :active 伪类，按下态只能靠 hover-class，
 * 所以这些类要从 class 里摘出来、改挂到 hover-class 属性上。
 */
function splitClasses(classStr) {
  const all = (classStr || '').split(/\s+/).filter(Boolean);
  const press = all.filter((c) => c.startsWith('active:'));
  const rest = all.filter((c) => !c.startsWith('active:'));
  return {
    mapped: mapClasses(rest.join(' ')),
    press: press.map((c) => classmap[c] ?? c),
  };
}

/** 设计稿里的 Google 图片地址 → 本地静态资源 */
function localizeImageUrl(url, page) {
  if (!url) return null;
  if (url.includes('aida-public')) {
    // 每页只有一张位图，按页面归位
    return page.img['aida-public'] ?? null;
  }
  return null;
}

/**
 * 轻量 HTML 解析：返回节点树。
 * 不引入解析库 —— 设计稿是机器生成的规整 HTML，正则+栈足够，且少一个依赖。
 */
function parse(html) {
  const root = { tag: '#root', children: [] };
  const stack = [root];
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      pushText(html.slice(i));
      break;
    }
    if (lt > i) pushText(html.slice(i, lt));

    if (html.startsWith('<!--', lt)) {
      i = html.indexOf('-->', lt) + 3;
      continue;
    }
    if (html.startsWith('<!', lt)) {
      i = html.indexOf('>', lt) + 1;
      continue;
    }
    const gt = findTagEnd(html, lt);
    const raw = html.slice(lt, gt + 1);

    if (raw.startsWith('</')) {
      const name = raw.slice(2, -1).trim().toLowerCase();
      for (let d = stack.length - 1; d > 0; d--) {
        if (stack[d].tag === name) {
          stack.length = d;
          break;
        }
      }
      i = gt + 1;
      continue;
    }

    const name = (raw.match(/^<([a-zA-Z][a-zA-Z0-9-]*)/) || [])[1]?.toLowerCase();
    if (!name) {
      i = gt + 1;
      continue;
    }
    const attrs = parseAttrs(raw.slice(1 + name.length, raw.length - 1).replace(/\/$/, ''));
    const node = { tag: name, attrs, children: [] };
    stack[stack.length - 1].children.push(node);

    if (!VOID.has(name) && !raw.endsWith('/>')) stack.push(node);
    i = gt + 1;
  }

  function pushText(t) {
    if (!t) return;
    stack[stack.length - 1].children.push({ tag: '#text', text: t });
  }

  return root;
}

/** 找到标签的结束 '>'，跳过属性值里的 '>' */
function findTagEnd(html, from) {
  let q = null;
  for (let i = from + 1; i < html.length; i++) {
    const c = html[i];
    if (q) {
      if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === '>') return i;
  }
  return html.length - 1;
}

function parseAttrs(s) {
  const attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(s))) attrs[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? '';
  return attrs;
}

/** 转义模板里的文本（避免 {{ }} 被 Vue 当插值，& 被当实体） */
function esc(s) {
  return s.replace(/&(?!(amp|lt|gt|quot|#\d+|nbsp);)/g, '&amp;').replace(/[{}]/g, (c) => (c === '{' ? '&#123;' : '&#125;'));
}

/**
 * 小程序没有 <svg> 标签，内联 SVG 不能直接搬。
 * 但设计稿里的二维码 SVG 只是一组 viewBox="0 0 100 100" 坐标系下的 <rect>，
 * 所以按百分比还原成绝对定位的 <view> 即可 —— 位置精确、无需 canvas。
 * fill 会从 <g fill="..."> 继承下来（设计稿用 <g> 给数据点统一着色）。
 */
function renderSvg(node, page, ctx, inheritedFill) {
  const rects = [];
  const walk = (n, fill) => {
    for (const c of n.children ?? []) {
      if (c.tag === '#text') continue;
      const f = c.attrs?.fill || fill;
      if (c.tag === 'rect') rects.push({ ...c.attrs, fill: f });
      else walk(c, f);
    }
  };
  walk(node, inheritedFill || node.attrs.fill || '#000');

  const cls = mapClasses(node.attrs.class ?? '');
  const body = rects
    .map((r) => {
      const w = Number(r.width ?? 0);
      const rx = Number(r.rx ?? 0);
      const style = [
        `left:${r.x}%`,
        `top:${r.y}%`,
        `width:${w}%`,
        `height:${r.height}%`,
        // rx 是 viewBox 单位（0–100），换算成元素自身边长的百分比；本条所有 rect 都是正方形
        rx > 0 ? `border-radius:${((rx / w) * 100).toFixed(2)}%` : '',
        `background-color:${r.fill ?? 'currentColor'}`,
      ]
        .filter(Boolean)
        .join(';');
      return `<view class="pg-qr-rect" style="${style}" />`;
    })
    .join('');

  return `<view class="pg-svg ${cls}">${body}</view>`;
}

/** 递归渲染节点 */
function render(node, page, ctx) {
  if (node.tag === '#text') {
    const t = node.text.replace(/\s+/g, ' ');
    if (!t.trim()) return '';
    // 裸文本必须包 <text>，否则小程序里无法正确参与行内布局
    return ctx.inText ? esc(t) : `<text>${esc(t)}</text>`;
  }

  const tag = node.tag;
  const classStr = node.attrs.class ?? '';
  const styleStr = node.attrs.style ?? '';

  // — 行为绑定：按设计稿预留的 id 注入组件/属性/文本（见 scripts/page-bindings.mjs）—
  const binding = node.attrs.id ? ctx.bindings?.[node.attrs.id] : undefined;
  if (binding?.replace) return binding.replace;

  // — 图标：material-symbols-outlined 的 span，图标名写在文字内容里 —
  if (classStr.includes('material-symbols-outlined')) {
    const iconName = node.children.map((c) => (c.tag === '#text' ? c.text : '')).join('').trim();
    const others = classStr.split(/\s+/).filter((c) => c !== 'material-symbols-outlined').join(' ');
    const cls = ['msi', `icon-${iconName}`, mapClasses(others)].filter(Boolean).join(' ');
    return `<view class="${cls}" />`;
  }

  // — 内联 SVG → 百分比定位的 view（见 renderSvg）—
  if (tag === 'svg') return renderSvg(node, page, ctx, ctx.fill);

  // — img —
  if (tag === 'img') {
    const src = localizeImageUrl(node.attrs.src, page);
    if (!src) return '';
    return `<image class="${mapClasses(classStr)}" src="${src}" mode="aspectFill" />`;
  }

  // 绑定可以改写标签（如普通 div → scroll-view，小程序里横向滚动必须用 scroll-view）
  const wxmlTag = binding?.tag ?? TAG_MAP[tag];
  if (!wxmlTag) return '';

  // uni-app 的 <scroll-view> 会把子元素包进内部的 .uni-scroll-view-content，
  // 因此 flex 之类的布局类挂在外层是管不到子元素的（会让横向排布塌成纵向堆叠）。
  // 开了 wrapInner 时，把原始类挪到内部再包一层，外层只留尺寸。
  const wrapInner = !!binding?.wrapInner;

  const { mapped, press } = splitClasses(classStr);
  let cls = wrapInner ? 'w-full' : mapped;
  const innerCls = wrapInner ? mapped : '';

  // — 背景图：WXSS 不能用本地路径做 background-image，改为插入绝对定位的 <image> —
  let bgImage = '';
  const bgMatch = styleStr.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/);
  if (bgMatch) {
    const src = localizeImageUrl(bgMatch[1], page);
    if (src) {
      bgImage = `<image class="pg-bgimg" src="${src}" mode="aspectFill" />`;
      cls = `${cls} pg-has-bg`.trim();
    }
  }

  const inlineStyle = buildInlineStyle(styleStr, bgMatch);

  const inText = wxmlTag === 'text';
  const rawInner =
    binding?.text !== undefined
      ? `{{ ${binding.text} }}`
      : node.children.map((c) => render(c, page, { ...ctx, inText })).join('');

  // 插入的 <image> 是绝对定位元素，按层叠规则会盖在同层「静态定位」的覆盖内容之上。
  // 故把原内容包一层显式提升层级（position:relative + z-index:1），
  // 否则 Banner 上的标题、状态徽章等会被背景图整片遮住。
  let inner = bgImage ? `<view class="pg-bgcontent">${rawInner}</view>` : rawInner;
  // scroll-view 的内部包裹层（见 wrapInner 的说明）
  if (wrapInner) inner = `<view class="${innerCls}">${inner}</view>`;

  const attrs = [`class="${cls}"`];
  if (inlineStyle) attrs.push(`style="${inlineStyle}"`);
  if (node.attrs['data-path']) attrs.push(`data-path="${node.attrs['data-path']}"`);
  if (node.attrs.id) attrs.push(`id="${node.attrs.id}"`);

  // 绑定注入的属性与条件类
  if (binding?.attrs) for (const [k, v] of Object.entries(binding.attrs)) attrs.push(`${k}="${v}"`);
  if (binding?.class) {
    const entries = Object.entries(binding.class)
      .map(([k, expr]) => `'${k}': ${expr}`)
      .join(', ');
    attrs.push(`:class="{ ${entries} }"`);
  }

  // 按下态：设计稿的 active:* 类 + a/button 的默认反馈，统一走 hover-class
  const hoverClasses = [...press];
  if (tag === 'a' || tag === 'button') hoverClasses.push('pg-hover');
  if (hoverClasses.length) attrs.push(`hover-class="${hoverClasses.join(' ')}"`);

  const body = bgImage + inner;
  if (!body) return `<${wxmlTag} ${attrs.join(' ')} />`;
  return `<${wxmlTag} ${attrs.join(' ')}>${body}</${wxmlTag}>`;
}

/** 保留设计稿里非 background-image 的内联样式（尺寸、定位等） */
function buildInlineStyle(styleStr, bgMatch) {
  if (!styleStr) return '';
  let s = bgMatch ? styleStr.replace(/background-image:[^;]*;?/, '') : styleStr;
  s = s.replace(/\s+/g, ' ').trim().replace(/;+$/, '');
  // 设计稿用 px，统一转成 rpx（与工具类同一套换算）
  s = s.replace(/([\d.]+)px/g, (_, n) => `${Number((Number(n) * (750 / 390)).toFixed(2))}rpx`);
  return s;
}

// ---------------------------------------------------------------- 主流程
for (const page of PAGES) {
  const html = readFileSync(join(DESIGN, page.file), 'utf8');
  const tree = parse(html);

  // 取 <body> 下的内容，丢掉 head/script/style
  const body = findFirst(tree, 'body');
  if (!body) {
    console.error(`✗ ${page.file} 未找到 <body>`);
    process.exitCode = 1;
    continue;
  }

  const main = findFirst(body, 'main');
  const source = main ?? body;

  // 关键：<main> 自身的 class 必须带到页面容器上。
  // 设计稿的 <main> 带 pt-14（给固定 header 让位）与 pb-24/pb-28（给底部 tab 让位），
  // 之前只取子元素、丢掉这些类，导致内容顶到屏幕最上沿被 header 压住、底部也无留白。
  const mainClasses = mapClasses(source.attrs?.class ?? '');

  const spec = PAGE_BINDINGS[page.name] ?? {};

  let tpl = source.children
    .filter((c) => !(c.tag === '#text' && !c.text.trim()))
    .map((c) => render(c, page, { inText: false, bindings: spec.bindings }))
    .join('\n    ');

  const extraImports = (spec.imports ?? []).join('\n');
  const hasBehavior = !!spec.setup;

  const vue = `<template>
  <view class="pg-page ${mainClasses}">
    <PageHeader />
    ${tpl}
    <TabBar active="${page.activeTab}" />
  </view>
</template>

<script setup lang="ts">
import PageHeader from '@/components/PageHeader.vue';
import TabBar from '@/components/TabBar.vue';
${extraImports}
// 页面行为（手写，见 pages/${page.name}/behavior.ts）—— 见 scripts/page-bindings.mjs
${spec.setup ?? ''}
</script>

<!-- 由 scripts/gen-pages.mjs 从 design/reference/${page.file} 生成，手工改动会被覆盖 -->
<style lang="scss" scoped>
// mainClasses 来自设计稿 <main> 的 class（pt-14 / pb-24 等），由生成器带上
.pg-page {
  background-color: $c-surface;
}
${spec.style ?? ''}
</style>
`;

  writeFileSync(join(OUT_DIR, page.name, 'index.vue'), vue);
  const lines = vue.split('\n').length;
  console.log(`✓ ${page.name.padEnd(11)} ← ${page.file.padEnd(16)} ${lines} 行，${(vue.length / 1024).toFixed(1)} KB`);
}

function findFirst(node, tag) {
  if (node.tag === tag) return node;
  for (const c of node.children ?? []) {
    if (c.tag === '#text') continue;
    const r = findFirst(c, tag);
    if (r) return r;
  }
  return null;
}
