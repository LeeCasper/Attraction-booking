# 景区预约管理及门禁联动系统

覆盖「预约 → 支付 → 核销 → 通行 → 统计 → 预警」全流程的景区预约管理与门禁联动系统。

## 文档

- [PRD 需求文档](./景区预约管理及门禁联动系统%20PRD.md)
- [技术方案设计](./技术方案设计.md)

## 工程结构（Monorepo）

```
├── server/          # NestJS 服务端（RESTful API + JWT + RBAC + WebSocket）
│   ├── scripts/     # 冒烟测试（148 项断言）
│   └── loadtest/    # k6 性能压测
├── admin-web/       # 后台管理（Vue3 + Element Plus）
├── miniprogram/     # 游客端小程序（uni-app + Vue3 + Vite + TS）
├── gate-simulator/  # 闸机模拟器（联调用）
├── deploy/          # docker-compose、SQL 初始化、nginx 配置
└── docs/            # 部署运维、操作手册、测试报告
```

各子工程的技术细节见各自的 README（`server/` 的约束写在根目录 `CLAUDE.md`）。

## 快速开始（开发环境）

```bash
# 1. 启动 MySQL + Redis（Docker Desktop 未运行时先：systemctl --user start docker-desktop）
docker compose -f deploy/docker-compose.dev.yml up -d

# 2. 安装依赖并初始化种子数据（角色、权限、管理员、示例票务数据）
cd server && cp .env.example .env && npm install && npm run seed

# 3. 启动服务（ts-node + nodemon 热重载）
npm run dev

# 4. 冒烟测试（148 项断言，可重复执行）
npm run smoke && npm run smoke:order && npm run smoke:gate && npm run smoke:m4 && npm run smoke:visitor

# 5. 性能压测（需先装 k6，见 server/loadtest/README.md）
npm run loadtest:oversell && npm run loadtest:booking && npm run loadtest:gate
```

- API 服务：http://localhost:3000/api ｜ Swagger：http://localhost:3000/docs
- 后台管理：`cd admin-web && pnpm install && pnpm dev` → http://localhost:9527
- 游客端小程序：`cd miniprogram && npm install && npm run dev:mp-weixin`，
  用微信开发者工具导入 `dist/dev/mp-weixin`
- 默认管理员：`admin / admin123`（首次登录后请修改）

> 依赖 TypeORM/NestJS 的装饰器元数据，dev 与 seed 使用 `ts-node`（不是 esbuild 系的 tsx/tsup，它们不产出 `emitDecoratorMetadata`）。

## 一期里程碑

| 迭代 | 内容 | 状态 |
| ---- | ---- | ---- |
| M1 | 工程骨架、DB、认证/权限、票务 CRUD | ✅ 服务端 + 后台页面，冒烟 25/25 |
| M2 | 下单防超卖、微信支付 JSAPI、退款审核 | ✅ 服务端 + 后台页面，冒烟 28/28 |
| M3 | 动态凭证、闸机核验/开闸、核销、在园人数 | ✅ 服务端 + 后台页面，冒烟 34/34 |
| M4 | 数据看板、统计、告警、导出、验收 | ✅ 服务端 + 后台页面，冒烟 25/25 |
| — | 性能压测 | ✅ k6 脚本随交付：1000 并发零超卖、核验 P95 < 500ms |
| — | 游客端小程序 | 🟡 4 个页面已按设计稿 1:1 还原，视觉动效与本地交互已做（选日期/选时段/勾游客、通行方式三选一、轻提示），接口联调待做 |

详细验收与压测数据见 [`docs/测试报告.md`](./docs/测试报告.md)。

> 微信支付当前为**本地模拟模式**（本机无商户证书，`WXPAY_MOCK=true`）。
> 上线前需置 `false` 并配置 `WXPAY_PRIVATE_KEY_PATH` / `WXPAY_API_V3_KEY` / `WX_APPID` / `WX_APP_SECRET`。
