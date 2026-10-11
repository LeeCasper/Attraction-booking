# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

景区预约管理及门禁联动系统（NestJS + MySQL + Redis + uni-app）。两份**权威文档**在仓库根目录，动手前先读：

- `景区预约管理及门禁联动系统 PRD.md` — 需求、功能编号（U-xxx 小程序 / A-xxx 后台）、验收标准
- `技术方案设计.md` — 架构决策、数据库设计（§2）、防超卖方案（§4）、凭证与闸机联动（§5）、微信支付（§6）、里程碑（§9）

代码实现必须与设计文档一致；偏离设计时同步更新文档。

其余文档：根 `README.md`（给人看的快速开始与里程碑表）、`docs/` 下三份交付文档（部署运维 / 操作手册 / 测试报告）、
以及各子工程自己的 README —— **改动某个子工程前先看它自己的 README**，跨工程的坑写在本文档里。

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
npm run smoke               # M1：26 项断言（认证/RBAC/票务/库存）
npm run smoke:order         # M2：33 项断言（下单/防超卖/支付/退款/退款状态）
npm run smoke:gate          # M3：37 项断言（凭证/闸机核验/核销/通行/告警/看板/部分核销不可退/业务日期）
                            #     其中「非预约日期核验被拒」需要「今天+5 天」已有库存才执行，缺库存时是 36 项
npm run smoke:m4            # M4：25 项断言（运营分析/导出/对账/备份/承载预警，约 1.5 分钟）
npm run smoke:visitor       # 常用出行人：40 项断言（CRUD/身份证校验位验真/脱敏/越权/删除保护）
npm run smoke:date          # 业务日期工具：19 项断言（固定时刻 + 跨时区一致性，不依赖墙上时钟）
npm run smoke:config        # 参数配置：31 项断言（平台信息端点/配置往返/退款费率真的按配置走/
                            #              支付超时真的按配置走/新建景区一键生成默认时段票种库存且幂等）
npm run lint                # tsc --noEmit
npm run build && npm start  # 生产构建

# 性能压测（需先装 k6，见 server/loadtest/README.md）
npm run loadtest:oversell   # N 人抢 K 张，断言「成功数 == K」（防超卖，最重要）
npm run loadtest:booking    # 1000 并发下单
npm run loadtest:gate       # 核验 / 开闸 / 看板延迟
```

各子工程的独立命令（**包管理器不统一：`server/` 与 `miniprogram/` 用 npm，`admin-web/` 用 pnpm**）：

```bash
# —— admin-web（包管理器用 pnpm）——
cd admin-web && pnpm install && pnpm dev     # :9527；另有 pnpm typecheck / pnpm lint

# —— miniprogram（包管理器用 npm）——
cd miniprogram && npm install && npm run dev:mp-weixin   # 产物 dist/dev/mp-weixin
npm run type-check        # vue-tsc
npm run gen               # 重跑全部生成器（类名清单、工具类样式、图标、字体、页面模板）
                          # ⚠️ 其中 gen:fonts 要联网（本机沙箱会失败），而 gen:pages 排在它后面 ⇒
                          #    本机请按 gen:classes → gen:utilities → gen:icons → gen:pages 逐个跑
npm run check:classes     # 校验所有 .vue 用到的 class 都有出处，见「关键约束」第 9、13 条
npm run verify:qrcode     # 凭证页那个二维码能不能扫：与参考实现逐模块比对 + 真解码回来
                          # （常用第三方包，但都是 vite/uni CLI 的传递依赖 —— 脚本缺包会明确报出来）

# —— gate-simulator（零依赖，无构建步骤）——
cd gate-simulator && node gate.js <cmd>
```

新增接口后**扩展对应的 smoke 脚本**，保持状态无关（可重复执行、不依赖数据库初始值；涉及库存的用例要使用与运行标识绑定的日期，避免复用上轮已锁定的库存）。

改了下单/核验/闸机链路的并发行为后，再跑一遍 `loadtest/`：**串行冒烟测不出并发缺陷** ——
并发重复核销返回 500、模拟支付交易号撞键这两个问题都是压测才暴露的。

## 架构要点

### 目录与模块边界

```
server/src/
├── common/          全局守卫、响应封装、异常过滤、加密工具、分页 DTO
├── config/          环境变量读取（configuration.ts，全部走 ConfigService）
├── database/entities/   TypeORM 实体（表结构权威来源见下）
├── jobs/            定时任务（支付超时取消、查单补偿、闸机心跳巡检、在园人数校准、日统计）
└── modules/         auth / admin / security / redis / system / scenic / ticket
                     / order / pay / mini / verify / gate / stats
                     （system = `sys_config` 读取；规划中：notify）

server/loadtest/     k6 性能压测（防超卖/并发下单/核验开闸，见其 README.md）
admin-web/           SoybeanAdmin(Element Plus 版) 二开，Vue3 + Element Plus，:9527
                     （集成约定见 admin-web/README.md）
gate-simulator/      零依赖闸机 CLI（node gate.js <cmd>），按设计 §5.4 实现 HMAC 签名
miniprogram/         游客端小程序（uni-app + Vue3 + Vite + TS，详见其 README.md）
                     页面版式由 scripts/ 下的生成器从设计稿产出，勿手改产物（见下）
```

单体按业务域分模块，模块边界即未来微服务边界。

### admin-web 与前端的对接关系

前端把后端 profile 映射成模板的 `UserInfo`：`roles` = 后端角色 code（驱动路由 `meta.roles` 过滤，超管经 `VITE_STATIC_SUPER_ROLE=super` 直通），`buttons` = 后端权限字符串（`useAuth().hasAuth('ticket:create')` 校验按钮）。因此**后端新增 `@Permissions('x:y')` 后前端可直接复用该标识，不需要额外映射表**。前端环境变量 `VITE_SERVICE_SUCCESS_CODE=0`、`VITE_SERVICE_LOGOUT_CODES=40100` 与后端响应体规则耦合，改后端错误码规则时需同步。

**`hasAuth()` 已做超管通配放行**（`buttons.includes('*')` 直接返回 true，与后端 `AdminAuthGuard` 一致）。后端超管的权限就是 `['*']`，若去掉这层判断，超管在所有业务页面上都会被判为无权限、看不到任何操作按钮。

### 表结构权威来源是 SQL，不是实体

`deploy/sql/init.sql` 是**唯一权威 schema**（34 张表），TypeORM `synchronize: false`。

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

### 闸机模块：一期为模拟器驱动

闸机接口（`/api/gate/*`）**按真机协议实现**（HMAC 签名 + 时间戳容差 + nonce 防重放 + cmdId 幂等），一期由 `gate-simulator/` CLI 驱动联调，接真机时只需按厂商协议实现 Adapter，服务端不用改。种子数据含两台示例闸机（GATE001 入口 / GATE002 出口，密钥 `dev-gate-secret-change-me`，与 `gate-simulator/config.example.json` 一致）。

关键口径：**在园人数以闸机「通行回执」为准**（result=1 通过或 4 应急放行），核验通过但未实际通行不计数；每 5 分钟用 `passage_record` 校准 Redis 计数。

### 微信支付：本地默认是模拟模式

`.env` 里 `WXPAY_MOCK=true`（本机没有商户证书文件；未配置 `WX_APPID` 时小程序登录也一并走 mock）。
上线前要置 `false` 并配置 `WXPAY_PRIVATE_KEY_PATH` / `WXPAY_API_V3_KEY` / `WX_APPID` / `WX_APP_SECRET`，
配置清单见 `docs/部署与运维.md`。仓库根目录的 `apiclient_key.pem` 是本机调试留下的，已被 `*.pem` 忽略。

### 小程序：页面版式是「生成」的

`miniprogram/` 的页面模板与工具类样式**由 `scripts/` 下的生成器从设计稿产出**，
`src/pages/*/index.vue`、`styles/utilities.scss`、`classmap.json`、图标与字体都是产物 —— **手改会被下次 `npm run gen` 覆盖**。
交互区则是手写组件（`src/components/`），生成器只负责把它们按设计稿的 id/class 注进页面版式里。
要改页面外观：改生成器或 `page-bindings.mjs`；要改交互：改组件与 `pages/*/behavior.ts`。

## 关键约束（踩过的坑）

1. **dev/seed 必须用 `ts-node`，不能用 `tsx`/esbuild 系工具** —— 它们不产出 `emitDecoratorMetadata`，TypeORM 与 NestJS DI 都会崩。`build` 走的 `tsc` 没问题。
2. **实体里 `string | null` / `Date | null` 这类联合类型必须显式写 `type`** —— 否则 `design:type` 推断为 `Object`，TypeORM 报 `DataTypeNotSupportedError`。
3. **`REDIS_CLIENT` 是注入令牌，参数上必须写 `@Inject(REDIS_CLIENT)`** —— `RedisClient` 只是 `import('ioredis').default` 的类型别名，靠元数据推断会得到 `Object` 导致 DI 失败。
4. **查询参数不做隐式转换** —— `PaginationDto` 用 `@Type(() => Number)`，其它数值 query 参数用 `ParseIntPipe`（可空时 `new ParseIntPipe({ optional: true })`）。
5. 建表时 `NOT NULL` 的时间列记得给 `DEFAULT CURRENT_TIMESTAMP(3)`，否则 TypeORM 省略该字段时插入失败。
6. **改 `.env` 后必须手动重启服务** —— `npm run dev` 的 nodemon 只监听 `src/`，配置改动不会触发热重载，进程会一直用旧环境变量（表现为「明明改了配置却不生效」）。
7. **小程序报 `module 'pages/xxx/yyy.js' is not defined` 时先别查代码** —— 产物是完整的。
   三个工具侧原因：
   - `uni build` 会先**清空整个产物目录**再重写（工具正开着该目录时会扑空）；
   - 微信开发者工具**对新增文件不热编译**；
   - **`pages.json` 里加了路由、但对应的 `.vue` 还没建**时，`dev:mp-weixin` 的增量编译会打
     `pages/xxx not found` 并**跳过该页，且后续差量编译不会重试** —— 产物里就永远缺 `.js`/`.wxml`
     （只剩一个 `.json`）。**先建 `.vue`、再往 `pages.json` 加路由**；已经踩了就重启 watcher 全量重建。
   处理：重新编译或关闭项目重新导入。**每次新增源文件都会遇到**，详见 `miniprogram/README.md`。
   ⚠️ **本机的开发者工具打开的是 `dist/build/mp-weixin`（`uni build` 的产物），不是 `dist/dev/mp-weixin`** ——
   只跑 `npm run dev:mp-weixin` 的 watcher 用户永远看不到改动（实测：指向 build 的引用 1571 处、指向 dev 的 0 处）。
   改完小程序源码**必须再跑一次 `npm run build:mp-weixin`**，否则会被误判成「代码没生效」而白查一轮
   （那次就是照截图量出来「标题偏左 28.5px」才定位到是旧构建）。
   `uni build` 会先清空整个产物目录，工具正开着会报错甚至白屏 —— 看到白屏就关掉工程重新导入。
   想省掉这一步：把开发者工具的工程切到 `dist/dev/mp-weixin`，watcher 就够了。
8. **小程序的 rpx 系数是 ×750/390（≈1.9231），不是约定俗成的 ×2** —— 设计画布 390pt。
   按 ×2 换算每个元素都会大约 4%。
9. **小程序模板里的 class 必须用「消毒名」**（`text-[19px]` → `text-19px`，`gap-2.5` → `gap-2_5`）：
   WXSS 选择器对 `[ ] . ( ) # /` 支持不可靠，生成器只产出消毒名，手写原始类名会**静默无样式**。
   `npm run check:classes` 兜底（这条抓出过真 bug：`PageHeader.vue` 里留着 `text-[19px]`，
   而图标尺寸由 font-size 决定，一直按继承字号渲染）。
   **`icon-*` 也逐名核对**（对 `styles/icons.scss` 里真实生成的规则）——
   `.msi` 是「底色为 currentColor 的 1em 方块 + mask 挖出图形」，引用不存在的图标名时
   mask 那条规则没有，方块**不会消失而是实心渲染**成深色方块。
   `icon-arrow_back`（生成器里只有 `arrow_forward`）就这样把返回键画成了黑方块，肉眼只当是图标风格。
   新增图标：加进 `design/icons.txt` → `npm run gen:icons`。
10. **`miniprogram/` 的 `@dcloudio/*` 六个包必须钉完全相同的版本**，`vite` 精确锁 `5.2.8`
    （`vite-plugin-uni` 的 peerDependency 是精确版本），且用 npm 而非 pnpm。改动前先读该工程的 README。
11. **服务端的「日历日」一律走 `common/utils/date.util.ts`，不要写 `toISOString().slice(0,10)`** ——
    `toISOString()` 返回的**永远是 UTC**。业务时区是东八区（MySQL `--default-time-zone=+08:00`、
    TypeORM `timezone: '+08:00'`、宿主机 Asia/Shanghai），于是**每天 00:00–08:00 app 与 DB 差一天**：
    当天有效票被判 `WRONG_DATE 未到预约日期`、**前一天的票反而被放行**；
    `@Cron('30 0 * * *')` 的日结还会拿 `Date.now()-864e5` 算成**前天**（这条每天错，与窗口无关）。
    这个错**白天跑任何冒烟都看不出来**，只有凌晨才会暴露 —— 所以有 `npm run smoke:date`
    （固定时刻 + 换 TZ 重跑比对）。规矩：
    - 要落到 `DATE` 列、要和 SQL 的 `CURDATE()` 对齐、做「当天能不能入园」判断的 → `businessToday()` / `addDaysStr()` / `diffDays()`
    - `createdAt` / `payDeadline` / 心跳时刻 / 微信 RFC3339 这类**绝对时间点** → 继续用 `new Date()`，那是对的
    - 时区来自 `BUSINESS_TZ`（默认 `Asia/Shanghai`），**每次调用读 env**（`ConfigModule` 加载 `.env`
      晚于模块级常量求值，缓存住就读不到）。`@Cron` 的 `timeZone` 只能用默认值常量 —— 装饰器在 `.env` 加载前求值
12. **`sys_config` 的配置一律走 `SysConfigService.get(key, fallback)`，且必须在方法体/任务体里读，
    不能提成模块级常量** —— 与第 11 条同源：`ConfigModule` 加载 `.env` 晚于模块级求值，而 service / job
    都是长生命周期对象，模块级常量会把值冻在进程启动那一刻，**管理员在后台改了就读不到**。
    现在由它驱动四处：退改规则（`pay.service` 退款算费）、承载量预警阈值（`jobs/stats.job`，按次读，
    所以后台改阈值**最多 60 秒生效**）、支付超时（`order.service.payTimeoutMinutes()`）、
    平台信息（`GET /api/mini/platform/settings`）。
    ⚠️ **票种自身的 `ticket_type.refund_rule` 按字段覆盖全局配置**，两套键名必须一致
    （`beforeDay` / `feeRate` / `expiredNoRefund`）—— 种子里曾经叫 `beforeDayFeeRate`/`sameDayFeeRate`，
    与退款代码读的**根本不是一套**，于是「后台改了不生效」。改这些键名时先跑 `npm run smoke:config`。
    另：种子对 `sys_config` 是 `ON DUPLICATE KEY UPDATE remark=...`、**故意不覆盖 `config_value`**
    （否则每次重跑都会冲掉管理员改过的值），所以旧的错误形状要靠 `seed.ts` 里那段**守卫旧键存在**的
    一次性 UPDATE 来迁移。

13. **小程序的生成链有三处「静默失败」的坑，加设计稿时按顺序来** ——
    `gen:classes` → `gen:utilities` → `gen:icons` → `gen:pages`
    （**别用 `npm run gen`**：其中的 `gen:fonts` 要联网、本机会失败，而 `gen:pages` 排在它后面 ⇒ 整条链截断，
    产物还是旧的）。
    - `design/classes.json` 现在是 **`gen:classes` 从 `design/reference/*.html` 提取**的派生产物（以前是手工
      维护的静态文件，加一页稿子就得手补类名）。漏一个类的后果**不是报错** —— `mapClasses` 是
      `classmap[c] ?? c`，未映射的类会带着 `[` `/` `:` 这些 WXSS 不认的字符**原样漏进 WXML**
    - `gen-utilities` 现在会**非 0 退出并点名**「译不出又不在 `INTENTIONAL_DROP` 里」的类。以前这些被混进
      「有意丢弃」只报一个计数（那个 `unmapped` 桶是死代码：`translate()` 从不返回 `[]`），于是类进了
      classmap ⇒ `check:classes` 放行 ⇒ 产物里**一条样式都没有**。加新类时要么补 `translate()` 规则、
      要么显式加进 `INTENTIONAL_DROP`
    - `TAG_MAP` 里**没有的标签会连整棵子树一起被丢掉**（`if (!wxmlTag) return ''` 发生在下降子节点之前）。
      `<article>` 就是这么丢的 —— 4 张景点卡连同封面图一起消失，且没有任何提示。
      生成器现在对「图片无法本地化」也会响亮失败
    - 页面的 `standalone: true` = 产到 `src/pages/<name>/index.vue`（真实路由、自带标题栏、
      **没有** `props.active`、保留整屏高度）。`PAGE_BINDINGS[name].before/after` 可插入手写片段
      （标题栏等）；绑定支持 `remove: true` 删整块。`before/after/inner/replace` 的内容
      **不过 `mapClasses`**，类名要自己写消毒后的形式

14. **外壳视图里的固定定位必须由外壳渲染，不能放在视图里** —— 视图挂在 `<scroll-view>` 里，
    而**微信的 `scroll-view` 会形成自己的包含块，其中的 `position: fixed` 不再相对视口固定**，
    会跟着内容一起滚走。已经踩过：景点选择页的标题栏一开始写在视图里（`spec.before` + `position: fixed`），
    结果滚下去标题就没了、内容顶到状态栏下面。
    规矩：需要固定在顶部的横条 → 写成组件、挂在 `src/pages/main/index.vue` 里
    （scroll-view **外面**），照 `components/PageHeader.vue` / `components/AreaTopBar.vue` 的
    「文档流占位块 + 固定条自带状态栏内边距」结构。**二级页不受此限**（它们是真实页面、
    不套 scroll-view，在文档流里画标题栏即可，如 visitor / orders / booking）。
    连带一条：**固定偏移一定要算安全区** —— 漏了状态栏内边距，标题会正好压在微信胶囊那一行上。
    这个错 **H5 上看不出来**（`statusBarHeight` 为 0，两种写法重合），只在真机/模拟器暴露。

15. **用 CSS 画数据时，验证脚本必须按 CSS 的「真实语义」还原，不能按自己的「意图」还原** ——
    凭证页的二维码是「一行一个 `<view>` + 硬断点 `linear-gradient`」画出来的，验证脚本会把渐变
    **解析回位图**再解码。第一版解析是「把停点两两配对当成色段」—— 那正是**我写代码时的意图**，
    于是脚本一路绿灯，而真机上每一行都糊成实心黑条。根因是渐变的语义：
    **相邻两个停点之间按颜色插值填充**，只写深色停点的话段与段之间会被插值成深色、
    首段之前还会被「首色向前延伸」填满（静默区一起涂黑）。正解是每个色段写四个停点
    （`transparent L, 色 L, 色 R, transparent R`）。
    规矩：**凡是把数据渲染成另一种表示（CSS/位图/字节流），测试就照那个表示的规范语义反推一遍**，
    并补一条**反向对照**（故意用错写法，断言测试能抓出来）—— 只会通过的测试等于没写。

16. **`getCurrentInstance()` 只能在 setup 执行期（或生命周期钩子里同步）取，不能在 `nextTick` / 定时器 / Promise 回调里取**
    —— 它读的是 Vue 内部「当前实例」的全局游标，回调跑起来时游标已经归位，拿到的是 `undefined`。
    凭证页画布就栽在这上面：`paint()` 写在 `nextTick` 回调里，`createSelectorQuery().in(undefined)`
    在小程序运行时里直接抛 `Cannot read properties of undefined (reading '$scope')`，
    画布一片空白 —— **类型检查和构建全绿，只有真机/工具里才报**。
    规矩：`const instance = getCurrentInstance()` 写在 `<script setup>` 顶层并闭包引用；
    给 `paint` 这类「可能炸」的绘制函数包 `try/catch`，炸了就退回降级路径，不要留空白。

17. **`App.vue` 里的 `pg-*` 结构类会和设计稿的工具类抢同一个属性，而结构类写在后面 ⇒ 它赢** ——
    `.pg-svg` / `.pg-has-bg` 都声明了 `position: relative`（作用是给它们内部那些绝对定位的
    子元素当定位基准），而设计稿的元素**自己常常写着 `.absolute`**。两条规则**特异性完全相同**，
    谁生效只看 CSS 输出顺序，而 `App.vue` 的全局样式排在 `utilities.scss` 之后 ⇒ 结构类把
    `absolute` 压掉、元素掉回文档流按固有尺寸占位。
    踩过：订单支付页倒计时横幅里那个**装饰用的 `<svg>` 只有一个 `<path>`**（生成器只认 `<rect>`），
    转出来是个**空 `<view class="pg-svg absolute … w-28 h-28">`** —— 空壳本身不画东西，
    但 `w-28 h-28` 在文档流里实打实占 112px，**把整条横幅顶出一大块空白**。
    两条规矩：① 生成器只在该元素**本身没有被定位**时才加 `pg-has-bg`
    （`absolute`/`fixed`/`sticky` 同样是有效的定位基准，不需要 relative）；
    ② 内联 SVG 一个 `<rect>` 都没有时**整块不输出**（`gen-pages.mjs` 里有警告）。
    **以后往 `App.vue` 加 `pg-*` 结构类之前，先想清楚它会不会和设计稿的工具类抢同一个属性。**

18. **全站只有两套字体：标题宋体（Noto Serif）+ 其余一切正文族（Plus Jakarta Sans）** ——
    设计稿原本还有第三套 **Space Grotesk**（`data-metric-*` / `display-kpi-screen` /
    `label-badge` / `font-mono`），一套为看板 KPI 准备的几何展示体。它跟汉字不是一套骨架
    （「¥60」紧挨着「门票」两个字就很跳），同屏三套字体也谈不上统一 ——
    2026-10 起**整个族退役**：`gen-utilities.mjs` 的 `FONT_TOKENS` 里那四个类名全部指向
    `$font-body`，**字号/字重/字距一律保留**（只换族）；`tokens.scss` 的 `$font-mono` 与
    `gen-fonts.mjs` 的 `FAMILIES` 也都去掉了它 —— ⚠️ 产物里那个 @font-face 要等**联网**跑一次
    `npm run gen:fonts` 才会真正消失（在那之前只是白打 ~20KB）。
    - **加新排版 token 时族只能从 `FONT_VAR` 里挑**：`gen-utilities.mjs` 里有一段断言守着，
      写第三个族直接非 0 退出。不守的话产物里会出现 `font-family: undefined`，静默忽略、最难查。
    - ⚠️ 顺带记住这个坑：`utilities.scss` 里 `.font-*` 的输出顺序排在 `.text-*` **之前**，
      而**排版 token 类自带 `font-family`** —— 于是 `font-body-lg text-headline-lg` 这种组合里，
      衬线会**反过来压掉** `font-body-lg`。要让一段文字走正文族，字号得用**不带族**的
      `text-[Npx]`（消毒后 `text-NNpx`），别再叠一个 token 类。

19. **admin-web 上传文件必须显式把 `Content-Type` 置空**（`headers: { 'Content-Type': undefined }`）——
    请求实例的默认头是 `application/json`（`@sa/axios` 的 `createAxiosConfig` 里写死），
    而 axios 的 `transformRequest` 有这么一段：
    `if (isFormData(data)) return hasJSONContentType ? JSON.stringify(formDataToJSON(data)) : data;`
    ⇒ **带 json 头的 FormData 会被转成 JSON 字符串发出去**（实测 body 是 `{"file":{}}`），
    服务端 multer 收不到任何 multipart 字段，接口回 400「没有收到文件（字段名应为 file）」。
    后台的表现是「点了上传封面没反应」。踩过一次（景区封面），
    根因与修法写在 `admin-web/src/service/api/scenic.ts` 的 `fetchUploadImage` 上。
    - **不能写死 `'multipart/form-data'`**：浏览器不给显式设好的类型补 boundary。
    - ⚠️ **这条在 Node 里测不出来** —— axios 的 http 适配器会自己算边界，
      本地脚本无论怎么写都是 201，只有浏览器才暴露。改完请**在浏览器里点一次**。

## 当前进度（对照设计文档 §9）

- **M1 服务端 + 后台页面已完成**：认证/RBAC/景区/票种/时段/价格日历/库存 + admin-web 对应页面（票务、景区、系统管理），冒烟 25/25
- **M2 服务端 + 后台页面已完成**：下单（限购 → Redis Lua 预减 → MySQL 乐观锁）、小程序端接口、微信支付 V3（JSAPI/回调/退款/查单补偿）、支付超时取消、订单与退款审核，冒烟 28/28
- **M3 服务端 + 后台页面已完成**：动态凭证（HMAC Token，60s）、闸机接口（验签/核验/开闸/心跳/通行/告警/离线同步）、核销（扫码/刷证/手动 + 部分核销）、在园人数与实时看板、闸机设备与告警管理，冒烟 34/34
- **M4 服务端 + 后台页面已完成**：运营分析（趋势/转化/客流/票种/渠道/财务）、报表导出（5 类 CSV）、三方对账、数据备份、承载量分级预警，冒烟 25/25
- **性能压测已完成**：`server/loadtest/`（k6）—— 防超卖 200 抢 50 / 1000 抢 100 恰好等于库存量；1000 并发下单零拒绝零 5xx；核验 P95 < 500ms、开闸链路 P95 < 1s、看板 P95 < 50ms。压测还暴露并修复了 3 个并发缺陷（见 `docs/测试报告.md` §3.4）
- **交付文档**：`docs/部署与运维.md`（含微信支付配置清单、备份恢复演练、故障排查）、`docs/操作手册.md`（按角色的操作指引与失败原因对照表）、`docs/测试报告.md`（112 项断言 + 压测结果 + PRD 验收对照）
- **小程序端界面已还原并接上本地交互**：`miniprogram/` 已从微信官方 quickstart 模板重建为 uni-app（Vue3+Vite+TS），
  按 Stitch 设计稿 1:1 还原了 4 个页面（景区预约首页 / 分时预约购票页 / 动态防伪电子凭证页 / 个人中心），
  mp-weixin 构建通过。已做**纯视觉动效**（凭证 60s 倒计时 + 二维码刷新 + 防伪水印时间戳、日期条横向滚动与两端渐隐、
  呼吸点、按下态 —— `active:*` 改走 `hover-class`，小程序的 `<view>` 不触发 `:active`）与**本地交互状态**
  （购票页选日期/选时段/勾游客/新增出行人 + 底部金额联动、凭证页通行方式三选一、个人中心四态筛选与离线凭证刷新轻提示）。
  交互区抽成了手写组件，页面版式仍由设计稿生成；**设计稿没给样本的状态（游客未勾选圈、
  「选中+紧张」的日期胶囊、出行登记卡的空态）是推断值**，验收时按 README 的清单核对。
  详见 `miniprogram/README.md`
- **小程序端后端接口已补齐**：技术方案 §3.2 列的一期 P0 小程序接口（12 个）**全部实现**。
  本轮补上了最后缺的一组 —— `GET|POST|PUT|DELETE /api/mini/visitors`（常用出行人）：
  **身份证校验位验真**（GB 11643 MOD 11-2，见 `common/utils/idcard.util.ts`）、返回只给脱敏、
  默认出行人唯一、上限 10，且**拒绝删除已被订单引用的出行人**（`order_item` 只存 visitor_id、
  不快照姓名证件，硬删会让历史订单丢掉持票人）。配套 `npm run smoke:visitor`（40 项断言）
- **小程序端已与后端联调完成**：四个视图的数据都来自接口，**购票 → 下单 → 模拟支付 → 凭证**整条链路打通。
  请求层 `src/api`（统一拆 `{code,msg,data}`，40100 清 session 静默重登一次）、登录态 `src/store/user`、
  视图间切页 `src/store/shell`；各视图**首次可见时才拉数据** —— 单页外壳里四个视图同时挂载，
  不这么做启动时会并发四个请求。另新增**设计稿里没有的常用出行人管理页**（`src/pages/visitor/`）。
  **仍是静态**（后端没有对应数据，不是漏做）：首页的开园状态/天气/便民四宫格、
  个人中心的用户资料与门禁凭证状态/行程卡/电子发票/履约信誉、凭证页的通行方式与导出离线票；
  **人脸**按技术方案 §7「三期前不采集」，只能是 mock。逐项清单见 `miniprogram/README.md`
- **「我的预约」已完成**（补 PRD 的 U-003 / U-020 / U-021 / U-025）：新增两个手写二级页
  `src/pages/orders/index.vue`（列表，含四态筛选）与 `detail.vue`（详情，六项齐全 + 取消 / 去支付 / 申请退款）。
  入口接了三处**此前完全没有 `@tap` 的死按钮**：个人中心「全部预约单」、四个状态格（带着筛选跳）、
  凭证页「申请退改」。后端同步修了两处：
  - **列表补 `refundStatus` 与 `ticketName`** —— 申请退款**不改订单状态**（仍是 20/30），
    只多一条待审的退款单；没有 `refundStatus` 客户端就无从知道「审核中/已拒绝」。
    `ticketName` 也是必需的：列表原本只给 `itemCount`，卡片连「买的是什么票」都说不出。
  - **部分核销(30)不再允许退款** —— 退款金额按**整单 `order.amount`** 算、不看已核销人数，
    放行的话 2 人单核销 1 人后能整单全额退，**等于把已消费那张票的钱也退了**。改为仅 `20 已支付` 可申请。
  同理把 `profile/behavior.ts` 的 `tabOf` 补上 **`70 已过期`** —— 原先返回 `null`，这类订单在个人中心凭空消失
- **多景区（一）：小程序选景点 + 后台看板按景点/全部聚合** —— 补 PRD §9.5「支持多景区、多入口、多闸机」。
  此前**三处硬编码 `areas[0]`**（首页/购票页/订单详情兜底），用户永远只认第一个景点；
  后台看板虽有下拉但 `onMounted` 强制选中第一个、且**没有「全部景区」选项**，
  而后端统计层 **13 处 `areaId ?? 1`**（不传就默认 1 号景点）。现在：
  - 小程序新增 `src/pages/area/index.vue`（当时设计稿没有这一页、版式自拟；**后来拿到了设计稿
    「景点选择与预约」，已改成由生成器产出** —— 见本节末尾那条）+ `store/shell.ts` 的
    `currentAreaId`（落盘）。**切景点要作废与景点绑定的状态** —— 两个 `loaded` 守卫以前只认
    「加载过/票种」、**不认识景点**，所以改成记「按哪个 `currentAreaId` 加载的」，
    并在 behavior 里 `watch(currentAreaId)` 重取（选择景点是二级页，`push` 期间视图的 `active` 没变，
    外壳那个 watch 不会触发）。`selectedTicketTypeId` 在 `setCurrentArea` 里清空 ——
    否则购票页会拿旧景点的票种 id 去找，**可能以错价下单**。
    **凭证页跨景点**：仍显示最近一张可入园订单，但按订单自己的 `scenicAreaId` 标注景点名。
  - 生成器加了 **`image` 绑定**：banner 封面那张 `<image>` 是它硬编码插进去的，普通绑定够不着。
  - 后端：`dashboard/realtime`、`dashboard/hourly`、`stats/daily`、`stats/rebuild`、
    `reconciliations/run` **不传 `areaId` = 全部景点**。⚠️ 承载率分母取各景点容量**之和**；
    在园人数按景点分 Redis key，汇总要遍历求和；告警在「全部」下只把全局告警算一次。
  - 顺带修两处**多景区一开就暴露的既有缺陷**：`reconciliation` 表**没有 `scenic_area_id`**
    且唯一键是 `(date, channel)`，而夜间对账**遍历所有景点**逐个写 —— 会**互相覆盖**
    （已改成 `(date, channel, scenic_area_id)` 并对运行库 ALTER）；
    `verify.controller.ts` 后台刷证核验传的是字面量 `0`，而服务端拼 `scenic_area_id = 0`，
    **那条路径一直返回「今日无有效预约」**（已改成不传，语义是「这个人今天在哪个景点有预约」）。
  - **仍未做**：按省/市/区域组织（用户明确不做城市）、后台其余页面按景点筛
    （`analysis.controller` 7 处 + `export.controller` 1 处 `?? 1` 还在）、
    `gate_device.uk_gate_no` 仍是全局唯一（多景点不能重名闸机）、新建景点不会自动生成时段/票种
- **服务端「业务日期」已统一到显式时区**：原先 10 处用 `new Date().toISOString().slice(0,10)`
  当「今天」（那是 **UTC**），而 DB/宿主机是东八区 —— 每天 00:00–08:00 差一天。
  实测复现：凌晨 00:57 跑 `smoke:gate`，核验被 `WRONG_DATE 未到预约日期` 拒。
  新增 `common/utils/date.util.ts`（`businessToday` / `addDaysStr` / `diffDays` / `businessDayEnd`，
  用 `Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ })`，**不引依赖、不依赖进程时区**），
  覆盖核验准入、在园人数、看板统计、日结对账、闸机离线白名单、库存日期序列、退款手续费的天数差。
  **验过不依赖环境**：进程跑在 `TZ=UTC`、`BUSINESS_TZ=Pacific/Pago_Pago` 时，
  服务端算出的「今天」跟着 `BUSINESS_TZ` 走（东八区那边是 10-10，它给 10-09）。
  详见「关键约束」第 11 条
- **首页已接后端，并打通了「选票种」（补 PRD 的 U-001 / U-002 / U-012）**：首页此前是四个视图里
  **唯一没有行为层、`@tap` 与 `id` 都为 0** 的一个，于是 U-002「快捷预约」与 U-012「选择票种」
  两条 P0 实际都没实现（购票页硬取 `/tickets[0]`）。现在：公告与在园率接接口
  （新增 `GET /api/mini/areas/:id/presence`）、三张票卡接 `/tickets`、
  点某张票卡 → **切购票页并选中该票种**（购票页那张「票种头卡」原先也是写死的，一并改成数据驱动）；
  快捷卡切 tab。跨视图传「选中票种」用 `store/shell.ts` 的模块级 `selectedTicketTypeId`
  （外壳只给视图传 `active` 一个 prop，视图间传不了参）。
  ⚠️ 三张票卡的 class 逐字相同，只能 `:nth(N)` 定位 —— 而 `:nth` 分支**放弃了唯一性保护**。
  另：`ticket_type.sale_unit`（`person`/`ticket`）是为了让「按张卖的年卡」可判定而被拦下，
  **没有改计价逻辑** —— 见「技术方案 §3.2」那段说明
- **参数配置真的生效了 + 平台信息可在后台改 + 新建景区一键生成默认时段/票种/库存**（补 PRD A-074 参数配置）：
  探索后发现**「参数配置」页早就在**（表 / 实体 / `ConfigController` / 后台页 / 菜单全都有），
  但种子里那三行配置**没有任何读取者** —— `payTimeoutMinutes` 只有一句注释（真值来自 `.env`）、
  `warn80/90/100` **零命中**（阈值硬编码在 `stats.job.ts`）、`refund` 的键名与
  `pay.service.ts` 实际读的 `ticket_type.refund_rule` **根本不是一套**。**后台改了完全没有反应。**
  现在：新增 `modules/system/sys-config.service.ts`（`@Global()`，`get(key, fallback)` 用 fallback 补缺失字段），
  退改规则 / 承载量阈值 / 支付超时 / 平台信息四处都从它读；`platform` 新增一行配置 +
  `GET /api/mini/platform/settings`（匿名），小程序顶栏、凭证水印、购票页头卡、个人中心行程卡与页脚
  全部改为**读取配置/当前景点**而不是设计稿里写死的「枫林谷」；后台那个**裸 JSON 文本框**换成
  带标签与校验的字段表单（未知键仍回落 JSON）；新建景区可勾选**一键生成 4 时段 + 3 票种 + 未来 N 天库存**
  （复用 `StockService.generate`，幂等，也可事后 `POST /areas/:id/defaults` 补）。
  **顺带补的缺口**：`TicketTypeService.create` 原先**不接受 `saleUnit`**，而「四季家庭年卡」必须是
  `ticket` —— 不补的话一键生成的年卡会被小程序按人数计价、**静默多收钱**。
  **仍未做**：参数配置只对 `super` 角色开放（菜单也是 `roles: ['super']`）；
  小程序 `pages.json`/`manifest.json`/`index.html` 里的标题是**构建期**产物，改品牌名仍要改这三处并重新构建
- **景区选择页「景点选择与预约」1:1 还原**（Stitch 屏幕 `2924904a56004951a1cff553f84e04d0`）：
  这一页是**独立页面**（自带 header/footer），之前工程里的二级页全是手写、因为**没有设计稿**；
  现在有了就该走生成器。为此给 `gen-pages.mjs` 加了 `standalone` 模式（产到 `src/pages/`、
  不注入 `props.active`、保留整屏高度、可用 `before/after` 插手写片段、绑定支持 `remove`）。
  顺带补掉**三个既有的管线缺口**（详见「关键约束」第 13 条）：`classes.json` 没有生成器、
  「译不出样式」是静默的、`TAG_MAP` 缺标签会连整棵子树一起丢掉。
  内容上按「能接的真接」：新加 `GET /api/mini/areas/overview`（一次取回每个景点的分类/起价/
  今日余票/在园，避开 N+1）与 `scenic_area.category`（后台可配，小程序分类 tab **真筛**）；
  设计稿里的「热度 98%」「国家 5A 级景区」「余 1,420 张」「闸机名」「建议时长」等**没有字段的营销内容
  一律不抄**，换成分类名/真实余票状态/真实起价；「全景套票 ¥260」整块去掉（后端没有套票）；
  页脚客服热线改读平台信息、没配就隐藏。封面用设计稿那 4 张示意图轮换（**后台上传入口已于后一轮补上**，见本节末尾）。
  **底栏与页面的对应关系改了**（这是产品口径，不是排版细节）：底栏第 2 格「预约购票」的内容是
  **景点选择**，购票页（游览日期/入园时段/票种）**不在底栏里**，是选完景点才 `navigateTo` 进去的
  二级页 `src/pages/booking/index.vue` —— 否则用户能在没选景点的情况下直接落到某个景点的购票页，
  那是错的顺序。配套改动：`TabKey` 的 `booking` → `area`（`store/shell.ts` 与 `TabBar.vue` 各有一份，
  改一处要改两处）；购票页的 behavior 从 `views/booking/` 搬到 `pages/booking/`，`props.active`
  改成 `onLoad`；`BookingBar` 的偏移从「底栏高度 + 安全区」改成「只让开安全区」（二级页没有底栏）；
  首页票卡与选择页的「去预约」都改成 `navigateTo('/pages/booking/index')`。
  ⚠️ 景点选择页的顶栏由**外壳**渲染（`components/AreaTopBar.vue`）：这一格 `v-if` 掉了 `PageHeader`
  （否则两条 56px 的横条会叠起来）换成它，但**不能**把标题栏写进视图里 —— 见「关键约束」第 14 条。
  **两处踩过的坑**：① 居中的标题栏**不能**拿 `capsuleInset` 当右内边距躲胶囊 —— 右内边距一加
  居中基准就左偏，整条标题肉眼可见不在中间（左对齐的二级页标题栏没这个问题，它们本来就要躲）；
  ② 设计稿的 `data-metric-*`（Space Grotesk，看板 KPI 用的几何展示字体，降级链还带 `monospace`）
  放在中文界面里很跳 —— 金额、日期、时段、「入园时段 / 持票人」的数字都中招。**最终是把字体族换在
  token 上**（`gen-utilities.mjs` 的 `TYPO` 里 `data-metric-md/lg` 改成 `Plus Jakarta Sans`，两层
  `text-` / `font-` 都换），而不是逐个元素加覆盖类：先试过加一个全局 `.pg-price-figure` 压
  `text-data-metric-*`，结果要改的地方一个个冒出来，索性改在源头。
  详见 `miniprogram/README.md` 的「已知偏差」。
  **仍未做**：套票/联票（要先有产品定义）
- **电子凭证页的「动态二维码」做成了真二维码，并修掉 mock 联调身份不稳定**：
  设计稿画的二维码是 22×22 的随机圆角方块（**扫不出东西**），而 PRD 要求它承载动态凭证。
  现在：`utils/qrcode.ts` 是自带的小程序版 QR 编码器（字节模式、纠错 L/M/Q/H、版本 1~40 自增，
  算法按 Kazuhiko Arase 的 `qrcode.js`／MIT 用 TS 重写，两张表从 `qrcode-terminal` 自带的那份实现
  里**机器提取**），编的**就是 token 本体**（原样整串 —— 闸机把扫出来的原文当 `credential` 提交，
  见 `技术方案设计.md` §5.1，加前缀会被判 `MALFORMED`）。渲染没走 canvas：
  **二维码的画法折腾了四轮才定下来，最后是最朴素的那个**：在 JS 里编一张 **1 位灰度 PNG**
  （`utils/png.ts`，不用 zlib —— 用 deflate 的存储块 + adler32/crc32），交给一个
  `<image mode="scaleToFill">`。前面三种都被小程序端否掉了：一格一个 `<view>`（4000+ 节点）、
  一行一个 `<view>` + 硬断点渐变（**真机固定少画第 20 行**，那一行在数据上毫无特别之处，
  Chromium 在 DPR 1/2/3 下都复现不出来）、`<canvas type="2d">`（**开发者工具画得出来、
  真机 `createSelectorQuery` 拿不到节点**）。换成 `<image>` 后没有平台 API、没有层级合成、
  H5 与小程序一份代码，还能离线逐格验证。中间的景区 logo 也一并去掉了（它盖住 16% 码点，
  逼着纠错提到 H）；现在纠错 M、矩阵 49×49、单模块约 0.58mm。
  **踩过的三个坑**：① 组件根节点 `height:100%` 要有东西可依，`<DynamicQr/>` 的宿主 `<dynamic-qr>`
  没尺寸、卡片又 `items-center` 不拉伸 ⇒ 宿主塌成 0×0，**一个码点都画不出来**（这是「显示不出来」的直接原因）
  —— 调用处必须包一层有尺寸的容器；② 格式信息/版本信息写进矩阵后**必须同时登记为已占用**，
  否则会被后面的数据填充覆盖（表现为整片错乱）；③ 对齐图形**必须画在定时图形之前** ——
  版本 7 以上有圆心落在第 6 行/列上的对齐图形（如 `(6,22)`），顺序反了它会被整个跳过。
  **渲染那条坑最深**：渐变是「相邻停点之间按颜色插值填充」，只写深色停点的话
  段与段之间会被插值成深色、首段之前还会被首色向前延伸填满 —— 真机上整块糊成一片横条。
  每个色段必须写四个停点（透明→色→色→透明）。而当时的验证脚本是按「停点两两配对」解析的
  （= 我的意图，不是 CSS 语义），所以**一路绿灯**。详见「关键约束」第 15 条。
  配套：删掉已无消费者的 `gen-qr-pattern.mjs` 与 `components/qr-pattern.ts`（`gen:qr` 从链里去掉）；
  新增 `npm run verify:qrcode`（与参考实现**逐模块比对** + `qrcode-reader` 真解码回来 +
  **把编出来的 PNG 逐格像素与原矩阵核对**再解码，23 项断言）。
  **联调身份**：mock 登录的 openid 由 code 派生，而微信每次 `uni.login()` 都给新随机 code
  ⇒ 每次重编译都是新账号、订单全丢、凭证页永远没有内容可编（库里几分钟冒出 86~92 号一堆空账号）。
  `store/user.ts` 改成把 code 落盘复用（首次落 `dev-local`），真实模式失败自动回退到新 code。
  ⚠️ **旧的 JWT 还指向老的随机账号，第一次生效要清一次数据缓存**。
  端到端验过：真 token → 编码 → 解码 → `gate.js verify` **开闸**（指令号 + 剩余可入园人数都对）。
  **已知取舍**：保留中间 logo ⇒ 纠错 H ⇒ 版本 12（**65×65**），白框内单模块约 **0.45mm**，
  贴着 0.5mm 建议线；嫌难扫就去掉 logo 并把 `DynamicQr` 的 `ecc` 改成 `'M'`（回落 49×49）。
- **补齐三处已知缺口**（后台/服务端的「多景区收尾」）：
  - **运营分析与报表导出支持「全部景区」**：`analysis.controller` 7 处、`export.controller` 1 处
    还写着 `areaId ?? 1` —— 多景区下用户在后台选「全部」，拿到的其实是「示例山景区」一家的数字，
    而且**看起来完全正常**。新增 `common/utils/sql.util.ts` 的 `areaCondition(areaId, column)`
    （**条件与参数绑在一起返回** —— 占位符顺序必须与参数顺序一致，分开拼是这类查询最难发现的错误），
    两个 service 的 `areaId` 都改为可选；后台分析页的下拉补「全部景区」（用 `0 = 全部景区`，
    与实时看板同一套，因为 ElOption 的 value 不收 null）。
    smoke-m4 补了一条**恒等式**断言：不传 areaId 的收入 == 各景区之和 ——
    比「≥ 第一个景区」硬得多（后者在任何库上都成立，等于没测）。
  - **图片上传**（景区封面）：新增 `modules/admin/upload.controller.ts` ——
    `POST /api/admin/upload`（`scenic:update` 权限，5MB，jpeg/png/webp）+ `GET /api/uploads/:name`（免登录）。
    没引 `@nestjs/serve-static`（装依赖要联网）：`multer` 是 platform-express 自带的，
    而且**没用 `diskStorage`** —— 让它按默认的内存缓冲收完、自己 `writeFileSync`，
    因为 `multer` 没带类型声明，为一个回调补 `.d.ts` 不值，何况文件名本来就该在这里生成。
    三条安全底线：文件名服务端生成（客户端给什么都可以是 `../../.env`）、
    只收白名单 MIME、**读取时按严格正则校验文件名再拼路径**（`..`/`%2e%2e%2f` 全部 404）。
    存的 `cover_url` 是**相对路径**（`/uploads/xxx.jpg`）—— 同一张图在后台与小程序下前缀不同；
    小程序侧用 `api/config.ts` 的 `mediaUrl()` 拼自己的前缀（`<image>` 认不了相对路径，会静默空着）。
    后台景区抽屉里加了封面上传 + 预览 + 清除。smoke 补 6 项断言（含两项路径穿越）。
  - **参数配置的可见性**：菜单 `system_config` 写死 `roles: ['super']`，而种子早就把 `config:read`
    给了 admin / finance —— 这两个角色调得动接口却看不到入口。菜单与后端授权对齐，
    写权限 `config:update` 仍只有超管，页面里把「编辑」换成「只读」字样。
  - **闸机编号全局唯一**：这一条**不改**。`gate_no` 是闸机的身份，走 `X-Gate-No` 头
    （HMAC 签名里没有景点），改成按景点唯一就得动真机协议与模拟器；
    多景点请用前缀区分（`A-北门` / `B-北门`）。已在文档里写明这是刻意的。
- **订单支付页（Stitch 屏 `7c6ff3c646d34a1c8f1ecea322101b68`）1:1 还原，并改掉「点立即预约就直接付掉」**：
  设计稿是 `design/reference/pay.html`。**下单与支付拆开**了 ——
  购票页点「立即预约」只**建单**（库存从建单那刻锁住、支付截止时间同时起算），
  再 `navigateTo` 到 `src/pages/pay/`；「我的预约 → 详情 → 去支付」也落到同一页，
  两处不再各写一套支付逻辑。支付页的倒计时读 **`order.payDeadline`**（详情接口返回，
  smoke:order 新增两项断言盯着它），**不是**本地另起的 15 分钟 —— 后者杀进程重进就和
  库存释放的真实时刻对不上。付成功后 `setCurrentOrderId` + `switchTab('credential')` +
  按**页面栈深度** `navigateBack` 回外壳（入口可能是购票页、也可能是订单详情，层数不固定）。
  **四处「后端没有对应能力」的地方，一律保留版式、不编内容**：
  ① 亲属卡/数字人民币**保留两行但不可选**（后端只有微信 JSAPI），点了提示「暂未开通」；
  ② 费用明细**去掉保险与补贴两行** —— 保险不是营销文案而是对游客的承诺，系统既不签发也不承保；
  ③ 闸机说明去掉写死的 `北门/东门`（小程序端没有闸机列表接口），顺带修掉设计稿的
  「凭**动态动态**凭证」重复字；④ 退改说明按 `pay.service.refundFee()` 的真实规则重写
  （设计稿的「未核销游玩日前可全额极速退款」既漏了当天手续费、又把**后台审核**说成了「极速到账」），
  且**故意不写死比例** —— 那是 `sys_config` 里可改的值。
  三处管线缺口也一并补了：`gen-utilities` 新增 `space-x/y-*`（**相邻子元素间距**，
  与 divide 同一套路数用 `A + B` 展开；`gap` 表达不了非 flex 容器）、`rounded-{t,b,l,r}-*` 单边圆角、
  `font-extrabold` / `leading-snug` / `shadow-2xl` / `shadow-inner` / `decoration-*` /
  `underline-offset-*` 与 5 条具名阴影（共 20 个新类，之前会**非 0 退出并点名**）；
  `gen-icons` 补 13 个图标（65 个）；`gen-pages` 遇到内联 `<svg>` 里的 `<path>/<circle>` 会**打印警告**
  （只支持 `<rect>`，支付页横幅那朵水墨云因此没有，不判失败）。
  ⚠️ `pay.html` 里**补了一个 `id="visitors-title"`**（那 4 个类与抽屉里「金额明细」的 h4 完全相同，
  子集命中 5 个、全等命中 2 个）—— 与 `profile.html` 的 `#app-version` 同一处理，见
  `miniprogram/README.md` 的「设计稿里补过的 `id`」。
  顺带修了个**既有缺陷**：凭证视图 `load()` 有「加载过就不再来」的守卫，而**支付成功后就地切到那一格**
  是它的主要入口之一 —— 「我的预约」里点「去支付」回来能是旧单。现在 `watch(currentOrderId)` 强制重取。
- **删除景区：曾经是「硬删 + 只查存在性」，会把 4 类引用变成孤儿 —— 已修** ——
  原来的 `scenicService.removeArea` 只有 `getArea(id)` → `areaRepo.delete(id)`，而
  **`init.sql` 里一条外键都没有**（全库刻意不用 FK，只有索引），所以删完什么都不会级联：
  ① `gate_device.scenic_area_id` 悬空 ⇒ 那台闸机**核不了任何单**（`GATE_NO_PERMISSION 该闸机不服务于本景区`）；
  ② 订单/预约的 `scenic_area_id` 悬空 ⇒ 后台**按景区看时"消失"**（逐景区求和遍历的是现存景区，
  算不到它们），但「全部」里还算着；
  ③ 票种 / 时段 / 库存同样悬空，页面上查不到、也删不掉。
  **本机就是活例子**：示例景区（id=1）被删掉后，两台示例闸机 + 一批订单全挂在那儿 ——
  于是 `smoke:gate` 提前中止（只有一条失败，写明怎么改绑）、`smoke:m4` 的
  「不传 areaId = 各景区之和」出现 1136000 分的差额（这两条都是**数据问题的正确报警**，不是功能回归）。
  **已修**：`removeArea` 现在先数四张表（订单 / 在架票种 / 时段 / 闸机），有引用就
  **409 + 写明还有几项、并提示改用「关闭」**（`status=0` 后小程序端 `/api/mini/areas` 不再返回它，
  历史数据与闸机绑定都留着）；引用清空后仍可删（否则建错的景区永远删不掉）。
  ⚠️ 数票种时**只数在架的**（`status=1`）—— 票种的「删除」其实是下架（`TicketTypeService.remove`
  为了保护历史订单引用只改 status），按全量数会让这条 409 永远消不掉。
  **遗留**：本机已被删景区 id=1 名下还留着 186 张订单（¥23,260）、11 个票种、9 个时段、688 行库存，
  所以 `smoke:m4` 的「不传 areaId = 各景区之和」仍差 1,136,000 分（今天的口径）——
  这是**存量数据**，不是新问题；新删的景区不会再产生孤儿。
- **闸机设备能在后台登记与编辑了**（补 PRD A-050「设备列表」背后那个「设备从哪来」的洞）：
  此前只有种子能写 `gate_device`，给新景区配闸机**只能改库** —— 而闸机一旦绑错景区
  （`gate_no` 是闸机的身份、HMAC 签名里没有景区），那台闸机就核不了任何单，
  运营手上没有任何救济手段（本机就发生过：示例景区被删后，两台示例闸机全废）。
  现在：`POST|PUT|DELETE /api/admin/gates[/:id]`，权限 `gate:create` / `gate:update` / `gate:delete`
  **种子给了景区管理员**（运维仍是 `gate:read` + `gate:control` —— 监控与控制，不碰设备登记）；
  后台「闸机管理 → 闸机设备」加了「新增闸机」按钮与行内的「编辑 / 删除」抽屉。四条硬规矩：
  - ① `gate_no` **全局唯一**，重名 **409 并把话说清楚**（多景区用前缀区分），
    否则 `ER_DUP_ENTRY` 会冒出去变成 500
  - ② 新闸机落 **2 离线** —— `status=1` 的含义是「心跳新鲜」，一建出来就写 1 是撒谎
  - ③ 表单的「状态」只有**启用 / 禁用**；「启用」落 1 还是 2 **看最近有没有心跳**，
    `2 离线 / 4 故障` 是离线巡检的运行时状态，不接受直接写（400）
  - ④ **密钥只在「新增」那一次的返回里给**（列表不下发、操作日志也不记 —— append-only 谁都查得到）
  - 删除沿用「删景区」那套**引用保护**：有通行/日志/指令/告警/离线同步就 409（那些 `gate_id`
    会变成孤儿行），只有刚建错、还没跑过的才删得掉
  `smoke:gate` 补 11 条断言（38 → 49）：新增（返回一次性密钥）/ 重名 409 / 绑不存在的景区 400 /
  改名换方向禁用（列表核对）/ **列表不下发密钥** / `status=2` 不接受写 400 /
  删有记录的 409 / 删新建的 200，以及**借同一张还没用过的凭证验「禁用 ⇒ 核验被拒」** ——
  拒在**鉴权层**（`GateAuthGuard` 直接拦 `status === 3` 回 401 +「闸机已禁用」），
  业务层 `checkGate` 里那句只有 `/api/admin/verify` 代刷那条路走得到。
- **通行规则 A-044（闸机只放行哪些时段/票种）**：`gate_device` 新增两列
  `allowed_slot_ids` / `allowed_ticket_type_ids`（JSON 数组，**空 = 不限**）。
  核验链路上在 `checkGate`（景区/方向）之后多一步 `checkGatePassageRules`（`verify.service`），
  拒绝码复用 `GATE_NO_PERMISSION`、理由带**时段名/票种名**（现场要能一眼看出是哪条规则挡的）。
  三个必须记住的口径：
  - **空数组与「没配」同义**（都存 `null`）：界面把多选清空 = 恢复不限，
    绝不是「什么都不让过」。后端 `normalizeRuleIds` 负责这个归一化 + 去重
  - **配的 id 必须属于本景区**（否则 400）：跨景区的规则会**静默把所有人都拦下**，
    现场只会看到「这台闸机坏了」。同理**换绑景区时会拒掉旧规则**，
    除非同一次请求里一并给出新规则或显式清空（空数组）
  - **`whitelist: true` 会剥掉 DTO 里没声明的字段** —— 第一版只改了 service 的 interface
    没改 DTO，表现是 `PUT` 回 `200 {changed: 0}`、规则**静默没存进去**。
    加字段时 DTO 与 interface 必须同时改（CLAUDE.md 的常见坑）
  - 规则**随 `/api/gate/rules` 下发给闸机**，并且**离线白名单按规则过滤**
    （`filterByPassageRules`：不按规则过滤的话，断网时会把不该走这条通道的人放进去）
  后台：「闸机管理 → 闸机设备」的编辑抽屉里两个多选（候选项跟着**表单里选的景区**走，
  换景区自动清空重选），列表新增一列「通行规则」（不限 / 限 N 时段 · M 票种，悬停看名字）。
  `smoke:gate` 49 → **56**：时段不在允许列表 → 拒、票种不在 → 拒、规则随 `/gate/rules` 下发、
  离线白名单**正反两向**（放行时含本单、只放行别的时段时不含本单）、清空 = 回 null。
- **首页改成平台级：banner 轮播 + 推荐景点；购票页补上「选择票种」**（用户报的两个问题：
  ① 「后台配了多个票种，但选完景点后没法选票种，默认永远是成人票」；
  ② 「点景点提示已切换，然后首页的门票选购和预览图都跟着变」）：
  - **首页不再认「当前景点」**。以前它是「当前景点的首页」—— banner 是那个景点的封面、
    下面三张票卡是那个景点的票，于是用户在「景点选择」页点一下别的景点，回到首页发现
    **整页都变了**，而他只是想选中某个景点。现在 banner 是 `components/BannerCarousel.vue`
    （`<swiper>` 自动轮播 4.2s，每屏的封面/景点名/在园率都是那一屏自己的数据 + 指示点），
    「门票选购」整节换成「推荐景点」（`components/AreaRecommendCard.vue`，三张景点卡：
    分类 / 今日真实余票 / 起价）。两者都只是**指向某个景点**的入口 —— 点了就选中它并进它的购票页。
    `currentAreaId` 现在只剩一个用途：**购票页买哪个景点的票**。首页唯一还跟着它走的只有公告
    （公告是按景点给的、不是全局的，所以文案里带上景点名 `【嵖岈山】…`），换景点只重取这一条。
  - **数据只用一个请求**：`GET /api/mini/areas/overview`（封面/分类/起价/今日余票/在园全在里面），
    以前是 `list` + 逐景点 `presence` + `tickets` 三个请求、且只服务一个景点。
    **「推荐」= 后端默认顺序**（`status = 1` 按 id 升序）—— 后端没有推荐位/热度字段，不假装有排序规则。
  - **购票页新增「选择票种」一节**（`components/TicketPicker.vue`）。设计稿把票种写死在顶卡上
    （按单景区单票种画的），而从「景点选择」进来的用户**根本没有换票种的入口**。只列
    `saleUnit === 'person'` 的票种 —— 按张卖的进不了购票流程（后端下单是硬编码的「单价 × 人数」）。
    选中标记用**行首的单选圈**（与同页「出行游客登记」同款），**不是**时段格那个右下角 check 角标 ——
    角标是 24×24 的角块，落在价格末尾会把 `/人` 盖掉一半（票种行的价格靠右，时段格不是）。
    换票种要**连日期条一起重算**（余票是按「票种 + 日期」查的：成人票约满的日子优待票可能还有），
    若当前日期在新票种下已约满就自动落到最近一个没约满的日子并提示。
    `store/shell.ts` 的 `selectedTicketTypeId` / `selectTicket()` **已删除**（首页不再售票种，没有生产者了）。
  - **口径抽到 `src/utils/area.ts`**（分类常量、封面兜底、余票档位、承载档位）——
    首页与「景点选择」页共用，复制一份迟早会漂移（两处阈值不一致 = 同一件事两个说法）。
  - **景点选择页的分类条重做**（`components/CategoryTabs.vue`）：设计稿是**普通 `<view>` +
    `overflow-x-auto`** 的一排胶囊，而小程序里普通 view 的 `overflow-x` **不能可靠滚动** ——
    最后一个分类被切掉且滑不动。改成 `<scroll-view scroll-x>` + 内边距/吸附放在滚动容器上 +
    两端渐隐（与购票页日期条同一套），外观向日期卡看齐（白卡 / 青绿渐变两行卡，第二行是
    该类景点数，与「筛选」弹层同源）。列表同时补了空态（0 个分类 / 搜索无结果时原来是一片空白）。
  - **设计稿改动**（两处 `id` + 两处内容）：`home.html` 的 `#homeBanner`、`booking.html` 的
    `#ticketPicker`，以及首页那一节的标题改成「推荐景点」、购票页**整节新增「选择票种」**。
    重新拉 Stitch 稿会冲掉这些，`gen:pages` 会报错跳过该页（不会静默出一版缺交互的页面）。
    顺带删掉 `static/images/banner-home.jpg`（banner 改成轮播后不再引用它）与
    `components/TicketCard.vue`（首页不再有票卡），`gen-pages.mjs` 里 home 的位图映射一并清空
    （哪天稿子又出现位图会**报错**，而不是引用一个不存在的文件）。
