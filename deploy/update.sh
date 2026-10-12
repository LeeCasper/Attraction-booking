#!/usr/bin/env bash
#
# 服务器上更新到最新版：拉代码 → 重建并重启 api → 自检。
#
#   bash /srv/attraction/deploy/update.sh
#
# 只覆盖**后端**（唯一需要重新构建的部分）。另外两块的更新方式不同：
#   · 后台管理端（admin-web）：本机 `pnpm build`，再把 dist/ rsync 到 /srv/attraction/admin/，
#     nginx 直接读静态文件，**不用重启任何东西**（见 docs/部署流程.md 第 6 步）
#   · 小程序：本机 `npm run build:mp-weixin` + 开发者工具上传，服务器完全不参与（第 8 步）
#
# ⚠️ 两个「不会自动生效」的：
#   · `deploy/.env`（生产密钥）不在 git 里，pull 不会覆盖它 —— 想改就上服务器改
#   · `deploy/sql/init.sql` 只在**数据卷为空**时执行过一次；之后改表结构要手动 ALTER
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "== 1/4 拉取代码 =="
git pull --ff-only
git log --oneline -1

echo
echo "== 2/4 重建并重启 api（改了 package.json 也会重新装依赖）=="
cd "$ROOT/deploy"
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps --format "table {{.Name}}\t{{.Status}}"

echo
echo "== 3/4 等它就绪 =="
set -a; . ./.env; set +a
PORT_TO_CHECK="${API_PORT:-3000}"
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT_TO_CHECK}/api/mini/areas/overview" || true)
  [ "$code" = "200" ] && break
  sleep 2
done

echo
echo "== 4/4 自检 =="
echo "  本机接口 http://127.0.0.1:${PORT_TO_CHECK}/api/…  → ${code:-无响应}"
if [ "${code:-}" = "200" ]; then
  echo "  ✓ 更新完成"
  echo "  外网再确认一眼：curl -s https://res.artaides.com/api/mini/areas/overview | head -c 100"
else
  echo "  ✗ 接口没起来 —— 看日志：cd $ROOT/deploy && docker compose -f docker-compose.prod.yml logs --tail 50 api"
  exit 1
fi
