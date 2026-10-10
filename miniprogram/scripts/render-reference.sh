#!/usr/bin/env bash
#
# 把设计稿 HTML 渲染成 390pt 宽的参考图，用于与实现做像素比对。
#   npm run ref:shots
#
# ⚠️ 两条必须注意的：
#
# 1. **必须走代理**（--proxy-server）。设计稿是自包含页面，靠 CDN 加载
#    Tailwind 与 Google Fonts；不带代理时字体加载失败，Material Symbols 图标会
#    退化成连字文本（`arrow_forward` 直接渲染成 11 个字母），行高被撑大
#    （实测卡片头部行从 18px 变成 72px），拿这种图做比对会得出完全错误的结论。
#    代理地址可用 HTTP_PROXY 覆盖。
#
# 2. **宽度固定 390**。设计画布是 390pt（Stitch 报的 780 是 2 倍图），
#    而 uni-app 的 750rpx = 屏宽，两者对齐后实现与参考图才能直接比。
#    注意：Chrome headless 会把窗口宽钳到最小 500px，
#    所以这里用 --window-size 时必须以截图实际宽度为准（本脚本用 390 出图是准的）。
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/design/reference"
OUT="$ROOT/design/reference/shots"
PROXY="${HTTP_PROXY:-http://127.0.0.1:7897}"

mkdir -p "$OUT"

# 每页在 390pt 下的实际内容高度（比设计稿标注的略高，留点余量免得截断）
declare -A HEIGHT=( [home]=1300 [booking]=1120 [credential]=1020 [profile]=1650 [areas]=2100 )

for page in home booking credential profile areas; do
  out="$OUT/ref-$page.png"
  google-chrome \
    --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
    --proxy-server="$PROXY" \
    --window-size=390,"${HEIGHT[$page]}" \
    --virtual-time-budget=12000 \
    --screenshot="$out" \
    "file://$SRC/$page.html" 2>/dev/null

  size=$(wc -c < "$out")
  echo "  ref-$page.png  ${size} bytes"
done

echo
echo "参考图已输出到 $OUT"
echo "提示：实现侧截图用 npm run dev:h5 起的开发服，同一宽度、同一机型高度，才能逐像素比。"
