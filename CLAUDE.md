# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

景区预约管理及门禁联动系统（NestJS + MySQL + Redis + uni-app）。两份**权威文档**在仓库根目录，动手前先读：

- `景区预约管理及门禁联动系统 PRD.md` — 需求、功能编号（U-xxx 小程序 / A-xxx 后台）、验收标准
- `技术方案设计.md` — 架构决策、数据库设计（§2）、防超卖方案（§4）、凭证与闸机联动（§5）、微信支付（§6）、里程碑（§9）

代码实现必须与设计文档一致；偏离设计时同步更新文档。

## 常用命令

```bash
# 依赖服务（Docker Desktop 未运行时：systemctl --user start docker-desktop）
docker compose -f deploy/docker-compose.dev.yml up -d      # MySQL:3306 + Redis:6379
docker compose -f deploy/docker-compose.dev.yml ps
docker exec ab-mysql mysql -uroot -proot123456 attraction_booking -e "SELECT ..."
docker compose -f deploy/docker-compose.dev.yml down -v    # 重置库（下次 up 会重跑 init.sql）

cd server
cp .env.example .env        # 首次
npm install
npm run seed                # 幂等：角色/权限/超管/示例景区票种/参数配置
npm run dev                 # ts-node + nodemon 热重载，:3000，Swagger 在 /docs
npm run smoke               # M1：25 项断言（认证/RBAC/票务/库存）
npm run smoke:order         # M2：28 项断言（下单/防超卖/支付/退款）
npm run smoke:gate          # M3：33 项断言（凭证/闸机核验/核销/通行/告警/看板）
npm run lint                # tsc --noEmit
npm run build && npm start  # 生产构建
```

新增接口后**扩展对应的 smoke 脚本**，保持状态无关（可重复执行、不依赖数据库初始值；涉及库存的用例要使用与运行标识绑定的日期，避免复用上轮已锁定的库存）。

## 架构要点

### 目录与模块边界

```
server/src/
├── common/          全局守卫、响应封装、异常过滤、加密工具、分页 DTO
├── config/          环境变量读取（configuration.ts，全部走 ConfigService）
├── database/entities/   TypeORM 实体（表结构权威来源见下）
├── jobs/            定时任务（支付超时取消、查单补偿、闸机心跳巡检、在园人数校准、日统计）
└── modules/         auth / admin / security / redis / scenic / ticket
                     / order / pay / mini / verify / gate / stats
                     （规划中：notify）

admin-web/           SoybeanAdmin(Element Plus 版) 二开，Vue3 + Element Plus，:9527
                     （集成约定见 admin-web/README.md）
gate-simulator/      零依赖闸机 CLI（node gate.js <cmd>），按设计 §5.4 实现 HMAC 签名
miniprogram/         未搭建
```

单体按业务域分模块，模块边界即未来微服务边界。

### admin-web 与前端的对接关系

前端把后端 profile 映射成模板的 `UserInfo`：`roles` = 后端角色 code（驱动路由 `meta.roles` 过滤，超管经 `VITE_STATIC_SUPER_ROLE=super` 直通），`buttons` = 后端权限字符串（`useAuth().hasAuth('ticket:create')` 校验按钮）。因此**后端新增 `@Permissions('x:y')` 后前端可直接复用该标识，不需要额外映射表**。前端环境变量 `VITE_SERVICE_SUCCESS_CODE=0`、`VITE_SERVICE_LOGOUT_CODES=40100` 与后端响应体规则耦合，改后端错误码规则时需同步。

### 表结构权威来源是 SQL，不是实体

`deploy/sql/init.sql` 是**唯一权威 schema**（32 张表），TypeORM `synchronize: false`。

- 新建/改表：改 `init.sql` **并**对运行中的库执行 `ALTER TABLE`（或 `down -v` 重建后重跑 seed）
- `init.sql` 只在**数据卷为空**时被 MySQL 容器执行，改完不会自动生效
- 实体只做映射；装饰器列名/类型必须与 SQL 逐字对齐

### 请求管线

`main.ts` 装配：全局前缀 `/api` → `ValidationPipe`（transform + whitelist + 隐式转换）→ `TransformInterceptor`（统一 `{code,msg,data}`）→ `AllExceptionsFilter`（HTTP 状态码 + 业务 code）。

**鉴权是路径驱动的全局守卫** `AdminAuthGuard`（`APP_GUARD` 注册）：

- `/api/admin/**` 需 JWT（`/admin/auth/login` 白名单），其余前缀（`/api/mini`、`/pay`、未来的 `/api/gate`）直接放行，由各自模块自行鉴权
- 权限用 `@Permissions('resource:action')` 声明；超管角色权限为 `*` 直接放行
- 权限结果缓存在 Redis `perm:admin:{id}`（TTL 60s）。**改动角色权限或管理员-角色绑定后必须删除该键**（见 `RoleService.invalidatePermissionCache` / `AdminUserService.update`）
- **小程序端用独立的 `MiniAuthGuard`**：token 带 `typ='mini'`、用 `jwt.miniSecret` 签发（与管理端密钥隔离），管理端守卫会拒绝带 `typ='mini'` 的 token
- 微信支付回调（`/pay/wx/*`）从 `setGlobalPrefix` 中排除，并用 `@SkipTransform()` 跳过统一响应体 —— 微信要求返回 `{"code":"SUCCESS","message":"成功"}`。回调验签依赖 `rawBody`（`NestFactory.create(..., { rawBody: true })`），请求体不能被 JSON 解析改写

控制器里的写操作统一调 `AuthService.writeLog(...)` 落 `operation_log`（append-only，不提供任何更新/删除路径）。

### 安全与数据约定

- 金额一律**分（int）**，不用浮点
- 身份证/手机号 AES-256-GCM 存密文（`common/utils/cipher.util.ts`），限购/黑名单/核验比对只用 `sha256(salt:value)` 哈希，不还原明文
- 状态位用 `TINYINT` 枚举，值域与状态机见设计文档 §2.3；状态迁移走带前置状态校验的 `UPDATE ... WHERE status = ...`
- 闸机请求签名：`HMAC-SHA256(secret, method + path + timestamp + nonce + body)`，头部 `X-Gate-No/X-Timestamp/X-Nonce/X-Signature`
- Redis 用途：库存预减（`lock:stock:{id}`）、分布式锁、在园人数计数、权限缓存、限购计数（`limit:user:*` / `limit:card:*`，次日零点过期）

### 防超卖：Redis 只做加速，MySQL 是唯一防线

`StockCacheService`（ticket 模块，导出给 order 模块）用 Lua 原子预减可用量；MySQL 侧用 `UPDATE ticket_stock SET locked = locked + n WHERE id = ? AND total - sold - locked >= n` 做乐观锁兜底，`affectedRows !== 1` 即判定超卖并回滚。

缓存同步必须用**增量**而非重算，否则会覆盖在途预减：

| 事件 | DB 变化 | 缓存动作 |
| ---- | ------- | -------- |
| 下单 | locked +n | Lua 预减 n（同一笔） |
| 支付成功 | locked -n，sold +n | **不动**（可用量不变） |
| 取消/超时 | locked -n | release(n) |
| 退款 | sold -n | resync（回流后重算） |
| 管理端调库存 | total ±n | resync |

Redis 不可用时降级为纯 MySQL 乐观锁（性能下降但不超卖），日志会打 warn。

## 关键约束（踩过的坑）

1. **dev/seed 必须用 `ts-node`，不能用 `tsx`/esbuild 系工具** —— 它们不产出 `emitDecoratorMetadata`，TypeORM 与 NestJS DI 都会崩。`build` 走的 `tsc` 没问题。
2. **实体里 `string | null` / `Date | null` 这类联合类型必须显式写 `type`** —— 否则 `design:type` 推断为 `Object`，TypeORM 报 `DataTypeNotSupportedError`。
3. **`REDIS_CLIENT` 是注入令牌，参数上必须写 `@Inject(REDIS_CLIENT)`** —— `RedisClient` 只是 `import('ioredis').default` 的类型别名，靠元数据推断会得到 `Object` 导致 DI 失败。
4. **查询参数不做隐式转换** —— `PaginationDto` 用 `@Type(() => Number)`，其它数值 query 参数用 `ParseIntPipe`（可空时 `new ParseIntPipe({ optional: true })`）。
5. 建表时 `NOT NULL` 的时间列记得给 `DEFAULT CURRENT_TIMESTAMP(3)`，否则 TypeORM 省略该字段时插入失败。
6. **改 `.env` 后必须手动重启服务** —— `npm run dev` 的 nodemon 只监听 `src/`，配置改动不会触发热重载，进程会一直用旧环境变量（表现为「明明改了配置却不生效」）。

## 当前进度（对照设计文档 §9）

- **M1 服务端 + 后台页面已完成**：认证/RBAC/景区/票种/时段/价格日历/库存 + admin-web 对应页面（票务、景区、系统管理），冒烟 25/25
- **M2 服务端 + 后台页面已完成**：下单（限购 → Redis Lua 预减 → MySQL 乐观锁）、小程序端接口、微信支付 V3（JSAPI/回调/退款/查单补偿）、支付超时取消、订单与退款审核，冒烟 28/28
- **M3 服务端已完成**：动态凭证（HMAC Token，60s）、闸机接口（验签/核验/开闸/心跳/通行/告警/离线同步）、核销（扫码/刷证/手动 + 部分核销）、在园人数与实时看板、闸机设备与告警管理，冒烟 33/33
- **M3 待办**：admin-web 核销台、核销记录、闸机设备、通行记录、告警中心、实时看板页面
- **未开工**：M4 数据看板增强、运营分析、报表导出、备份

### 闸机模块：一期为模拟器驱动

闸机接口（`/api/gate/*`）**按真机协议实现**（HMAC 签名 + 时间戳容差 + nonce 防重放 + cmdId 幂等），一期由 `gate-simulator/` CLI 驱动联调，接真机时只需按厂商协议实现 Adapter，服务端不用改。种子数据含两台示例闸机（GATE001 入口 / GATE002 出口，密钥 `dev-gate-secret-change-me`，与 `gate-simulator/config.example.json` 一致）。

关键口径：**在园人数以闸机「通行回执」为准**（result=1 通过或 4 应急放行），核验通过但未实际通行不计数；每 5 分钟用 `passage_record` 校准 Redis 计数。
- **微信支付当前处于本地模拟模式**：本机无商户证书文件，`.env` 中 `WXPAY_MOCK=true`（未配置 `WX_APPID` 时小程序登录也走 mock）。上线前需置 `WXPAY_MOCK=false` 并配置 `WXPAY_PRIVATE_KEY_PATH` / `WXPAY_API_V3_KEY` / `WX_APPID` / `WX_APP_SECRET`
