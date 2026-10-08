# 设计稿原始素材

Stitch 项目 *Scenic Spot Reservation UI System*（设计系统「Cyan Ink & Bamboo Stone」）导出的 4 份页面 HTML，
以及从项目设计系统导出的 token。

这些是 `scripts/gen-utilities.mjs`（工具类清单）与 `scripts/gen-pages.mjs`（页面模板）的输入，
**不要手改**。改设计请回 Stitch 改，然后重新拉取 + `npm run gen`。

| 文件 | 页面 |
| --- | --- |
| `home.html` | 景区预约首页 |
| `booking.html` | 分时预约购票页 |
| `credential.html` | 动态防伪电子凭证页 |
| `profile.html` | 个人中心 |

## 关于这些 HTML

Stitch 的导出是自包含页面：**Tailwind CDN + 内联 `tailwind.config`（含全套设计 token）+ Google Fonts**，
版式全部写在 Tailwind 工具类里。每页 158–236 个标签。

- `classes.json` 是 4 份 HTML 里所有 class 的去重清单（419 个），由 `scripts/` 提取
- `classmap.json` 是「设计类名 → 安全类名」的映射表（WXSS 选择器不能可靠地处理 `[ ] . / #`）
- `latin-chars.txt` 是设计稿用到的全部非中日韩字符（77 个），用于给 Google Fonts 做子集
- `icons.txt` / `icons-svg/` 是 44 个 Material Symbols 图标名与 SVG 缓存
- `fonts-cache/` 是 3 个拉丁子集 woff2 缓存（有缓存时 `gen:fonts` 不需要联网）

## 重新拉取设计稿

> 前提：Stitch 项目必须是 `visibility: PUBLIC`，否则读文件返回 **403**。

```bash
KEY=$(node -e "
  const c=require(process.env.HOME+'/.claude.json'); let f=null;
  (function g(o){if(!o||typeof o!=='object'||f)return;
    for(const k of Object.keys(o)){ if(k==='stitch'){f=o[k];return;} else if(typeof o[k]==='object') g(o[k]); }})(c);
  process.stdout.write(f?.headers?.['X-Goog-Api-Key']||'');")

PID=11259660976104163178
# 列屏幕，拿 name/title/htmlCode.name
curl -s "https://stitch.googleapis.com/v1/projects/$PID/screens?key=$KEY" | head -c 2000
# 单个屏幕详情（含 htmlCode.name 这个文件 id）
curl -s "https://stitch.googleapis.com/v1/projects/$PID/screens/<screenId>?key=$KEY"
# 取 HTML：直接回传内容，不用碰那个要登录的 CDN
curl -s "https://stitch.googleapis.com/v1/projects/$PID/files/<fileId>:download?key=$KEY"
# → {"dataString":"<!DOCTYPE html>…"}，取出 dataString 即完整 HTML
```

**两个坑**

1. `htmlCode.downloadUrl` / `screenshot.downloadUrl` 这两个 CDN 链接（`contribution.usercontent.google.com`、
   `lh3.googleusercontent.com`）**始终需要 Google 浏览器会话**，`curl` 一律 302 到登录页，加 API key 也没用。
   走 `files/{id}:download` 才是可用的 API 路径。
2. 只把项目设为 PUBLIC 还不够 —— **2026-10-09 之前**，即使项目公开，`files/{id}:download` 也返回 403
   （用不存在的文件 id 打也返回 403 而非 404，说明是权限校验先于存在性校验）。
   公开后可正常下载。

## 设计系统 token

设计 token 已落到 `src/styles/tokens.scss`（手写、唯一事实来源）。
重新导出请调 Stitch 的 `list_design_systems` / `get_project`，`designTheme.designMd` 字段含完整规范
（67 个命名色、字号体系、间距、圆角，以及组件规格如 `TimeSlotGrid`、动态票据 `/pages/ticket/pass`）。

## 参考截图

`shots/ref-*.png` 是这 4 份 HTML 在 390pt 宽下的渲染结果，用于与实现做像素比对。
**渲染时必须让 Chrome 走代理**（`--proxy-server=http://127.0.0.1:7897`），否则 Tailwind CDN 与
Google Fonts 加载失败，图标会退化成连字文本（`arrow_forward` 会渲染成一行文字），
行高被撑大、截图失真 —— 用这种截图做比对会得出完全错误的结论。
