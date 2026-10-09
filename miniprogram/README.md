# 游客端小程序（uni-app）

景区预约管理及门禁联动系统的游客端，**uni-app + Vue3 + Vite + TypeScript**，只编译微信小程序（mp-weixin）。

一期是 **1:1 界面还原 + 本地交互**：数据用设计稿原文硬编码，尚未接后端接口。

## 现状

| 页面 | 设计稿 | 静态还原 | 视觉动效 | 本地交互状态 |
| --- | --- | --- | --- | --- |
| 景区预约首页 | `design/reference/home.html` | ✅ | ✅ 呼吸点、按下态 | —（本页无选择态） |
| 分时预约购票页 | `design/reference/booking.html` | ✅ | ✅ 日期条横向滚动 + 两端渐隐 | ✅ 选日期 / 选时段 / 勾游客 / 新增出行人 / 底部金额联动 |
| 动态防伪电子凭证页 | `design/reference/credential.html` | ✅ | ✅ 60s 倒计时、二维码刷新、水印时间戳 | ✅ 通行方式三选一 |
| 个人中心 | `design/reference/profile.html` | ✅ | ✅ 按下态 | ✅ 四态筛选 / 刷新离线凭证 → 轻提示 |

> 设计稿里**没有**「展开/收起」控件（早先的说明有误）：个人中心真正可交互的只有那排四态筛选按钮，
> 以及「刷新离线凭证 → 顶部轻提示 2s」—— 后者设计稿自带一段原生 JS 实现。

**尚未做**：与后端接口联调。数据仍是设计稿原文硬编码（`views/*/behavior.ts` 里的常量），
但交互逻辑已就位 —— 接接口时把常量换成 `/api/mini/*` 的返回值即可，组件不用动。

## 已实现的动态效果

设计稿虽然只有静态 HTML，但它在元素 `id` 上预留了交互钩子
（`countdown-text`、`dynamic-qr-svg`、`calendarScroll`、`dateScrollLeftFade` …）。
生成器按这些 id 把行为注入进去（见 `scripts/page-bindings.mjs`），
**版式仍由设计稿生成，动态逻辑写在手写的 `views/*/behavior.ts` 与组件里**。

| 效果 | 实现 | 备注 |
| --- | --- | --- |
| 凭证 60 秒倒计时 | `pages/credential/behavior.ts` | 归零自动刷新二维码。时长 60s、首屏 41s 取自设计稿；接接口后改用 `credential.expiresIn` |
| 二维码刷新 | `components/DynamicQr.vue` | `seed=0` 用设计稿原图案（保证首屏逐像素一致），刷新时按确定性 PRNG 重排数据点、三个定位角不变 |
| 防伪水印时间戳 | 同上 | 三行水印各带当前 `HH:mm:ss`，每秒更新 |
| 日期条两端渐隐 | `pages/booking/behavior.ts` | 监听 `scroll-view` 的 scroll，按滚动位置切 `is-on`/`is-off` |
| 呼吸点 / 刷新旋转 | `styles/utilities.scss` 的 `@keyframes pg-pulse` / `pg-spin` | 由 `animate-pulse` / `animate-spin` 类驱动，两个产物里都已确认生成 |
| 按下态 | 生成器把设计稿的 `active:*` 类挂到 `hover-class` | 见下「按下态必须用 hover-class」 |

### 按下态必须用 hover-class，不能用 `:active`

设计稿有 9 处 `active:*`（`active:scale-[0.98]` / `active:rotate-180` / `active:opacity-90` …）。
生成器最初把它转成 CSS `:active` 伪类 —— 在 H5 里有效，但**微信小程序的 `<view>` 不触发 `:active`**，
真机上一个反馈都没有。现在做法是：

1. `gen-utilities.mjs` 把 `active:*` 生成为**普通类**（`.active-scale-0_98 { transform: scale(.98) }`），不写伪类
2. `gen-pages.mjs` 把这些类从元素的 `class` 里**摘出来**，改挂到 `hover-class` 属性上

`hover-class` 在 H5 与小程序两端都生效，所以这是唯一可靠的写法。

### 交互状态怎么落地：手写组件 + 按 id/class 注入

设计稿只画了**一种**选中组合（10-09 那天选中、08:30-10:30 那个时段选中），
其余状态得自己推。做法是把**只有交互区**抽成手写组件，页面版式仍由设计稿生成：

| 组件 | 挂在设计稿的 | 承载的状态 |
| --- | --- | --- |
| `DateCards.vue` | `#calendarScroll`（`inner`，容器留在页面） | 8 天单选；`约满` 不可选；胶囊三态 |
| `SlotGrid.vue` | `#slotGrid`（`replace`） | 4 时段单选；选中带 `check` 角标 |
| `VisitorPicker.vue` | 游客卡容器（按 class 定位） | 勾选游客、`已选 N 人 / 限购 M 人` |
| `BookingBar.vue` | `.fixed.bottom-16`（按 class 定位） | `待付 ¥{单价×人数} (N人)`；0 人时置灰 |
| `PassPicker.vue` | 通行方式 grid（按 class 定位） | 三选一 |
| `PassFilter.vue` | 四态筛选 grid（按 class 定位） | 四态单选 |
| `AppToast.vue` | `#toastNotification`（`replace`） | 通用轻提示，显现 2s |

绑定规则写在 `scripts/page-bindings.mjs`，由 `gen-pages.mjs` 执行：

- 键可以是 `#id`，也可以是 **class 列表**（`a b c` 子集匹配，`= a b c` 全等匹配）——
  因为**设计稿不是每个交互区都留了 id**：凭证页的通行方式、购票页的游客登记与底部待付条，一个 id 都没有。
- **匹配数必须恰好 1，否则 `npm run gen` 报错并跳过该页**。这是防错的安全阀：
  选择器写宽了会静默改错元素，写窄了会静默不生效，两种都极难排查，所以直接让构建炸。
- `replace` 会把 **id 一起换掉**（元素整个被组件替换），`inner` 只换子节点、保留元素自身。

**两个组件布局上的坑**（踩过）：

1. 自定义组件会**多一层节点**。若把 grid/flex 容器留在页面上、`v-for` 项放在组件里，
   子项就不再是容器的直接子元素，**栅格会塌**。所以 `replace` 用于容器时，
   组件根节点必须自己带容器的 class（各组件里的 `GRID` / `CARD` / `BAR` 常量就是干这个的）。
2. uni-app 的 `<scroll-view>` 会把子元素包进内部容器，布局类必须挪进内层 ——
   日期条改用 `inner` 注入组件后，那层 flex 滚动类就归 `DateCards` 的根节点了。

### ⚠️ 设计稿没给样本、由推断补上的状态

这两处**设计稿里没有对应样本**，是本实现按设计系统推断的。做验收时请按此核对，不要当成还原偏差：

| 处 | 设计稿只有 | 本实现的推断 |
| --- | --- | --- |
| 游客未勾选态的单选圈 | 「已勾选」一个样本（`border-2 border-primary` + `bg-primary/10` + 内层实心点） | 外圈改中性描边 `border-silk-border`、去掉 `bg-primary/10`、不渲染内层实心点 |
| 「选中 + 紧张」的日期卡 | 选中卡恒为「充足」，胶囊是白透底 `bg-white/20` | 选中卡的状态胶囊**统一用白透底**、只换文案；不叠加琥珀色（白透底在青绿渐变上可读，琥珀叠上去会脏） |

另有一处**看着像 bug、其实设计稿原样如此**：个人中心「待入园·进行中行程」卡里
`闸机离线核验码已同步` 被截断成 `闸机离线核验…`，且改签/退款与显示入园码挤在一行 ——
设计稿参考图（`design/reference/shots/ref-profile.png`）里一模一样，不是转换失真。

### 单页架构：为什么整站只有一个页面

**微信小程序里换「页面」，一定重建视图层，切换时一定会闪。**
`reLaunch`、`switchTab`、自定义 tabBar 都躲不开 —— 这是平台固有问题（社区从 2019 年反馈至今），
配置层面无法根除。所以本项目放弃多页面，改成：

```
src/pages/main/index.vue          唯一页面（手写外壳）
  ├─ PageHeader                    只渲染一次
  ├─ .pg-shell__body               flex:1
  │    └─ 每个视图一个 scroll-view（v-if 懒挂载 + v-show 保留）
  │         src/views/{home,booking,credential,profile}/index.vue   ← 生成器产出
  └─ TabBar                        只渲染一次，纯受控（只 emit，不导航）
```

切页 = 改一个 ref、CSS 显隐 —— **没有页面转场，就不可能闪**；顶栏底栏也不再随切换重建。
`pages.json` 只剩 `pages/main/index` 一个页面，没有任何 tabBar 配置。

**每个视图各自的 scroll-view 是必需的**：只有一个页面时，若让文档滚动，
四个 tab 会共用同一个滚动位置（切过去会停在半路）。各自一个容器，滚动位置就互不干扰。

**懒挂载 + v-show，而不是一上来全挂载**：全挂载会让首屏同时渲染 4 个视图；
全用 `v-if` 则每次切换都重建组件、视图内的状态（购票页选好的日期、凭证倒计时）会丢。
折中是「首次访问才挂载，之后只做显隐」—— 顺带解决了一个隐蔽问题：
**视图首次挂载时一定可见**，所以购票页那段「量 date strip 宽度」的代码拿得到真实值，
`views/booking/behavior.ts` 一行都不用为单页架构改。

**布局责任重新划分**（`gen-pages.mjs` 的 `VIEW_DROP`）：

| 设计稿 `<main>` 上的类 | 单页架构下 |
| --- | --- |
| `pt-16`（给固定顶栏让位） | **保留在视图上**。顶栏另补一个状态栏高度的占位块，见「已知偏差」 |
| `min-h-screen` | **去掉** —— 视图不再是整屏，高度由外壳的滚动容器给 |
| `pb-24` / `pb-28`（给底部 tab 让位） | **去掉** —— 改由 `TabBar.vue` 自己用一个等高占位块承担 |

**代价（务必知道）**：全站现在是**一个页面**。以后加详情页、下单页这类**真正的子页面**时，
把它们作为独立页面 `navigateTo` 上去即可（子页面本来也没有切换闪烁问题）；
但如果哪天需要「分享链接直接打开某个 tab」，得走 `pages/main/index` 的查询参数（目前没做）。

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

### ⚠️ 改完代码后页面报 `module '...' is not defined`

现象是在开发者工具里看到：

```
module 'pages/booking/behavior.js' is not defined, require args is './behavior.js'
Component is not found in path "wx://not-found"
```

**这不是代码问题**，产物本身完整、所有相对 `require` 都能解析（可用 `node` 逐文件核）。
是两个**工具侧**原因叠加：

1. **`uni build` 会先清空整个产物目录再重写。** 若工具正开着该目录，清空那一刻
   模拟器会扑空。工具日志里能看到铁证：一轮 `unlinkDir pages/...`（整目录被删），
   紧接着 `appservice simulator launch catch error Error: app.json: 在项目根目录未找到 app.json`，
   隔几秒才是 `add ...` 全量补回。
2. **新增的文件不会被热编译。** 保存改动会自动编译进工具，但**新加的文件除外**
   （uni-app 的既有行为）。本项目只在 Phase ① 新增过 `pages/*/behavior.js`，
   而报错也**恰好只出在这两个文件**上——同批的 `common/vendor.js`、`common/assets.js`
   因为早就在工程里，一直正常。这条差异把原因钉死了。

   > 这条与构建方式无关，**每次新增源文件都要留意**：交互组件那一批
   > （`DateCards`/`SlotGrid`/`VisitorPicker`/`BookingBar`/`PassPicker`/`PassFilter`/`AppToast`
   > 与 `pages/profile/behavior.ts`）就是 8 个新文件，构建后需要重新编译或重开项目一次。

**处理**（按顺序试，一般第一步就好）：

1. 开发者工具的 **清缓存 → 全部清除**，然后重新编译；
2. 还不行就 **关闭项目重新导入**（重开会把所有文件在启动时重新登记，绕开增量状态）；
3. 仍不行则换基础库版本或重装工具 —— 社区里 `require is not defined` 类问题有过这种解法。

**怎么避免再踩**：把工具切到 `dist/dev/mp-weixin`，让 `npm run dev:mp-weixin` 常驻。
dev 侧是**增量构建**——只重写变更文件、不做整目录清空，没有上述空窗期。
（注意第 2 条与构建方式无关，新增文件时仍需重新编译或重开项目。）

## 目录

```
miniprogram/
├── src/
│   ├── pages/main/index.vue    # 唯一页面：外壳（手写），顶栏+四个视图+底栏
│   ├── views/{home,booking,credential,profile}/index.vue   # 四个视图（生成，见下）
│   ├── views/*/behavior.ts     # 视图行为与 mock 数据（手写）
│   ├── components/             # 手写组件：共用头尾 + 7 个交互区（见「交互状态怎么落地」）
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
| `gen-qr-pattern.mjs` | `design/reference/credential.html` → `components/qr-pattern.ts` | 二维码 SVG 的 58 个方块 → 数据 |
| `gen-pages.mjs` | `design/reference/*.html` → `pages/*/index.vue` | HTML → WXML 模板 + 行为注入 |

`npm run gen` 全部重跑。`scripts/render-reference.sh`（`npm run ref:shots`）把设计稿渲染成参考图，
用于像素比对 —— **必须走代理**，原因见该脚本头部注释。

校验脚本（不在 `gen` 流水线里，单独跑）：

| 脚本 | 作用 |
| --- | --- |
| `npm run check:classes` | 检查所有 `.vue` 用到的 class 都有出处（在 `classmap.json` 里，或是 `pg-`/`is-`/`msi`/`icon-` 自有类）。**交互组件的 class 是手写从设计稿搬的**，拼错一个字符不会报错、只会静默少一条样式，肉眼查不出来 |

> 这个校验抓到过真问题：Phase ① 手写的 `PageHeader.vue` / `TabBar.vue` 里留着**未消毒的原始类名**
> `text-[19px]` / `text-[24px]`（生成器只产出消毒名 `text-19px`），WXSS 里根本没有这些规则，
> 而 `.msi` 图标是 `width:1em;height:1em` —— **图标尺寸完全由 font-size 决定**，于是三个图标一直按继承字号渲染。

**页面的 `.vue` 由生成器覆盖，手改会丢。** 要改页面，要么改生成器、要么改完再把改动回灌到生成器。
接后端接口时建议：把生成出的模板重构成「组件 + `mock.ts` 数据」，届时 `gen-pages.mjs` 作为版式参照保留。

### 转换时的几个关键约定

- **`<div>` → `<view>`，`<span>` → `<text>`**：必须保留 HTML 的块级/行内区别。
  曾把两者都映射成 `<text>`，结果两个本该上下排列的元素挤成一行，整张卡片塌掉。
- **必须补 Tailwind preflight 的边框重置**（见 `App.vue` 的 `border-width: 0; border-style: solid`）。
  设计稿靠 preflight 把「没有宽度类」的边框压成 0；**我们漏了这条，于是凭空长出 3px 粗边框**：
  `border-dashed` 只设 `border-style`，没设宽度的三边会取 CSS 初始值 `medium` = 3px。
  表现是首页票卡里本应「只有上边一条虚线」的分隔线（`border-t border-dashed`），
  在实现里变成了四边 3px 的虚线方框。**这条一直没被发现，是因为它只在首页出现，
  而当时只逐像素比对了购票/凭证/个人中心三页。**
  （重置用标签选择器，特异性低于工具类，带宽度类的元素不受影响。）
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
| **顶栏下方多一个状态栏高度的占位块** | 设计稿的 `<main>` 只有固定的 `pt-16`（64px），那是按**没有状态栏**画的；而顶栏是「状态栏 + 56px」，真机上状态栏 40+px，于是内容被顶栏盖住（实测 44px 状态栏下被遮 37px）。H5 看 **不出来**，因为状态栏为 0 | `PageHeader` 里加了一个高度 = 真实状态栏的占位块。H5 上高度为 0、与设计稿逐像素一致；真机上自动让位，间距恒为 7px。**不能用 uni-app 的 `--status-bar-height` 代替** —— 它在产物里是构建时写死的 `25px`，运行时不更新 |

## 体积

构建后主包约 **708 KB**（上限 2 MB）：

| 组成 | 大小 |
| --- | --- |
| `app.wxss`（字体 + 图标 + 工具类，base64 后膨胀） | 144 KB |
| `static/`（3 张位图） | 172 KB |
| `components/`（共用头尾 + 7 个交互组件，含各自的 wxml/wxss/js/json） | 140 KB |
| `views/`（四个视图的 wxml/wxss/js/json） | 132 KB |
| `common/`（vendor 等） | 76 KB |
| `pages/`（唯一页面的外壳） | 24 KB |

比纯静态时增长约 124 KB，来自 7 个交互组件、四个视图与外壳 —— 离上限还很远。

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
