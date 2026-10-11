# syntax=docker/dockerfile:1
#
# 服务端镜像（生产）。三条 target，`docker-compose.prod.yml` 用前两个：
#
#   builder —— 装了**全部依赖**、源码与 dist 都在。留这个 target 不是浪费：
#              `scripts/seed.ts` / 冒烟脚本走 ts-node，而 `tsconfig` 的 rootDir 是 src/、
#              include 只有 `src/**/*` ⇒ **seed 不在 dist 里**，纯运行时镜像跑不了它。
#              一次性任务用 `docker compose run --rm tools npm run seed`。
#   runtime —— 只装生产依赖 + dist，非 root 运行。这是真正跑服务的那一层。
#
# ⚠️ `.dockerignore` 里排掉了 `.env` 与 `uploads/`：env 由 compose 注入（别烘进镜像），
#    上传目录是**卷**（烘进去等于每次部署把用户传的图冲掉）。

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# 不跑 postinstall 之外的脚本：本项目的依赖没有需要编译的原生模块
RUN npm ci

FROM deps AS builder
WORKDIR /app
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
# 上传目录：compose 会把它挂成卷；这里先建好并交给 node 用户，
# 否则容器里以非 root 跑的用户第一次上传会 permission denied
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node
EXPOSE 3000
# 直接 node 跑编译产物（不带 nodemon / ts-node，见 CLAUDE.md 约束 1：tsx 系工具会丢
# emitDecoratorMetadata，Nest 的 DI 与 TypeORM 都会崩；tsc 编出来的 dist 没这个问题）
CMD ["node", "dist/main.js"]
