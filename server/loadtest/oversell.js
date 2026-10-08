/**
 * 防超卖正确性压测：N 个并发请求抢 K 张票（设计文档 §4 / §8.1）
 *
 * 这是本套压测里**最重要**的一条：性能可以慢，超卖是业务事故。
 * 判定标准不是「慢不慢」，而是三条不变量：
 *   1. 成功下单数 === K（零超卖 —— 不能多于 K）
 *   2. 成功下单数 === K（不少卖 —— 也不能少于 K，少卖是收入损失）
 *   3. 库存行 total - sold - locked === 0（Redis 预减与 MySQL 乐观锁最终一致）
 *
 * 做法：当前时刻所有 VU 同时发起 1 次下单（shared-iterations + vus=iterations），
 * 库存总量精确设为 K。k6 的阈值直接卡住「成功数 == K」，跑完即出结论。
 *
 * 用法：
 *   k6 run loadtest/oversell.js
 *   k6 run -e OVERSELL_STOCK=50 -e OVERSELL_BIDDERS=500 loadtest/oversell.js
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

/** 库存总量 K */
const STOCK = Number(__ENV.OVERSELL_STOCK || 50);
/** 抢票人数 N（必须 > K，否则测不出超卖） */
const BIDDERS = Math.max(Number(__ENV.OVERSELL_BIDDERS || 200), STOCK + 1);
const RUN_SEED = Number(__ENV.RUN_SEED || 20261008);
const RUN_TAG = `lt${RUN_SEED}`;

const bidLatency = new Trend('oversell_bid_ms', true);
const accepted = new Counter('oversell_accepted');
const rejected = new Counter('oversell_rejected');

export const options = {
  summaryTrendStats: SUMMARY_TREND_STATS,
  scenarios: {
    oversell_probe: {
      executor: 'shared-iterations',
      vus: BIDDERS,
      iterations: BIDDERS,
      maxDuration: '3m',
      exec: 'bid',
    },
  },
  thresholds: {
    // 零超卖 + 不少卖：成功数必须精确等于库存总量
    oversell_accepted: [`count==${STOCK}`],
    // 被挡下的必须是「业务拒绝」（4xx），不能是服务端错误
    'oversell_rejected{code:BIZ_REJECT}': ['count>0'],
    // 已把 4xx 设为预期响应，此处只剩 5xx 与网络错误
    http_req_failed: ['rate==0'],
  },
};

export function setup() {
  const adminToken = adminLogin();
  const area = listAreas(adminToken)[0];
  const date = addDays(2);

  // 关键：库存精确等于 K，超出部分必须被挡住
  const fixture = createStockFixture(adminToken, {
    areaId: area.id,
    name: `压测票种-防超卖-${RUN_TAG}`,
    total: STOCK,
    date,
  });

  const slotId = fixture.rows[0].timeSlotId;
  const tokens = batchMiniLogin(RUN_SEED + 1, BIDDERS);

  console.log(
    `[setup] 票种=${fixture.ticketTypeId} 日期=${date} 时段=${slotId} 库存=${STOCK} 抢票人=${BIDDERS}`,
  );

  return {
    adminToken,
    ticketTypeId: fixture.ticketTypeId,
    date,
    timeSlotId: slotId,
    stockTotal: STOCK,
    tokens,
  };
}

export function bid(data) {
  // 场景内迭代序号：保证每个抢票人拿到唯一的令牌 + 唯一的证件
  const index = exec.scenario.iterationInTest;
  const token = data.tokens[index % data.tokens.length];

  const r = api('POST', '/api/mini/orders', {
    token,
    tags: { name: 'mini_create_order_oversell' },
    body: {
      ticketTypeId: data.ticketTypeId,
      date: data.date,
      timeSlotId: data.timeSlotId,
      visitors: [
        {
          name: '抢票游客',
          idCard: makeIdCard(RUN_SEED + 1, index),
          phone: makePhone(RUN_SEED + 1, index),
        },
      ],
    },
  });

  bidLatency.add(r.cost);

  if (r.code === 0 && r.data && r.data.orderNo) {
    accepted.add(1);
  } else {
    rejected.add(1, { code: rejectLabel(r) });
  }

  check(r, {
    '抢票请求被正确处理（成功或库存不足，无 5xx）': (res) => res.status < 500,
  });
}

export function teardown(data) {
  const rows = listStock(data.adminToken, data.ticketTypeId, data.date);
  const stock = stockRowOf(rows, data.timeSlotId);
  const used = stock.sold + stock.locked;

  console.log('\n[teardown] 防超卖不变量校验（K = ' + data.stockTotal + '）');
  console.log(
    `  库存行 total=${stock.total} sold=${stock.sold} locked=${stock.locked} available=${stock.available}`,
  );
  console.log(`  ① 零超卖  sold+locked(${used}) <= total(${stock.total}) ：${used <= stock.total ? '✓ 通过' : '✗ 失败'}`);
  console.log(`  ② 不少卖  sold+locked(${used}) == K(${data.stockTotal}) ：${used === data.stockTotal ? '✓ 通过' : '✗ 失败'}`);
  console.log(
    `  ③ 缓存一致 available(${stock.available}) == 0 ：${stock.available === 0 ? '✓ 通过' : '✗ 失败'}`,
  );
}

export function handleSummary(data) {
  const okCount = stat(data, 'oversell_accepted', 'count') ?? 0;
  const noCount = stat(data, 'oversell_rejected', 'count') ?? 0;

  const lines = [
    '',
    '=== 防超卖压测结果（oversell.js）===',
    `库存 K=${STOCK}    抢票人数 N=${BIDDERS}    成功=${okCount}    被挡下=${noCount}`,
    '',
    kpiTable([
      {
        label: '成功下单数 == K',
        actual: `${okCount} / ${STOCK}`,
        target: `= ${STOCK}`,
        pass: okCount === STOCK,
      },
      {
        label: '抢票 P95 延迟',
        actual: ms(stat(data, 'oversell_bid_ms', 'p(95)')),
        target: '—',
      },
      {
        label: '服务端错误率 (5xx/网络)',
        actual: `${((stat(data, 'http_req_failed', 'rate') ?? 0) * 100).toFixed(2)}%`,
        target: '= 0%',
        pass: (stat(data, 'http_req_failed', 'rate') ?? 1) === 0,
      },
      {
        label: '被挡下的请求数',
        actual: num(noCount),
        target: `= ${BIDDERS - STOCK}`,
        pass: noCount === BIDDERS - STOCK,
      },
    ]),
    '',
    '注：被挡下的请求应为 HTTP 4xx + 业务错误码（余票不足/限购），而非 5xx ——',
    '    k6 已把 4xx 配置为「预期响应」，故 http_req_failed 只统计 5xx 与网络错误。',
    '',
  ];

  return {
    stdout: lines.join('\n'),
    'loadtest/results/oversell-summary.json': JSON.stringify(data, null, 2),
  };
}
