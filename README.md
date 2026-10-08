# 景区预约管理及门禁联动系统

覆盖「预约 → 支付 → 核销 → 通行 → 统计 → 预警」全流程的景区预约管理与门禁联动系统。

## 文档

- [PRD 需求文档](./景区预约管理及门禁联动系统%20PRD.md)
- [技术方案设计](./技术方案设计.md)

## 工程结构（Monorepo）

```
├── server/          # NestJS 服务端（RESTful API + JWT + RBAC + WebSocket）
├── admin-web/       # 后台管理（Vue3 + Element Plus）
├── miniprogram/     # 用户端小程序（uni-app）
├── gate-simulator/  # 闸机模拟器（联调用）
├── deploy/          # docker-compose、SQL 初始化、nginx 配置
└── docs/            # 接口文档、部署文档、操作手册
```

## 快速开始（开发环境）

```bash
# 1. 启动 MySQL + Redis（Docker Desktop 未运行时先：systemctl --user start docker-desktop）
docker compose -f deploy/docker-compose.dev.yml up -d

# 2. 安装依赖并初始化种子数据（角色、权限、管理员、示例票务数据）
cd server && cp .env.example .env && npm install && npm run seed

# 3. 启动服务（ts-node + nodemon 热重载）
npm run dev

# 4. 冒烟测试（25 项断言，可重复执行）
npm run smoke
```

- API 服务：http://localhost:3000/api
- Swagger 文档：http://localhost:3000/docs
- 默认管理员：`admin / admin123`（首次登录后请修改）

> 依赖 TypeORM/NestJS 的装饰器元数据，dev 与 seed 使用 `ts-node`（不是 esbuild 系的 tsx/tsup，它们不产出 `emitDecoratorMetadata`）。

## 一期里程碑

| 迭代 | 内容 | 状态 |
| ---- | ---- | ---- |
| M1 | 工程骨架、DB 迁移、认证/权限、票务 CRUD、闸机模拟器雏形 | 服务端已完成并冒烟通过；后台管理界面待建 |
| M2 | 下单防超卖、微信支付 JSAPI、退款审核 | 待开始 |
| M3 | 动态凭证、闸机核验/开闸、核销、在园人数 | 待开始 |
| M4 | 数据看板、统计、告警、导出、验收 | 待开始 |
