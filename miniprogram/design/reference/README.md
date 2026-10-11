# 设计稿原始素材

Stitch 项目 *Scenic Spot Reservation UI System* 导出的 7 份页面 HTML，以及从项目设计系统导出的 token。

⚠️ **这套稿子里其实有两套设计系统**：前 6 份是「青绿典雅版」（设计系统 **Cyan Ink & Bamboo Stone**，
token 落在 `src/styles/tokens.scss` 的上半部分）；`map.html`（Stitch 屏
`987a340983404a88920be442d9e67991`「景区地图与景点 (青绿简约版)」）用的是**另一套命名**
（`bamboo-teal` / `paper-pure` / `ink-subtle` / `font-serif-cn` / `font-num` / `rounded-card` …），
值也不全一样 —— 它自带的 `tailwind.config` 写在 HTML 头部，那份就是权威取值。
**两套并存**（底下那 10 个 `$c-bamboo-* / $c-ink-* / $c-amber-* / $c-paper-pure` 就是给它加的），
没有合成别名：详见 `tokens.scss` 里那段注解与 CLAUDE.md 的相应条目。
它的三个族名在 `gen-utilities.mjs` 的 `FONT_TOKENS` 里**都指向我们的两套字体**
（`font-num` 是已退役的 Space Grotesk ⇒ 正文族），这是「统一整体字体」那条要求的落点。

这些是 `scripts/gen-classes.mjs`（类名清单）、`scripts/gen-utilities.mjs`（工具类样式）
与 `scripts/gen-pages.mjs`（页面模板）的输入，**不要手改**。
改设计请回 Stitch 改，然后重新拉取 + `npm run gen`。

| 文件 | 页面 | 产物 |
| --- | --- | --- |
| `home.html` | 景区预约首页 | `src/views/home/index.vue` |
| `booking.html` | 分时预约购票页 | `src/views/booking/index.vue` |
| `credential.html` | 动态防伪电子凭证页 | `src/views/credential/index.vue` |
| `profile.html` | 个人中心 | `src/views/profile/index.vue` |
| `areas.html` | 景点选择与预约 | `src/views/area/index.vue`（**外壳的第 2 格**，见下） |
| `pay.html` | 订单支付 | `src/pages/pay/index.vue`（**独立页面**，见下） |
| `map.html` | 景区地图与景点 | `src/pages/map/index.vue`（**独立页面**，见下） |

前 4 份是「单页外壳」里的视图（`gen-pages` 会拿掉 `min-h-screen`/`pb-24`，因为高度与底部留白
由外壳与底栏负责）；`booking.html` 与 `pay.html` 在 `PAGES` 里标了 `standalone: true`
—— 它们产出到 `src/pages/`，是**真实页面**（自带路由）：保留整屏高度、不注入 `props.active`、
数据加载挂在小程序页生命周期上。`areas.html` 现在也是外壳视图（底栏第 2 格）。

⚠️ **生成器只取 `<main>` 的子节点，`<header>` 一律丢掉**（它进不了 WXML）。所以设计稿画了
固定页头的 `areas/booking/pay` 三页，标题栏都由 `page-bindings.mjs` 的 `before` 片段自绘；
三份设计稿的 `<main>` 上都有给那个固定页头让位的类（`pt-14` / `pt-16`），
凡是自绘标题栏的就用 `drop: [...]` 去掉它，别让 56px 的留白和自绘的横条叠起来。

## 手工补过的 id

`page-bindings.mjs` 的定位器要求**恰好命中 1 个**元素，个别位置没有任何能唯一定位的类，
于是直接在这两份设计稿里补了 id（改设计稿、不改产物，下次 `npm run gen` 才会复现）：

- `profile.html`：`#app-version`（页脚版本行连 class 都没有）
- `pay.html`：`#visitors-title`（那 4 个类与抽屉里的「金额明细」h4 完全相同）

重新从 Stitch 拉稿会把这些 id 冲掉 —— 拉完 `gen:pages` 会立刻报「绑定键定位失败」，
按报错把 id 补回去即可。

## 关于这些 HTML

Stitch 的导出是自包含页面：**Tailwind CDN + 内联 `tailwind.config`（含全套设计 token）+ Google Fonts**，
版式全部写在 Tailwind 工具类里。每页 168–248 个标签。

- `classes.json` 是这 7 份 HTML 里所有 class 的去重清单（**615 个**），由 `npm run gen:classes` 从
  HTML 重新提取。⚠️ 在这之前它是个**手工维护的静态文件**（没有生成器，加一页设计稿就得手补类名，
  漏一个的后果是静默少一条样式）—— 现在是派生产物，别再手改
- `classmap.json` 是「设计类名 → 安全类名」的映射表（WXSS 选择器不能可靠地处理 `[ ] . / #`）
- `latin-chars.txt` 是设计稿用到的全部非中日韩字符（77 个），用于给 Google Fonts 做子集
- `icons.txt` / `icons-svg/` 是 72 个 Material Symbols 图标名与 SVG 缓存
- `fonts-cache/` 是 3 个拉丁子集 woff2 缓存（有缓存时 `gen:fonts` 仍然要联网，只是不下载字体文件）

## 重新拉取设计稿

> 前提：Stitch 项目必须是 `visibility: PUBLIC`，否则读文件返回 **403**。

```bash
KEY=$(node -e "
  const c=require(process.env.HOME+'/.claude.json'); let f=null;
  (function g(o){if(!o||typeof o!=='object'||f)return;
    for(const k of Object.keys(o)){ if(k==='stitch'){f=o[k];return;} else if(typeof o[k]==='object') g(o[k]); }})(c);
  process.stdout.write(f?.headers?.['X-Goog-Api-Key']||'');")

PID=11259660976104163178
# 1) 列屏幕，拿每个屏幕的 id / title
curl -s "https://stitch.googleapis.com/v1/projects/$PID/screens?key=$KEY" > /tmp/screens.json
# 2) 取单个屏幕详情 —— htmlCode.downloadUrl 就是要的那份 HTML
curl -s "https://stitch.googleapis.com/v1/projects/$PID/screens/<screenId>?key=$KEY" > /tmp/screen.json
# 3) 直接把 downloadUrl 存成文件（实测 2026-10-10 起可直连，不再需要浏览器会话）
curl -sL "$(node -e "process.stdout.write(require('/tmp/screen.json').htmlCode.downloadUrl)")" -o design/reference/<name>.html
```

**坑（两条都已过期，留着是为了说明为什么文档里曾经写着「下不了」）**

1. ~~`htmlCode.downloadUrl` 需要 Google 浏览器会话~~ —— **2026-10-10 实测已可直连**（`curl -sL` 返回
   200 与完整 HTML）。老屏幕的 `htmlCode.name` 形如 `projects/{pid}/files/{数字}`，新屏幕是
   `projects/{pid}/screens/{sid}/fileEntries/html`，后者用 `files/{id}:download` 会 404 —— 所以**统一走
   `downloadUrl` 最省事**，别去拼 `files/...` 路径。
2. ~~只把项目设为 PUBLIC 还不够~~ —— 现在公开后即可下载。

> ⚠️ **小心「Generating Screen...」**：项目里存在若干还没生成完的占位屏，标题就是这串字、
> `htmlCode` 为 `null`。按用户给的 ID 拉之前先列一遍屏幕核对 title，别把占位屏当成设计稿。

拉完新页面之后必须按顺序重跑（`gen:fonts` 要联网，本机会失败，所以别用 `npm run gen`）：
```bash
npm run gen:classes && npm run gen:utilities && npm run gen:icons && npm run gen:pages
```
`gen:classes` 会把新稿的类名并进 `classes.json`；`gen:utilities` 若遇到「译不出又不在
`INTENTIONAL_DROP` 里」的类会**非 0 退出并点名**（以前是静默无样式）。

## 设计系统 token

设计 token 已落到 `src/styles/tokens.scss`（手写、唯一事实来源）。
重新导出请调 Stitch 的 `list_design_systems` / `get_project`，`designTheme.designMd` 字段含完整规范
（67 个命名色、字号体系、间距、圆角，以及组件规格如 `TimeSlotGrid`、动态票据 `/pages/ticket/pass`）。

## 参考截图

`shots/ref-*.png` 是这些 HTML 在 390pt 宽下的渲染结果（含本轮的 `ref-map.png`），用于与实现做像素比对。
**渲染时必须让 Chrome 走代理**（`--proxy-server=http://127.0.0.1:7897`），否则 Tailwind CDN 与
Google Fonts 加载失败，图标会退化成连字文本（`arrow_forward` 会渲染成一行文字），
行高被撑大、截图失真 —— 用这种截图做比对会得出完全错误的结论。
