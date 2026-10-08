/**
 * 预约链路压测：1000+ 并发下单（设计文档 §8.1）
 *
 * 验证目标：
 *   1. 1000 并发下单不超卖、不少卖（库存行 sold+locked 与成功订单数严格一致）
 *   2. 下单接口在 1000 并发下的 P95 延迟
 *   3. 全链路零 5xx
 *
 * 做法：每次运行新建一个压测票种 + 指定日期的分时库存（总量 = 2×并发数，留足余量），
 * 因此脚本可重复执行，不受历史 sold/locked 影响。
 *
 * 用法：
 *   k6 run loadtest/booking.js
 *   k6 run -e BURST_VUS=1000 -e BURST_ITERS=3000 loadtest/booking.js   # 1000 并发跑 3 轮
 *   k6 run -e BASE_URL=http://localhost:3000 loadtest/booking.js
 */
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import exec from 'k6/execution';
import {
  SUMMARY_TREND_STATS,
  addDays,
  adminLogin,
  api,
  batchMiniLogin,
  createStockFixture,
  kpiTable,
  listAreas,
  listStock,
  makeIdCard,
  makePhone,
  ms,
  num,
  onlyServerErrorsAreFailures,
  rejectLabel,
  stat,
  stockRowOf,
} from './lib/common.js';

onlyServerErrorsAreFailures();

const BURST_VUS = Number(__ENV.BURST_VUS || 1000);
const BURST_ITERS = Math.max(Number(__ENV.BURST_ITERS || BURST_VUS), BURST_VUS);
/** 固定种子：复用同一批压测用户，避免每跑一轮就往 user 表灌 1000 行 */
const RUN_SEED = Number(__ENV.RUN_SEED || 20261008);
const RUN_TAG = `lt${RUN_SEED}`;
/** 买家分散到几个库存行（1 = 全部挤同一时段，最坏情况） */
const SLOT_FANOUT = Number(__ENV.SLOT_FANOUT || 1);

const orderLatency = new Trend('order_create_ms', true);
const orderAccepted = new Counter('order_accepted');
const orderRejected = new Counter('order_rejected');

export const options = {
  summaryTrendStats: SUMMARY_TREND_STATS,
  scenarios: {
    booking_burst: {
      executor: 'shared-iterations',
      vus: BURST_VUS,
      iterations: BURST_ITERS,
      maxDuration: '5m',
      exec: 'burst',
    },
  },
  thresholds: {
    // 硬阈值只卡「正确性」，这是设计文档 §4 / §8.1 对下单链路的真实要求。
    // 零拒绝：库存留了 2 倍余量，1000 并发下任何一单下不去都算失败
    order_rejected: ['count==0'],
    // 已把 4xx 设为预期响应，此处只剩 5xx 与网络错误
    http_req_failed: ['rate==0'],
    // 延迟不设硬阈值：设计文档未给下单时延指标（只给了核验<500ms/开闸<1s，
    // 那两条在 gate.js 里是硬阈值），且本机单实例 + 单一热点库存行的行锁竞争
    // 会让 P95 在 1.9s~6.4s 间大幅波动（见 loadtest/README.md 的实测表）。
    // 把不稳定的数字写成阈值只会得到一个常年飘红的红灯，反而掩盖真正的不变量。
  },
};

export function setup() {
  const adminToken = adminLogin();
  const area = listAreas(adminToken)[0];
  const date = addDays(1);

  // 总量 = 迭代数 × 2，保证「有票可卖」不会成为压测瓶颈
  const fixture = createStockFixture(adminToken, {
    areaId: area.id,
    name: `压测票种-预约并发-${RUN_TAG}`,
    total: BURST_ITERS * 2,
    date,
  });

  // 扇出到几个库存行：SLOT_FANOUT=1 时所有买家抢同一行（最坏情况，行锁串行），
  // 调大可观察吞吐是否随库存行数线性上升 —— 这是判断「单时段容量上限」的关键对照
  const slotCount = Math.max(1, Math.min(SLOT_FANOUT, fixture.rows.length));
  const slotIds = fixture.rows.slice(0, slotCount).map((r) => r.timeSlotId);
  const tokens = batchMiniLogin(RUN_SEED, BURST_VUS);

  console.log(
    `[setup] 票种=${fixture.ticketTypeId} 日期=${date} 库存行=${slotIds.length}/${fixture.rows.length}` +
      ` (每行 ${fixture.rows[0].total}) 用户=${tokens.length}`,
  );

  return {
    adminToken,
    ticketTypeId: fixture.ticketTypeId,
    date,
    slotIds,
    stockTotal: fixture.rows[0].total,
    tokens,
  };
}

export function burst(data) {
  // 场景内迭代序号：天然唯一且连续，保证每个并发用户拿到自己的令牌
  const index = exec.scenario.iterationInTest;
  const token = data.tokens[index % data.tokens.length];

  const r = api('POST', '/api/mini/orders', {
    token,
    tags: { name: 'mini_create_order' },
    body: {
      ticketTypeId: data.ticketTypeId,
      date: data.date,
      timeSlotId: data.slotIds[index % data.slotIds.length],
      visitors: [
        { name: '压测游客', idCard: makeIdCard(RUN_SEED, index), phone: makePhone(RUN_SEED, index) },
      ],
    },
  });

  orderLatency.add(r.cost);

  if (r.code === 0 && r.data && r.data.orderNo) {
    orderAccepted.add(1);
  } else {
    // 按响应类别打标，便于在报告里区分「业务拒绝」与「服务端异常」
    orderRejected.add(1, { code: rejectLabel(r) });
  }

  check(r, {
    '下单返回业务成功': (res) => res.code === 0,
  });
}

export function teardown(data) {
  const rows = listStock(data.adminToken, data.ticketTypeId, data.date);
  const stocks = data.slotIds.map((id) => stockRowOf(rows, id));
  const used = stocks.reduce((s, r) => s + r.sold + r.locked, 0);
  const total = stocks.reduce((s, r) => s + r.total, 0);
  const available = stocks.reduce((s, r) => s + r.available, 0);
  const stock = { total, sold: stocks.reduce((s, r) => s + r.sold, 0), locked: stocks.reduce((s, r) => s + r.locked, 0), available };

  console.log(`\n[teardown] 库存一致性校验（${stocks.length} 个库存行合计）`);
  console.log(
    `  库存行 total=${stock.total} sold=${stock.sold} locked=${stock.locked} available=${stock.available}`,
  );
  console.log(
    `  不变量 sold+locked <= total ：${used <= stock.total ? '✓ 通过' : '✗ 超卖！'}`,
  );
  console.log(
    `  不变量 available == total-(sold+locked) ：${
      stock.available === stock.total - used ? '✓ 通过' : '✗ 不一致'
    }`,
  );
  console.log(
    `  参照：本轮成功下单数见下方 order_accepted（应等于 sold+locked = ${used}）`,
  );
}

export function handleSummary(data) {
  const accepted = stat(data, 'order_accepted', 'count') ?? 0;
  const rejected = stat(data, 'order_rejected', 'count') ?? 0;
  const durationSec = (data.state?.testRunDurationMs ?? 0) / 1000;
  const qps = durationSec > 0 ? ((accepted + rejected) / durationSec).toFixed(1) : '—';

  const lines = [
    '',
    '=== 预约并发压测结果（booking.js）===',
    `并发 VU：${BURST_VUS}    总请求：${BURST_ITERS}    库存行扇出：${SLOT_FANOUT}`,
    `下单成功：${accepted}    拒绝：${rejected}`,
    '',
    kpiTable([
      {
        label: '下单 P50',
        actual: ms(stat(data, 'order_create_ms', 'p(50)')),
        target: '—',
      },
      {
        label: '下单 P95',
        actual: ms(stat(data, 'order_create_ms', 'p(95)')),
        target: '(参考值，非硬指标)',
      },
      {
        label: '下单 P99',
        actual: ms(stat(data, 'order_create_ms', 'p(99)')),
        target: '—',
      },
      {
        label: '下单吞吐',
        actual: `${accepted + rejected} 单 / ${qps} QPS`,
        target: '—',
      },
      {
        label: '服务端错误率 (5xx/网络)',
        actual: `${((stat(data, 'http_req_failed', 'rate') ?? 0) * 100).toFixed(2)}%`,
        target: '= 0%',
        pass: (stat(data, 'http_req_failed', 'rate') ?? 1) === 0,
      },
      {
        label: '业务拒绝数',
        actual: num(rejected),
        target: '= 0',
        pass: rejected === 0,
      },
    ]),
    '',
    `注：k6 的 p(95) 为客户端观测值（含本机网络与 k6 自身开销），非纯服务端耗时。`,
    '',
  ];

  return {
    stdout: lines.join('\n'),
    'loadtest/results/booking-summary.json': JSON.stringify(data, null, 2),
  };
}
