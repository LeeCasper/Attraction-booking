# 性能压测（k6）

对应设计文档 §8.1「预约并发 1000+（压测验证：`k6`/`artillery` 脚本随交付）」
与 §5.3「目标 <500ms 核验、<1s 开闸」。

## 与冒烟测试的分工

| | 脚本 | 工具 | 验证什么 |
| --- | --- | --- | --- |
| 冒烟 | `scripts/smoke-*.mjs` | Node（零依赖） | **功能正确性**：接口按预期返回、状态机正确 |
| 压测 | `loadtest/*.js` | k6 | **并发正确性 + 性能**：高并发下不超卖、延迟达标、无 5xx |

冒烟测的是「一个人买票会不会出错」，压测测的是「一千个人同时买会不会出错」。
两者不可互相替代：并发下的唯一索引冲突、行锁竞争、连接池排队只有压测能暴露。

## 安装 k6

k6 是单文件二进制，不依赖 Node 运行时：

```bash
# 方式一：下载二进制（无需 sudo）
curl -sL -o k6.tgz https://github.com/grafana/k6/releases/download/v0.55.0/k6-v0.55.0-linux-amd64.tar.gz
tar xzf k6.tgz && mkdir -p ~/.local/bin && cp k6-v0.55.0-linux-amd64/k6 ~/.local/bin/

# 方式二：包管理器
brew install k6          # macOS
sudo apt install k6      # Debian/Ubuntu（需先加 grafana 源）
```

## 运行

```bash
cd server
npm run loadtest:booking     # 1000 并发下单（吞吐 / 不超卖）
npm run loadtest:oversell    # N 人抢 K 张（防超卖正确性，最重要）
npm run loadtest:gate        # 核验 / 开闸 / 看板延迟

# 带参数
k6 run -e BURST_VUS=1000 -e BURST_ITERS=3000 -e SLOT_FANOUT=5 loadtest/booking.js
k6 run -e OVERSELL_STOCK=100 -e OVERSELL_BIDDERS=1000 loadtest/oversell.js
k6 run -e GATE_TICKETS=300 -e GATE_NO=GATE001 loadtest/gate.js
```

k6 的退出码即测试结论：阈值未达标返回非 0（可直接接 CI）。

### 可调参数

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `BASE_URL` | `http://localhost:3000` | 被测服务地址 |
| `RUN_SEED` | `20261008` | 压测用户/证件的种子。**固定值**：复用同一批压测用户，避免每跑一轮往 `user` 表灌上千行 |
| `BURST_VUS` / `BURST_ITERS` | 1000 / 1000 | 并发下单的 VU 数与总请求数 |
| `SLOT_FANOUT` | 1 | 买家分散到几个库存行。`1` = 全部挤同一时段（最坏情况） |
| `OVERSELL_STOCK` / `OVERSELL_BIDDERS` | 50 / 200 | 库存量 K 与抢票人数 N（N 必须 > K） |
| `GATE_TICKETS` | 300 | 同时刷码的游客数 |
| `GATE_NO` / `GATE_SECRET` | `GATE001` / `dev-gate-secret-change-me` | 闸机编号与密钥（与 seed 一致） |
| `REJECT_VUS` / `DASHBOARD_VUS` | 10 / 3 | 无效码拒绝路径、看板轮询的并发数 |

## 可重复执行的设计

压测要求「同一批数能反复跑、断言每次都有意义」，因此：

1. **每次运行新建票种 + 库存**（`createStockFixture`）。`POST /admin/stocks/generate`
   不覆盖已有库存，复用旧票种会带上历史 `sold/locked`，防超卖的「恰好等于 K」断言就会失真。
2. **固定 `RUN_SEED`** 派生压测用户与证件，用户表不随运行次数增长；限购按
   `(票种, 日期)` 归集，票种每次是新的，限购计数天然归零。
3. **闸机压测用「今天 + 全天时段」**。核验要求 `reservation.date === 今天`，
   且时段校验是 `[start-60min, end+60min]`，夜间跑必须有一条
   `压测专用 00:00-23:59` 时段兜底（`ensureAnytimeSlot()` 幂等创建，只建一次）。
4. **每次核验前重新签发凭证**。动态凭证 TTL 只有 60 秒，放在 `setup()` 里批量签发
   会在前置耗时较长时集体过期；改为在迭代内签发，既贴合小程序每 50s 刷新的真实行为，
   也彻底消除 TTL 竞态。

### 清理压测残留数据

压测会留下若干「压测票种-*」票种与其库存行（订单因限购/审计需要不建议删）。
需要时按票种名清理：

```sql
-- 查看
SELECT id, name FROM ticket_type WHERE name LIKE '压测票种-%';
-- 删除某个（库存 → 时段无关，订单保留）
DELETE FROM ticket_stock WHERE ticket_type_id = ?;
DELETE FROM purchase_rule WHERE ticket_type_id = ?;
DELETE FROM ticket_type   WHERE id = ?;
```

## 实测结果

环境：单实例、本机 32 核、MySQL 8 + Redis 7 跑在 Docker Desktop，
服务端为**生产构建**（`npm run build && npm start`）。

### 闸机核验链路（设计目标：核验 <500ms、开闸 <1s）

| 场景 | 核验 P50 | 核验 P95 | 开闸链路 P95 | 看板 P95 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 40 并发刷码（≈ 40 个闸机位） | 80ms | 99ms | 190ms | 6ms | ✅ 达标 |
| 300 并发刷码（≈ 7 倍真实规模） | 370–423ms | **433–497ms** | 673–844ms | 45–55ms | ✅ 达标 |

- 300 次核验全部开闸成功，**在园人数净增恰好 300**（与通行回执一一对应）
- 无效凭证拒绝路径（399 次）全部返回业务错误码，零 5xx
- 40 并发才是真实部署规模；300 并发是留足余量的压力值，仍满足 500ms 红线

### 预约并发（设计目标：1000+ 并发零超卖）

| 场景 | 下单 P50 | 下单 P95 | 吞吐 | 正确性 |
| --- | --- | --- | --- | --- |
| 1000 并发 / 单一热点库存行 | 4.1–4.3s | 6.4–6.7s | 113–117 QPS | ✅ 1000/1000 成功，零拒绝、零 5xx |
| 1000 并发 / 分散 5 个库存行 | 1.3–1.7s | 1.9–2.5s | 282–284 QPS | ✅ 1000/1000 成功，零拒绝、零 5xx |

### 防超卖（最重要的一条）

| 场景 | 成功 | 被挡下 | 库存行终态 | 结论 |
| --- | --- | --- | --- | --- |
| 200 人抢 50 张 | 50 | 150 | `total=50 sold=0 locked=50 available=0` | ✅ 零超卖、零少卖 |
| 1000 人抢 100 张 | 100 | 900 | `total=100 sold=0 locked=100 available=0` | ✅ 零超卖、零少卖 |

「恰好等于 K」由 k6 阈值 `oversell_accepted: count==K` 硬保证 —— 少卖一张也会失败。

## 结论与已知限制

**结论**

1. **并发正确性达标**：1000 并发下单与 1000 抢 100 的场景下，Redis 预减 + MySQL 乐观锁
   双重防线零超卖、零少卖，且没有任何请求以 5xx 结束（拒绝一律是 4xx + 业务错误码）。
2. **核验链路达标**：即使按 7 倍于真实部署规模的 300 并发刷码，核验 P95 仍 < 500ms，
   开闸链路 P95 < 1s，看板 P95 < 50ms。
3. **下单吞吐受「单个热点库存行」限制**：所有买家买同一时段时，InnoDB 对
   `ticket_stock` 那一行的排他锁把事务串行化，吞吐只有分散到 5 行时的约 40%。
   高峰开票时**按更多时段分摊库存**能显著抬高上限，这本身不影响正确性。

**已知限制（解读数字时请注意）**

- **本次测量全部来自单实例开发环境**。设计文档的容量结论是「单体 2 实例 + Nginx」，
  横向扩展后吞吐近似线性上升；本机数字是**单实例下界**，不是生产容量。
- 下单接口的延迟里含有 **k6 客户端开销**：`iteration_duration` 与 `http_req_duration`
  的差值即 k6 单线程 JS 运行时调度 1000 个 VU 的排队时间（实测 P50 约 0.26s）。
  服务端纯处理时间看 `http_req_waiting`（TTFB）。
- `DB_POOL_SIZE`（默认 20，`server/src/config/configuration.ts`）实测**调大到 100 并无改善**
  （P50 3.2s → 4.3s），说明瓶颈不在连接池，而在热点行锁与单进程事件循环。
  保留该配置项是为了便于按实际部署调整，不要盲目调大。
- 压测依赖 `WXPAY_MOCK=true` 与模拟支付回调；真实微信支付链路的时延取决于外部网络，
  不在本套脚本的测量范围内。

## 压测发现并修复的缺陷

压测不只是「跑个数字」，下面两个问题是**只有并发压测才能暴露**的，均已修复：

1. **并发重复核销返回 500**（`verify.service.ts`）
   两个通道同刻扫同一张票时，先到的 `INSERT verification` 会占住
   `uk_item_once` 唯一索引，后到的抛 `QueryFailedError` 未被捕获 →
   直接 500。而设计文档 §5.3 要求此时返回「重复核销」错误码 + 触发告警（PRD A-033）。
   已补 `isDuplicateKeyError()` 分支，把唯一索引冲突转成可解释的业务拒绝。

2. **模拟支付交易号撞键**（`mini.controller.ts`）
   `mock_txn_${Date.now()}` 在同一毫秒内并发支付多笔订单时撞
   `payment.uk_transaction` 唯一索引 → 500。已改为附加随机后缀。

3. **重复核销重复写通行记录**（`verify.service.ts`）
   原实现「先 `recordPassage` 再 `reject(...)`」，而 `reject()` 内部还会再写一条，
   导致一次重复刷码在 `passage_record` 留下两条拒绝记录，看板的「拒绝通行」计数翻倍。
   已收敛到唯一的 `duplicated()` 出口。
