# 游客端小程序（uni-app）

景区预约管理及门禁联动系统的游客端，**uni-app + Vue3 + Vite + TypeScript**，只编译微信小程序（mp-weixin）。

一期是**纯静态 1:1 界面还原**：数据用设计稿原文硬编码，尚未接后端接口。

## 现状

| 页面 | 设计稿 | 状态 |
| --- | --- | --- |
| 景区预约首页 | `design/reference/home.html` | ✅ 已还原 |
| 分时预约购票页 | `design/reference/booking.html` | ✅ 已还原 |
| 动态防伪电子凭证页 | `design/reference/credential.html` | ✅ 已还原（含二维码） |
| 个人中心 | `design/reference/profile.html` | ✅ 已还原 |

设计来源：Stitch 项目 *Scenic Spot Reservation UI System*，设计系统「Cyan Ink & Bamboo Stone」。
重新拉取设计稿的方法见 `design/reference/README.md`。

## 开发

```bash
npm install
npm run dev:mp-weixin      # 产物在 dist/dev/mp-weixin
npm run build:mp-weixin    # 产物在 dist/build/mp-weixin

npm run dev:h5             # 浏览器预览（快速看效果用，非交付目标）
npm run build:h5

npm run gen                # 重新生成样式与页面（见下「代码生成」）
npm run type-check
```

**微信开发者工具导入 `dist/dev/mp-weixin`（或 `dist/build/mp-weixin`）目录**，不是工程根目录 ——
小程序源码根是 uni-app 的编译产物，不是 `src/`。appid 已写在 `src/manifest.json` 的 `mp-weixin.appid`。

> 工程根目录**不放** `project.config.json`：uni-app 每次构建都会往产物目录里生成一份（含 appid），
> 根目录再放一份只会导致「改了不生效」的困惑。

## 目录

```
miniprogram/
├── src/
│   ├── pages/{home,booking,credential,profile}/index.vue   # 4 个页面（生成，见下）
│   ├── components/{PageHeader,TabBar}.vue                  # 共用头尾
│   ├── styles/tokens.scss      # 设计 token（手写，唯一事实来源）
│   ├── styles/{utilities,icons,fonts}.scss                 # 生成，勿手改
│   ├── static/images/          # 3 张设计稿位图
│   ├── uni.scss                # 变量入口，uni-app 自动注入每个 SFC
│   ├── App.vue                 # 全局样式与结构类
│   └── pages.json / manifest.json
├── scripts/                    # 4 个生成器，见下
└── design/                     # 设计稿原始素材与中间产物
```

## 代码生成（重要）

设计稿是机器生成的 Tailwind 页面（419 个工具类、约 800 个标签）。手抄既慢又必然出错，
所以**样式与页面模板都由脚本生成**——把转换规则写成确定的表，产物可复核、可重跑：

| 脚本 | 输入 → 输出 | 作用 |
| --- | --- | --- |
| `gen-utilities.mjs` | `design/classes.json` → `styles/utilities.scss` | Tailwind 类 → WXSS |
| `gen-icons.mjs` | `design/icons.txt` → `styles/icons.scss` | Material Symbols SVG → base64 mask |
| `gen-fonts.mjs` | `design/latin-chars.txt` → `styles/fonts.scss` | Google Fonts 拉丁子集 → base64 |
| `gen-pages.mjs` | `design/reference/*.html` → `pages/*/index.vue` | HTML → WXML 模板 |

`npm run gen` 全部重跑。

**页面的 `.vue` 由生成器覆盖，手改会丢。** 要改页面，要么改生成器、要么改完再把改动回灌到生成器。
接后端接口时建议：把生成出的模板重构成「组件 + `mock.ts` 数据」，届时 `gen-pages.mjs` 作为版式参照保留。

### 转换时的几个关键约定

- **`<div>` → `<view>`，`<span>` → `<text>`**：必须保留 HTML 的块级/行内区别。
  曾把两者都映射成 `<text>`，结果两个本该上下排列的元素挤成一行，整张卡片塌掉。
- **类名做「消毒」**：WXSS 选择器对 `[ ] . ( ) # /` 支持不可靠，
  故 `text-[19px]` → `.text-19px`、`gap-2.5` → `.gap-2_5`、`bg-primary/10` → `.bg-primary_10`。
  完整映射表在 `design/classmap.json`。
- **输出顺序按 CSS 语义分层，不按字母序**：所有工具类都是单类选择器、特异性相同，靠后写的赢。
  按字母序会让 `border-t`（设 `border-style: solid`）排在 `border-dashed` 之后，把虚线覆盖成实线。
- **rpx 换算系数是 ×750/390（≈1.9231），不是 ×2**：设计画布 390pt（Stitch 报的 780 是 2 倍图），
  uni-app 约定 750rpx = 屏宽。按 ×2 会让元素在 390pt 机型上大约 4%。
  ≤1.5px 的细线与 box-shadow 的偏移量保持 px，避免低 DPR 取整后细线消失。
- **内联 `<svg>` 转成百分比定位的 `<view>`**：小程序没有 `<svg>` 标签。
  凭证页的二维码 SVG 是 `viewBox="0 0 100 100"` 下的 58 个 `<rect>`，按百分比还原后位置精确，无需 canvas。
- **背景图用绝对定位的 `<image>`，不用 `background-image`**：WXSS 禁止背景图用本地路径，
  外链（设计稿用的是 `lh3.googleusercontent.com`）在国内也不可达。
  配套的 `.pg-bgcontent` 负责把原始内容提到背景图之上（否则会被绝对定位的图片盖住）。

## 设计 token 与样式

`src/styles/tokens.scss` 是**唯一手写的事实来源**（67 个命名色、字号体系、间距、圆角、阴影）。
`gen-utilities.mjs` 会解析它取色值，所以改色只需改这一处。再跑 `npm run gen:utilities`。

变量与函数放在 `src/uni.scss`（uni-app 会自动注入每个 SFC 的 `<style>`，页面里可直接用
`$c-primary`、`px2rpx()`）。**`uni.scss` 及它 import 的文件里只能放变量与函数**——
它会被复制进每个组件的样式块，写选择器会让产物急剧膨胀。

全局规则（`box-sizing`、页面底色、`.pg-*` 结构类）在 `App.vue` 的 `<style>` 里。

> `box-sizing: border-box` 的全局声明不能省：`box-sizing` 不可继承，
> 漏掉它会让「`h-full` + `p-4`」算成「100% 内容高 + 32px 内边距」，撑破固定高度的容器。

## 已知偏差

这些是**有意为之或平台限制**，不是实现缺陷。做验收时请按此清单核对：

| 项 | 原因 | 表现 |
| --- | --- | --- |
| **header 不绘制微信胶囊** | 真机上微信会渲染真实胶囊，自绘必然重叠 | 用 `getMenuButtonBoundingClientRect()` 预留位置；与设计稿截图在 header 右侧有可见差异，真机上反而正确 |
| **中文标题非宋体** | Google Fonts 国内不可达；中文字体子集 2–5MB 会超主包 2MB 上限 | 中文走系统字体栈，书卷感减弱，字号/字重仍对齐。**注：设计稿本身也没给中文指定衬线字体**（Noto Serif 不含 CJK 子集），所以偏差幅度小于预期 |
| **`backdrop-blur` 降级** | 小程序渲染器对 `backdrop-filter` 支持不稳 | 毛玻璃变高不透明度纯色。设计稿在这些位置本就用了 90–95% 不透明度底色，差异很小 |
| **无 hover 态** | 触屏无指针悬停 | `hover:*` / `group-hover:*` / `selection:*` 共 27 个类被丢弃，改用 `hover-class` 表达按下态 |
| **栅格用 CSS Grid** | 曾用「flex + 子项百分比宽度」，叠加 `gap` 后超过 100% 导致换行错乱 | `grid-cols-N` → `grid-template-columns: repeat(N, minmax(0,1fr))` |

## 体积

构建后主包约 **584 KB**（上限 2 MB）：

| 组成 | 大小 |
| --- | --- |
| `app.wxss`（字体 69K + 图标 58K + 工具类 21K，base64 后膨胀） | 143 KB |
| `common/vendor.js` | 68 KB |
| 3 张位图 | 160 KB |
| 其余（页面 wxml/js） | ~40 KB |

字体是 3 个**可变字体**文件（按字重区间声明）——曾按字重逐个生成，同一份文件被内嵌 3–4 遍，243 KB → 68.9 KB。
图标 44 个用 `-webkit-mask-image` 而非把颜色烘进 SVG：设计稿里同一图标有 9 种着色，
mask 方案下每个图标只需一份 SVG，颜色由 `background-color` 决定。

## 依赖版本（改动前务必读）

uni-app 的 Vue3 线**没有纯稳定版**，全部是日期戳版本，且**各包必须完全一致**：

- `@dcloudio/*` 六个包统一钉 `3.0.0-alpha-5030120260930001`（`vue3` dist-tag）。
  注意 `latest` dist-tag 指向的是 **Vue2** 线（`2.0.2-*`），照它装会得到 Vue2 产物。
- `vite` 精确锁 `5.2.8` —— `vite-plugin-uni` 的 peerDependency 是**精确版本**，不是范围。
- `vue` 锁 `3.4.21` —— 与 `vite-plugin-uni` 内置的 `@vue/compiler-sfc` 对齐。
- `sass` 锁 `1.77.8` —— 更高版本会大量报 legacy JS API 弃用告警。
- 包管理器用 **npm**（不是 pnpm）：uni-app 的 vite 插件与 pnpm 严格符号链接存在已知摩擦。

不要把 `admin-web` 的依赖（`rolldown-vite@7`）与这里混用，两者 vite 主版本不同。
