# 后台管理系统（admin-web）

景区预约管理及门禁联动系统的后台管理前端。

基于 [SoybeanAdmin Element Plus 版](https://github.com/soybeanjs/soybean-admin-element-plus) v1.4.0 二次开发
（Vue 3.5 + Vite(rolldown) + TypeScript + Element Plus 2.13 + UnoCSS + Pinia + ECharts 6，MIT License，版权归 Soybean 所有）。

## 开发

```bash
pnpm install
pnpm dev          # http://localhost:9527 ，需先启动后端 server
pnpm typecheck    # vue-tsc
pnpm build        # 产物在 dist/
```

后端需运行在 `http://localhost:3000`（见 `../server`），默认账号 `admin / admin123`。

## 与后端的对接约定

### 环境变量（`.env` / `.env.test` / `.env.prod`）

| 变量 | 值 | 说明 |
| ---- | -- | ---- |
| `VITE_SERVICE_BASE_URL` | 开发 `http://localhost:3000/api`，生产 `/api` | 开发时经 Vite 代理（`/proxy-default`）转发 |
| `VITE_SERVICE_SUCCESS_CODE` | `0` | 后端统一响应体 `{code,msg,data}` 的成功码 |
| `VITE_SERVICE_LOGOUT_CODES` | `40100` | 后端 401 → 前端自动登出跳登录页 |
| `VITE_SERVICE_MODAL_LOGOUT_CODES` | `40300` | 后端 403 → 弹窗提示后登出 |
| `VITE_SERVICE_EXPIRED_TOKEN_CODES` | 空 | 后端未提供 refreshToken，置空避免误触发刷新 |
| `VITE_STATIC_SUPER_ROLE` | `super` | 超管角色 code，拥有全部路由 |

后端响应体封装见 `server/src/common/interceptors/transform.interceptor.ts`，
错误码规则见 `all-exceptions.filter.ts`（HTTP 状态码 ×100）。

### 认证与权限映射

接口层在 `src/service/api/auth.ts`，把后端 profile 映射成模板的 `Api.Auth.UserInfo`：

| 模板字段 | 来源 | 用途 |
| -------- | ---- | ---- |
| `userId` | `profile.id` | 会话切换检测 |
| `userName` | `profile.realName \|\| username` | 头像下拉展示 |
| `roles` | `profile.roles[].code` | 路由 `meta.roles` 过滤（super/admin/checker/finance/ops/leader） |
| `buttons` | `profile.permissions` | 按钮级权限 `useAuth().hasAuth('ticket:create')` |

后端权限标识（`@Permissions('resource:action')`，超管为 `*`）与前端按钮校验**直接复用**，无需二次映射。
路由权限写在页面 `meta.roles` 里，超管经 `VITE_STATIC_SUPER_ROLE` 直通。

### 路由

采用 `VITE_AUTH_ROUTE_MODE=static` + elegant-router 文件路由：`src/views/**` 的新增/删除会自动同步路由（`pnpm gen-route` 手工生成）。

业务路由在 `src/router/routes/index.ts` 的 `customRoutes` 中**手写声明**（可指定中文标题、图标、排序与 `meta.roles` 权限），并在 `build/plugins/router.ts` 的 `customRoutes.names` 中登记，避免 elegant-router 重复生成。

### 页面文案：业务页不做 i18n

模板的 i18n 需要三处同步维护（`src/typings/app.d.ts` 的 `App.I18n.Schema` 类型 + `zh-cn.ts` + `en-us.ts`），对以中文为唯一使用语言的业务页面成本过高。因此：

- **业务页面文案直接写中文**（票务、景区、库存、系统管理等），路由 `meta` 只给 `title`、不给 `i18nKey`（菜单会自动回退到 `title`）
- **框架部分（登录页、布局、通用按钮）仍走模板 i18n**，语言切换开关保留

后续若需要业务页国际化，按模板方式补 `Schema` 类型与两个语言包即可，属机械改造。

### 页面结构

| 目录 | 说明 |
| ---- | ---- |
| `src/views/ticket/ticket-type` | 票种管理（含限购规则、退改规则） |
| `src/views/ticket/time-slot` | 分时时段管理 |
| `src/views/ticket/price-calendar` | 价格日历（节假日调价） |
| `src/views/ticket/stock` | 分时库存（查询/批量生成/手动调整） |
| `src/views/scenic/area` | 景区信息（含最大承载量） |
| `src/views/scenic/announcement` | 公告管理 |
| `src/views/system/role` | 角色与权限分配 |
| `src/views/system/admin-user` | 管理员管理 |
| `src/views/system/operation-log` | 操作日志 |
| `src/views/system/config` | 参数配置 |

## 对模板做的改动

1. **移除 git hooks**：模板的 `simple-git-hooks`（pre-commit 跑 typecheck+lint、commit-msg 校验）会写入**本仓库根目录的 .git**，从而阻塞整个项目的提交，故从 `package.json` 删除 `prepare` 脚本与 `simple-git-hooks` 配置。需要时手动运行 `pnpm typecheck && pnpm lint`。
2. **改造认证接口**：`src/service/api/auth.ts` 指向后端 `/admin/auth/*`；`src/typings/api/auth.d.ts` 重写为后端契约。
3. **清理请求头**：移除模板 `request` 里的 apifox mock token。
4. **环境变量**：见上表。

模板自带的演示页面（`src/views/function`、`plugin`、`alova`、`multi-menu`、`about`、`manage` 等）在业务页面就位后逐步移除。
