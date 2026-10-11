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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESIGN = join(ROOT, 'design/reference');
/** 单页外壳的四个视图（由 `pages/main/index.vue` 以 v-show 承载） */
const OUT_DIR = join(ROOT, 'src/views');
/** standalone 二级页：真正的页面，有自己的路由与标题栏 */
const PAGE_DIR = join(ROOT, 'src/pages');
const classmap = JSON.parse(readFileSync(join(ROOT, 'design/classmap.json'), 'utf8'));

import { PAGE_BINDINGS } from './page-bindings.mjs';

/**
 * 页面定义：设计稿文件名 → 输出名 / 位图归位。
 *
 * `standalone: true` = 产出 `src/pages/<name>/index.vue`（独立页面）而不是 `src/views/`（外壳视图）：
 *   - 进 `pages.json` 的真实路由，自带标题栏，**没有** `props.active`
 *   - 保留 `min-h-screen` / `pb-*`（高度与底部留白得自己管）
 *   - 模板前后可由 `PAGE_BINDINGS[name].before/after` 插入手写片段（标题栏等）
 * `drop` 是**额外**要丢掉的 `<main>` class（在外壳那套 `VIEW_DROP` 之上）。
 */
const PAGES = [
  { file: 'home.html', name: 'home', img: { 'aida-public': '/static/images/banner-home.jpg' } },
  // 购票页（游览日期 / 入园时段 / 票种）是**二级页**：用户在「景点选择」里选好景点才进来。
  // 它不是 tab，所以顶栏与底部待付条都得自己负责 —— 保留 `min-h-screen` 与 `pb-28`
  // （后者给固定的 BookingBar 让位），去掉给外壳顶栏让位的 `pt-16`，改用自绘标题栏。
  {
    file: 'booking.html',
    name: 'booking',
    img: { 'aida-public': '/static/images/banner-booking.jpg' },
    standalone: true,
    drop: ['pt-16'],
  },
  // 订单支付页：**购票页点「立即预约」之后**才进来的二级页（下单 → 支付 → 凭证）。
  // 它自己也带固定页头与固定底部操作栏，所以是 standalone。
  // 设计稿的固定页头同样拿不到（生成器只取 `<main>` 的子节点），由 before 片段自绘一条，
  // 于是给固定页头让位的 `pt-14` 要去掉 —— 与 booking 页同一个处理。
  { file: 'pay.html', name: 'pay', img: {}, standalone: true, drop: ['pt-14'] },
  { file: 'credential.html', name: 'credential', img: {} },
  { file: 'profile.html', name: 'profile', img: { 'aida-public': '/static/images/bg-profile.jpg' } },
  // 「景点选择」是外壳的**第 2 个 tab**（底栏「预约购票」那一格）。它的设计稿自带固定标题栏，
  // 所以 `pt-14` 要**保留**（那正是给 56px 固定标题栏让位的），由 page-bindings 的 before 供上标题栏。
  // 外壳在这一格不渲染 PageHeader（见 pages/main/index.vue），否则两条横条会叠起来。
  { file: 'areas.html', name: 'area', img: {} },
];

/**
 * 这几个类由「外壳」统一承担，生成视图时要去掉。
 *
 * 为什么要改成单页架构：微信的 tabBar 切换**必然**重建页面视图层，
 * `reLaunch` / `switchTab` / 自定义 tabBar 都躲不开切换闪烁（平台长期问题）。
 * 改成「一个页面 + 四个视图 v-show」后，切页只是 CSS 显隐 —— 没有页面转场，就不可能闪。
 *
 * 代价是布局责任搬家：
 *   - `min-h-screen`：视图不再是整屏，高度由外壳的滚动容器给
 *   - `pb-24` / `pb-28`：底部留白改由底栏自己占位（见 components/TabBar.vue）
 * 顶部的 `pt-16` **保留** —— 给固定顶栏让位仍然靠它（顶栏另有状态栏高度的占位块）。
 */
const VIEW_DROP = new Set(['min-h-screen', 'pb-24', 'pb-28']);

/**
 * 标签映射的关键在于**保持块级/行内的区别**：
 *   HTML 里 div/p/h1-3/li 是块级 → view（块级），span/strong/em 是行内 → text（行内）。
 * 曾经把 div 也映射成 text，结果两个本该上下排列的块级元素变成行内排在一行，
 * 整个卡片布局塌掉 —— 这类偏差肉眼极难定位，务必守住这条不变量。
 *
 * ⚠️ 关于「`<text>` 里嵌 `<view>`」：设计稿里**有**这类写法 —— `material-symbols-outlined`
 * 的图标 span 映射后是 `<view class="msi …">`，而它外面常常裹着一个普通 span（→ `<text>`），
 * 于是产物里出现 `<text>…<view class="msi" />…</text>`（个人中心的「已实名核验」「全部预约单 ›」、
 * 凭证页的「闸机均已联网」、订单支付页的支付方式图标圈都是）。**这是能正常渲染的**，
 * 不要为了「干净」把外层改成 view —— 那会把一个行内元素变成块级，整行排版都会跟着变。
 * （曾以为「<text> 不能包含 <view>」是硬约束，实测不是；这几个页面都已上线验证过。）
 */
const TAG_MAP = {
  // 块级 → view
  div: 'view', header: 'view', main: 'view', nav: 'view', section: 'view', footer: 'view', aside: 'view',
  ul: 'view', li: 'view', p: 'view', h1: 'view', h2: 'view', h3: 'view', h4: 'view', figure: 'view',
  // article 是景区选择页里每张景点卡的容器。漏了它的后果不是「样式不对」而是
  // **整棵子树被丢弃** —— `if (!wxmlTag) return ''` 发生在下降子节点之前。
  article: 'view',
  // 行内 → text
  span: 'text', strong: 'text', em: 'text', b: 'text', i: 'text', small: 'text', label: 'text',
  // 交互 → view（原生 button 自带样式，会与设计稿冲突）
  a: 'view', button: 'view',
  // 表单：uni 的 <input> 是原生组件，标签同名直接映射
  input: 'input',
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

/**
 * 设计稿里的 Google 图片地址 → 本地静态资源。
 *
 * 映射不过来的图**必须吵**：以前是静默 return null，而调用方对 null 的处理是
 * 「整个 `<image>`/`<img>` 不输出」—— 表现是卡片悄悄少了一张图，没有任何提示。
 */
function localizeImageUrl(url, page, where) {
  if (!url) return null;
  if (url.includes('aida-public')) {
    // 每页只有一张位图，按页面归位
    const local = page.img['aida-public'];
    if (local) return local;
  }
  console.error(`✗ ${page.name}：${where} 的图片无法本地化，已从产物里丢弃：${url.slice(0, 90)}…`);
  process.exitCode = 1;
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
  /** 除 <rect> 之外的图形标签（path/circle/…）—— 拿不到就没有对应的画法 */
  const unsupported = new Set();
  const walk = (n, fill) => {
    for (const c of n.children ?? []) {
      if (c.tag === '#text') continue;
      const f = c.attrs?.fill || fill;
      if (c.tag === 'rect') rects.push({ ...c.attrs, fill: f });
      else {
        if (['path', 'circle', 'ellipse', 'polygon', 'polyline', 'line'].includes(c.tag)) unsupported.add(c.tag);
        walk(c, f);
      }
    }
  };
  walk(node, inheritedFill || node.attrs.fill || '#000');

  // 内联 SVG 只能还原成绝对定位的 <view>，而**只有 <rect> 是被支持的**（二维码那套）。
  // <path> 这类画不了，整块图形会静默消失 —— 所以这里必须吵一声。
  // 之所以不判失败：它到目前为止都只是装饰纹样（订单支付页横幅右上角那朵水墨云），
  // 少一朵云不影响任何信息，让人为了修它去手工描一版 view 也不值。
  if (unsupported.size > 0) {
    console.warn(
      `  ! ${page.name}：内联 SVG 里的 <${[...unsupported].join('>、<')}> 无法还原（只支持 <rect>），该图从产物里丢弃`,
    );
  }

  // 一个 rect 都没有 = 什么都画不出来。这时**整块不要输出**，别留一个空壳。
  // 空壳不只是没用：`.pg-svg` 自带 `position: relative`（矩形要靠它当定位基准），
  // 而设计稿这块往往写着 `.absolute` —— 两条规则特异性相同，谁生效只看 CSS 输出顺序，
  // 实测是 `.pg-svg` 赢 ⇒ 一个本该绝对定位的装饰块变成**在文档流里占满 w-28 h-28 的空盒子**。
  // 订单支付页倒计时横幅顶上那一大块空白就是这么来的（112px 的空盒 + 内边距）。
  if (rects.length === 0) return '';

  const cls = mapClasses(node.attrs.class ?? '');
  // 就算有矩形，设计稿自带的定位类与 `.pg-svg` 的 relative 仍会打架，
  // 这里用内联样式把设计稿的意图明确压回去（`position` 内联样式必定赢过类选择器）。
  const pos = (node.attrs.class ?? '').match(/(?:^|\s)(absolute|fixed|sticky)(?:\s|$)/)?.[1];
  const posStyle = pos ? ` style="position:${pos}"` : '';
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

  return `<view class="pg-svg ${cls}"${posStyle}>${body}</view>`;
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

  // — 行为绑定：由 resolveBindings 预扫描后挂在节点上（见下）—
  const binding = node.__binding;
  if (binding?.remove) return ''; // 整段不输出（如后端没有对应概念的营销位）
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
    const src = localizeImageUrl(node.attrs.src, page, '<img>');
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
  // ownClass：整段替换元素自身的 class。用于「元素要改成另一种标签、但设计稿的类
  // 得留给组件根节点」的场合 —— 例如日期条的 scroll-view 自带 flex 滚动类，
  // 改成 <scroll-view> 后这些类要挪进 DateCards 组件，scroll-view 只留 w-full。
  // innerCls：wrapInner 时挪到内部包裹层的原始设计类。
  const ownClass = binding?.ownClass;
  let cls = ownClass ?? (wrapInner ? 'w-full' : mapped);
  const innerCls = wrapInner ? mapped : '';

  // — 背景图：WXSS 不能用本地路径做 background-image，改为插入绝对定位的 <image> —
  let bgImage = '';
  const bgMatch = styleStr.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/);
  if (bgMatch) {
    const src = localizeImageUrl(bgMatch[1], page, 'background-image');
    if (src) {
      // `image` 绑定：把 src 换成表达式。首页 banner 的封面要跟着「当前景点」变，
      // 而这张 <image> 是这里硬编码插进去的、不是设计稿节点，普通绑定够不着它。
      // 表达式取值为空时回落到设计稿那张图 —— 没有这个绑定时与改动前逐字一致。
      const srcAttr = binding?.image ? `:src="${binding.image} || '${src}'"` : `src="${src}"`;
      bgImage = `<image class="pg-bgimg" ${srcAttr} mode="aspectFill" />`;
      // `pg-has-bg` 的作用是给那张绝对定位的 <image> 一个定位基准。
      // **只在元素本身没有被定位时才加** —— 加了它就是 `position: relative`，
      // 而设计稿自己的 `.absolute` 与它特异性相同、谁赢只看 CSS 输出顺序
      // （`.pg-*` 结构类写在 App.vue 里，实际排在工具类之后 ⇒ 会把 `absolute` 压掉、
      //   元素掉回文档流）。本身就是 absolute/fixed/sticky 的元素**照样是有效的定位基准**，
      // 不需要 relative。二维码那块 `<svg>` 踩的是同一个坑（见 renderSvg）。
      if (!/(?:^|\s)(absolute|fixed|sticky|relative)(?:\s|$)/.test(classStr)) cls = `${cls} pg-has-bg`.trim();
    }
  }

  const inlineStyle = buildInlineStyle(styleStr, bgMatch);

  const inText = wxmlTag === 'text';
  const rawInner =
    binding?.text !== undefined
      ? `{{ ${binding.text} }}`
      : binding?.inner !== undefined
        ? binding.inner // 保留元素自身与属性，只把子节点换成模板串
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

  // 原生表单标签：uni 的 <input> 靠这些呈现型属性工作，设计稿写了就带过去。
  // 已由 binding.attrs 声明的以绑定为准（不重复输出同一个属性）。
  if (wxmlTag === 'input') {
    for (const k of ['placeholder', 'type', 'maxlength', 'disabled', 'confirm-type']) {
      if (node.attrs[k] !== undefined && !(k in (binding?.attrs ?? {}))) {
        attrs.push(`${k}="${esc(node.attrs[k])}"`);
      }
    }
  }

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

/**
 * 把 bindings 的每个键解析到设计稿里的**唯一**一个节点上（结果挂在 node.__binding）。
 *
 * 键有两种写法：
 *   '#slotGrid'                              —— 按设计稿预留的 id
 *   'grid grid-cols-3 gap-2.5 text-center'   —— 按 class 列表：空格分隔，全部命中才算匹配
 *
 * 为什么要第二种：设计稿并非每个交互区都留了 id。凭证页的「支持通行方式」、
 * 购票页的出行游客登记与底部待付条，都**一个 id 都没有**，只能按 class 定位。
 *
 * **匹配数必须恰好 1**：多了会静默改错元素、少了会静默不生效，两种都极难排查。
 * 所以这里直接判失败并跳过该页的写出 —— 设计稿一变或选择器写得不够特异，构建立刻炸。
 *
 * 返回问题条数（0 = 全部命中）。
 */
function resolveBindings(tree, bindings, pageName) {
  const entries = Object.entries(bindings ?? {}).map(([key, binding]) => {
    const { selector, nth } = splitNth(key);
    return { key, binding, selector, nth };
  });
  if (!entries.length) return 0;

  for (const e of entries) e.hits = [];
  (function walk(node) {
    for (const c of node.children ?? []) {
      if (c.tag === '#text') continue;
      for (const e of entries) if (matchesSelector(c, e.selector)) e.hits.push(c);
      walk(c);
    }
  })(tree);

  const problems = [];
  for (const { key, binding, hits, nth } of entries) {
    if (nth > 0) {
      // `:nth(N)`：类名完全相同的重复区块，只能靠文档顺序区分（见 splitNth 的说明）。
      // 这时不再要求「恰好 1 个」，但要求**至少 N 个**。
      if (hits.length >= nth) hits[nth - 1].__binding = binding;
      else problems.push(`    ${key}\n      → 只匹配到 ${hits.length} 个元素，取不到第 ${nth} 个`);
    } else if (hits.length === 1) {
      hits[0].__binding = binding;
    } else {
      problems.push(`    ${key}\n      → 匹配到 ${hits.length} 个元素，要求恰好 1 个`);
    }
  }

  if (problems.length) {
    console.error(`✗ ${pageName}：绑定键定位失败，本页不写出`);
    problems.forEach((p) => console.error(p));
    process.exitCode = 1;
  }
  return problems.length;
}

/**
 * 从选择器里拆出可选的 `:nth(N)`（**1 基**）。
 *
 * 为什么需要它：设计稿里有些重复区块**类名一模一样**（比如凭证页的「入园时段 / 持票人」两行、
 * 首页的三张票卡），子集匹配会同时命中好几个，唯一性断言必然失败。
 * 这类地方只能靠「它是第几个」来定位 —— 加个 `:nth(2)` 就表达清楚了。
 * 代价是它不再有「写错会炸」的保护：写错成别的序号也不会报错，只会把绑定挂到另一个同类元素上。
 * 所以**能用唯一 class 定位就别用 :nth**。
 */
function splitNth(key) {
  const m = key.match(/^(.*?)\s*:nth\((\d+)\)\s*$/);
  if (!m) return { selector: key, nth: 0 };
  return { selector: m[1].trim(), nth: Number(m[2]) };
}

function matchesSelector(node, key) {
  // '#id' —— 按 id
  if (key.startsWith('#')) return node.attrs?.id === key.slice(1);
  const have = (node.attrs?.class ?? '').split(/\s+/).filter(Boolean);
  // '= a b c' —— class 完全相等。用于「类很少、且被别的元素包含」的元素：
  //   例如购票页的「已选 N 人」与紧跟的「新增出行人」按钮共享 4 个类，
  //   子集匹配会同时命中两者，只有全等才能把它们分开。
  if (key.startsWith('=')) {
    const want = key.slice(1).split(/\s+/).filter(Boolean);
    return want.length === have.length && want.every((t) => have.includes(t));
  }
  // 其余 —— 子集匹配：列出的 token 全含即命中
  const need = key.split(/\s+/).filter(Boolean);
  if (!need.length) return false;
  return need.every((t) => have.includes(t));
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

  // 关键：<main> 自身的 class 必须带到视图容器上。
  // 其中 pt-16 是给固定顶栏让位的、必须保留（曾经漏掉它，内容顶到屏幕最上沿被顶栏压住）；
  // min-h-screen 与 pb-24/pb-28 是「整页」时代的职责，现在归外壳与底栏，见 VIEW_DROP。
  // standalone 页自己撑满屏，**不受 VIEW_DROP 影响**，只丢 `page.drop` 里点名的（如 `pt-14`）。
  const pageDrop = new Set(page.drop ?? []);
  const mainClasses = mapClasses(source.attrs?.class ?? '')
    .split(/\s+/)
    .filter((c) => c && !(page.standalone ? pageDrop.has(c) : VIEW_DROP.has(c)))
    .join(' ');

  const spec = PAGE_BINDINGS[page.name] ?? {};

  // 绑定先解析成节点上的 __binding —— 定位不唯一就跳过本页，不写出半成品
  if (resolveBindings(tree, spec.bindings, page.name)) continue;

  let tpl = source.children
    .filter((c) => !(c.tag === '#text' && !c.text.trim()))
    .map((c) => render(c, page, { inText: false }))
    .join('\n    ');

  const extraImports = (spec.imports ?? []).join('\n');
  const standalone = !!page.standalone;

  // 手写片段的插入点：`before` 在 tpl 之前、`after` 在之后，都在 .pg-page 包裹内。
  // 用来放设计稿表达不了、或必须与真机对齐的东西（标题栏、toast 等）。
  // ⚠️ 与 `inner`/`replace` 一样**不过 mapClasses** —— 里面的 class 要自己写消毒后的名。
  const before = spec.before ? `${spec.before}\n    ` : '';
  const after = spec.after ? `\n    ${spec.after}` : '';

  const scriptComment = standalone
    ? `// 页面行为（手写，见 pages/${page.name}/behavior.ts）—— 见 scripts/page-bindings.mjs`
    : `// 视图行为（手写，见 views/${page.name}/behavior.ts）—— 见 scripts/page-bindings.mjs`;
  // 独立页面是真实路由，收不到外壳的 props.active，所以不注入这个 prop；
  // 数据加载必须挂在小程序页生命周期（onLoad/onShow）上，见 spec.setup。
  const propsLine = standalone ? '' : 'const props = defineProps<{ active: boolean }>();\n';
  const styleComment = standalone
    ? `// mainClasses 来自设计稿 <main> 的 class（已按 page.drop 去掉给固定顶栏让位的 pt-14）。\n// 标题栏由 page-bindings 的 before 片段自绘，没有外壳底栏。`
    : `// mainClasses 来自设计稿 <main> 的 class（pt-16 等），由生成器带上。\n// 顶栏与底栏不在这里 —— 它们由外壳 src/pages/main/index.vue 只渲染一次。`;

  const vue = `<template>
  <view class="pg-page ${mainClasses}">
    ${before}${tpl}${after}
  </view>
</template>

<script setup lang="ts">
${extraImports}
${scriptComment}
${propsLine}${spec.setup ?? ''}
</script>

<!-- 由 scripts/gen-pages.mjs 从 design/reference/${page.file} 生成，手工改动会被覆盖 -->
<style lang="scss" scoped>
${styleComment}
.pg-page {
  background-color: $c-surface;
}
${spec.style ?? ''}
</style>
`;

  const outDir = standalone ? PAGE_DIR : OUT_DIR;
  mkdirSync(join(outDir, page.name), { recursive: true });
  writeFileSync(join(outDir, page.name, 'index.vue'), vue);
  const lines = vue.split('\n').length;
  const tag = standalone ? ' [页面]' : '';
  console.log(`✓ ${page.name.padEnd(11)} ← ${page.file.padEnd(16)} ${lines} 行，${(vue.length / 1024).toFixed(1)} KB${tag}`);
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
