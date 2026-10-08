/**
 * 核验 / 开闸 / 看板压测（设计文档 §5.3「目标 <500ms 核验、<1s 开闸」、§8.1「看板 <5s」）
 *
 * 场景（并发跑，贴近现场实况：闸机排队的同时运营在看板）：
 *   gate_verify    —— N 个游客同时刷码：刷新凭证 → 闸机核验 → 通行回执
 *   gate_reject    —— 持续刷无效码（排队现场大量误扫/截图过期），验证拒绝路径不掉链子
 *   dashboard      —— 运营看板按 1s 轮询实时大屏
 *
 * 关键前置约束（读 verify.service.ts 得出，改压测前务必留意）：
 *   - 核验要求 reservation.date === 今天（WRONG_DATE）
 *   - 时段校验为 [start-60min, end+60min]，夜间跑必须有一条全天时段兜底
 *   因此本脚本用「今天 + 全天时段」造预约，并由 ensureAnytimeSlot() 幂等保证时段存在。
 *
 * 用法：
 *   k6 run loadtest/gate.js
 *   k6 run -e GATE_TICKETS=300 -e GATE_NO=GATE001 loadtest/gate.js
 */
import { Counter, Trend } from 'k6/metrics';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import http from 'k6/http';
import {
  BASE,
  SUMMARY_TREND_STATS,
  adminLogin,
  api,
  apiBatch,
  batchMiniLogin,
  createStockFixture,
  ensureAnytimeSlot,
  gateCall,
  kpiTable,
  listAreas,
  makeIdCard,
  makePhone,
  ms,
  num,
  onlyServerErrorsAreFailures,
  stat,
  stockRowOf,
  today,
} from './lib/common.js';

onlyServerErrorsAreFailures();

const GATE_NO = __ENV.GATE_NO || 'GATE001';
const GATE_SECRET = __ENV.GATE_SECRET || 'dev-gate-secret-change-me';
const GATE_TICKETS = Number(__ENV.GATE_TICKETS || 300);
const DASHBOARD_VUS = Number(__ENV.DASHBOARD_VUS || 3);
const REJECT_VUS = Number(__ENV.REJECT_VUS || 10);
const RUN_SEED = Number(__ENV.RUN_SEED || 20261008);
const RUN_TAG = `lt${RUN_SEED}`;

const verifyMs = new Trend('gate_verify_ms', true);
const passageMs = new Trend('gate_passage_ms', true);
/** 开闸链路 = 核验 + 通行回执，对应设计「<1s 开闸」 */
const openChainMs = new Trend('gate_open_chain_ms', true);
const dashboardMs = new Trend('dashboard_ms', true);

const gateOpened = new Counter('gate_opened');
const gateRejected = new Counter('gate_rejected');
/** 拒绝路径（无效/过期凭证）被正确挡下的次数 */
const rejectPathBlocked = new Counter('gate_reject_path_blocked');

export const options = {
  summaryTrendStats: SUMMARY_TREND_STATS,
  scenarios: {
    gate_verify: {
      executor: 'shared-iterations',
      vus: GATE_TICKETS,
      iterations: GATE_TICKETS,
      maxDuration: '3m',
      exec: 'verifyFlow',
      startTime: '0s',
    },
    gate_reject: {
      executor: 'constant-vus',
      vus: REJECT_VUS,
      duration: '20s',
      exec: 'rejectFlow',
      startTime: '0s',
    },
    dashboard: {
      executor: 'constant-vus',
      vus: DASHBOARD_VUS,
      duration: '25s',
      exec: 'watchDashboard',
      startTime: '0s',
    },
  },
  thresholds: {
    // 设计文档 §5.3：核验 < 500ms
    gate_verify_ms: ['p(95)<500'],
    // 设计文档 §5.3：开闸 < 1s
    gate_open_chain_ms: ['p(95)<1000'],
    // 设计文档 §8.1：看板延迟 < 5s
    dashboard_ms: ['p(95)<5000'],
    // 每张票都必须核验通过并开闸（有人被拒即视为失败，前置数据不足会先在 setup 报错）
    gate_opened: [`count==${GATE_TICKETS}`],
    // 核验是闸机主链路，一次服务端错误都不该有（4xx 已设为预期响应）
    http_req_failed: ['rate==0'],
  },
};

export function setup() {
  const adminToken = adminLogin();
  const area = listAreas(adminToken)[0];
  const date = today();

  // 核验必须在「今天 + 当前时刻落在时段内」，故用全天时段兜底（幂等复用）
  const slotId = ensureAnytimeSlot(adminToken, area.id);

  const fixture = createStockFixture(adminToken, {
    areaId: area.id,
    name: `压测票种-闸机核验-${RUN_TAG}`,
    total: GATE_TICKETS * 2,
    date,
  });
  stockRowOf(fixture.rows, slotId); // 校验库存行已生成

  const tokens = batchMiniLogin(RUN_SEED + 2, GATE_TICKETS);

  // 下单（每人 1 张）
  const orderRes = apiBatch(
    tokens.map((token, i) => ({
      method: 'POST',
      path: '/api/mini/orders',
      token,
      tags: { name: 'setup_create_order' },
      body: {
        ticketTypeId: fixture.ticketTypeId,
        date,
        timeSlotId: slotId,
        visitors: [
          { name: '核验游客', idCard: makeIdCard(RUN_SEED + 2, i), phone: makePhone(RUN_SEED + 2, i) },
        ],
      },
    })),
  );

  const created = [];
  const orderFailures = [];
  orderRes.forEach((r, i) => {
    if (r.code === 0 && r.data && r.data.orderNo) {
      created.push({ token: tokens[i], orderNo: r.data.orderNo, orderId: r.data.orderId });
    } else {
      orderFailures.push(`码=${r.code} HTTP=${r.status} ${r.msg ?? ''}`);
    }
  });

  // 支付（模拟支付回调，WXPAY_MOCK=true 时可用）
  const payRes = apiBatch(
    created.map((c) => ({
      method: 'POST',
      path: `/api/mini/pay/mock-notify?orderNo=${c.orderNo}`,
      token: c.token,
      tags: { name: 'setup_mock_pay' },
    })),
  );
  const paid = [];
  const payFailures = [];
  created.forEach((c, i) => {
    if (payRes[i].code === 0 && payRes[i].data) paid.push(c);
    else payFailures.push(`订单=${c.orderNo} 码=${payRes[i].code} HTTP=${payRes[i].status} ${payRes[i].msg ?? ''}`);
  });

  // 前置数据必须凑齐：否则 VU 数对不上票据数，指标会失真
  if (orderFailures.length > 0) {
    throw new Error(`setup 下单失败 ${orderFailures.length} 笔，首个：${orderFailures[0]}`);
  }
  if (payFailures.length > 0) {
    throw new Error(`setup 支付失败 ${payFailures.length} 笔，首个：${payFailures[0]}`);
  }

  const before = api('GET', `/api/admin/dashboard/realtime?areaId=${area.id}`, {
    token: adminToken,
    tags: { name: 'dashboard_realtime' },
  });

  console.log(
    `[setup] 票种=${fixture.ticketTypeId} 时段=${slotId}(全天) 日期=${date} ` +
      `已支付订单=${paid.length}/${GATE_TICKETS} 闸机=${GATE_NO} 初始在园=${before.data?.presence}`,
  );

  return {
    adminToken,
    areaId: area.id,
    tickets: paid,
    presenceBefore: Number(before.data?.presence ?? 0),
    expectedOpens: paid.length,
  };
}

/** 游客刷码通行：刷新凭证 → 核验 → 通行回执 */
export function verifyFlow(data) {
  // 用「场景内迭代序号」而非 exec.vu.idInTest：多场景并发时后者是全局 VU 编号，
  // 不保证落在 [1, GATE_TICKETS] 且不连续，会导致部分 VU 取不到票据而空跑
  const index = exec.scenario.iterationInTest;
  // 一票一人一核验：不能取模复用票据，否则多个 VU 会同时扫同一张票，
  // 测的就不是核验性能而是重复核销路径了
  const ticket = data.tickets[index];
  if (!ticket) return;

  // 1. 刷新动态凭证（小程序每 50s 刷新；60s TTL，因此放在核验前而非 setup 里）
  const cred = api('GET', `/api/mini/orders/${ticket.orderId}/credential`, {
    token: ticket.token,
    tags: { name: 'mini_credential' },
  });
  if (!cred.data || !cred.data.token) {
    gateRejected.add(1, { code: 'CREDENTIAL_ISSUE_FAILED' });
    return;
  }

  // 2. 闸机核验（HMAC 签名）
  const verify = gateCall(
    GATE_NO,
    GATE_SECRET,
    'POST',
    '/api/gate/verify',
    { credential: cred.data.token, direction: 1 },
    { name: 'gate_verify' },
  );
  verifyMs.add(verify.cost);

  const opened = verify.data && (verify.data.open === true || verify.data.ok === true);
  if (!opened) {
    gateRejected.add(1, { code: String(verify.data?.code ?? `HTTP_${verify.status}`) });
    check(verify, { '核验未通过（不应发生）': () => false });
    return;
  }
  gateOpened.add(1);

  // 3. 通行回执（在园人数以回执为准）
  const passage = gateCall(
    GATE_NO,
    GATE_SECRET,
    'POST',
    '/api/gate/passage',
    { reservationId: verify.data.reservationId, direction: 1, result: 1, passedAt: new Date().toISOString() },
    { name: 'gate_passage' },
  );
  passageMs.add(passage.cost);
  openChainMs.add(verify.cost + passage.cost);

  check(verify, { '核验通过并开闸': () => true });
}

/** 无效凭证拒绝路径（过期截图/误扫） */
export function rejectFlow() {
  const r = gateCall(
    GATE_NO,
    GATE_SECRET,
    'POST',
    '/api/gate/verify',
    { credential: `invalid.${Math.random().toString(36).slice(2)}`, direction: 1 },
    { name: 'gate_verify_reject' },
  );
  if (r.data && r.data.ok === false && r.data.code === 'INVALID_CREDENTIAL') {
    rejectPathBlocked.add(1);
  }
  check(r, {
    '无效凭证被拒绝且无 5xx': (res) => res.status < 500 && res.data && res.data.ok === false,
  });
  sleep(0.5);
}

/** 运营看板轮询 */
export function watchDashboard(data) {
  const r = http.get(`${BASE}/api/admin/dashboard/realtime?areaId=${data.areaId}`, {
    headers: { Authorization: `Bearer ${data.adminToken}` },
    tags: { name: 'dashboard_realtime' },
  });
  dashboardMs.add(r.timings.duration);
  check(r, { '看板响应 200': (res) => res.status === 200 });
  sleep(1);
}

export function teardown(data) {
  const after = api('GET', `/api/admin/dashboard/realtime?areaId=${data.areaId}`, {
    token: data.adminToken,
    tags: { name: 'dashboard_realtime' },
  });
  const presenceAfter = Number(after.data?.presence ?? 0);
  const delta = presenceAfter - data.presenceBefore;

  console.log('\n[teardown] 在园人数一致性校验（以通行回执为准）');
  console.log(`  核验前在园=${data.presenceBefore}  核验后在园=${presenceAfter}  净增=${delta}`);
  console.log(`  参照：本轮开闸次数见 gate_opened（净增应等于开闸次数）`);
}

export function handleSummary(data) {
  const opened = stat(data, 'gate_opened', 'count') ?? 0;
  const rejected = stat(data, 'gate_rejected', 'count') ?? 0;

  const verifyP95 = stat(data, 'gate_verify_ms', 'p(95)');
  const chainP95 = stat(data, 'gate_open_chain_ms', 'p(95)');
  const dashP95 = stat(data, 'dashboard_ms', 'p(95)');

  const lines = [
    '',
    '=== 核验 / 开闸 / 看板压测结果（gate.js）===',
    `并发刷码 ${GATE_TICKETS} 人    开闸 ${opened} 次    拒绝 ${rejected} 次    闸机 ${GATE_NO}`,
    '',
    kpiTable([
      { label: '核验 P50', actual: ms(stat(data, 'gate_verify_ms', 'p(50)')), target: '—' },
      { label: '核验 P95', actual: ms(verifyP95), target: '< 500ms', pass: (verifyP95 ?? Infinity) < 500 },
      { label: '核验 P99', actual: ms(stat(data, 'gate_verify_ms', 'p(99)')), target: '—' },
      { label: '通行回执 P95', actual: ms(stat(data, 'gate_passage_ms', 'p(95)')), target: '—' },
      {
        label: '开闸链路 P95 (核验+回执)',
        actual: ms(chainP95),
        target: '< 1000ms',
        pass: (chainP95 ?? Infinity) < 1000,
      },
      {
        label: '看板 P95',
        actual: ms(dashP95),
        target: '< 5000ms',
        pass: (dashP95 ?? Infinity) < 5000,
      },
      {
        label: '看板 P99',
        actual: ms(stat(data, 'dashboard_ms', 'p(99)')),
        target: '—',
      },
      {
        label: '服务端错误率 (5xx/网络)',
        actual: `${((stat(data, 'http_req_failed', 'rate') ?? 0) * 100).toFixed(2)}%`,
        target: '= 0%',
        pass: (stat(data, 'http_req_failed', 'rate') ?? 1) === 0,
      },
      {
        label: '开闸次数',
        actual: num(opened),
        target: `= ${GATE_TICKETS}`,
        pass: opened === GATE_TICKETS,
      },
      {
        label: '拒绝路径正确拒绝',
        actual: num(stat(data, 'gate_reject_path_blocked', 'count')),
        target: '> 0',
      },
    ]),
    '',
    `注：核验延迟为 k6 客户端观测值（含 HMAC 签名与本机网络），服务端日志另有耗时。`,
    '',
  ];

  return {
    stdout: lines.join('\n'),
    'loadtest/results/gate-summary.json': JSON.stringify(data, null, 2),
  };
}
