#!/usr/bin/env node
/**
 * M3 冒烟测试：动态凭证 → 闸机核验开闸 → 核销 → 通行 → 在园人数 → 告警/看板
 *
 * 闸机按真实协议调用（HMAC 签名 + nonce 防重放），一期用模拟器逻辑直连服务端；
 * 与 gate-simulator/ 的签名算法完全一致。
 *
 * 用法：node scripts/smoke-gate.mjs [baseUrl]
 */
import { createHmac, randomBytes } from 'crypto';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const GATE_SECRET = 'dev-gate-secret-change-me';
const RUN = Date.now() % 100000;

let pass = 0;
let fail = 0;

function check(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name} ${detail}`);
  }
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* 空响应 */
  }
  return { status: res.status, json, data: json?.data };
}

/** 闸机调用：HMAC 签名 + 时间戳 + nonce（与服务端 GateAuthGuard 一致） */
async function gateApi(method, path, body, { gateNo = 'GATE001', secret = GATE_SECRET } = {}) {
  const raw = body ? JSON.stringify(body) : '';
  const timestamp = Date.now().toString();
  const nonce = randomBytes(8).toString('hex');
  const signature = createHmac('sha256', secret)
    .update(`${method}${path}${timestamp}${nonce}${raw}`)
    .digest('hex');

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Gate-No': gateNo,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Signature': signature,
    },
    body: raw || undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* ignore */
  }
  return { status: res.status, json, data: json?.data };
}

const pad = (n) => String(n).padStart(2, '0');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function idCard(seq) {
  return `11010119900101${String(RUN % 100).padStart(2, '0')}${String(seq % 100).padStart(2, '0')}`;
}

async function main() {
  console.log(`\n=== M3 冒烟测试 (${BASE}) ===\n`);

  // ---- 准备 ----
  const adminLogin = await api('POST', '/api/admin/auth/login', {
    body: { username: 'admin', password: 'admin123' },
  });
  const adminToken = adminLogin.data?.token;
  if (!adminToken) {
    console.error('管理端登录失败');
    process.exit(1);
  }

  const areas = await api('GET', '/api/admin/scenic/areas', { token: adminToken });
  const areaId = areas.data?.[0]?.id;
  const types = await api('GET', `/api/admin/ticket-types?areaId=${areaId}`, { token: adminToken });
  const ticketTypeId = types.data?.[0]?.id;

  // 创建一个覆盖当前时间的临时时段（保证与运行时刻无关，核销时段校验可通过）
  const now = new Date();
  const startH = new Date(now.getTime() - 60 * 60 * 1000);
  const endH = new Date(now.getTime() + 60 * 60 * 1000);
  const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const slotRes = await api('POST', '/api/admin/time-slots', {
    token: adminToken,
    body: {
      scenicAreaId: areaId,
      name: `冒烟时段${RUN % 1000}`,
      startTime: hm(startH),
      endTime: hm(endH),
      sortOrder: 99,
    },
  });
  const slotId = slotRes.data?.id;
  if (!slotId) {
    console.error('临时时段创建失败：', JSON.stringify(slotRes.json));
    process.exit(1);
  }

  // 为今天生成该时段的库存
  await api('POST', '/api/admin/stocks/generate', {
    token: adminToken,
    body: { ticketTypeId, startDate: today(), endDate: today(), total: 50 },
  });

  const gates = await api('GET', '/api/admin/gates', { token: adminToken });
  const entryGate = gates.data?.find((g) => g.gateNo === 'GATE001');
  const exitGate = gates.data?.find((g) => g.gateNo === 'GATE002');
  check('示例闸机已注册（入口+出口）', !!entryGate && !!exitGate, JSON.stringify(gates.data?.map((g) => g.gateNo)));

  // ---- 1. 闸机心跳与规则 ----
  console.log('[1] 闸机心跳与规则拉取');
  const heartbeat = await gateApi('POST', '/api/gate/heartbeat', {
    firmwareVersion: 'sim-1.0.0',
    cachedRuleVersion: 0,
  });
  check('心跳上报成功', heartbeat.data?.ok === true, JSON.stringify(heartbeat.json));
  check('返回规则版本与心跳间隔', heartbeat.data?.ruleVersion > 0 && heartbeat.data?.heartbeatInterval === 30);

  const rules = await gateApi('GET', '/api/gate/rules');
  check('规则拉取成功（含凭证密钥与当日白名单）', !!rules.data?.credential?.secret && Array.isArray(rules.data?.reservationIds), JSON.stringify(rules.data?.date));

  const badSign = await gateApi('POST', '/api/gate/heartbeat', { firmwareVersion: 'x' }, { secret: 'wrong-secret' });
  check('错误密钥签名被拒(401)', badSign.status === 401, `实际 ${badSign.status}`);

  // 重放：同一 nonce 再发一次
  const replayBody = JSON.stringify({ firmwareVersion: 'replay' });
  const ts = Date.now().toString();
  const nonce = randomBytes(8).toString('hex');
  const sig = createHmac('sha256', GATE_SECRET).update(`POST/api/gate/heartbeat${ts}${nonce}${replayBody}`).digest('hex');
  const hdrs = {
    'Content-Type': 'application/json',
    'X-Gate-No': 'GATE001',
    'X-Timestamp': ts,
    'X-Nonce': nonce,
    'X-Signature': sig,
  };
  const first = await fetch(`${BASE}/api/gate/heartbeat`, { method: 'POST', headers: hdrs, body: replayBody });
  const second = await fetch(`${BASE}/api/gate/heartbeat`, { method: 'POST', headers: hdrs, body: replayBody });
  check(
    '首次请求成功、重复 nonce 被拒（防重放）',
    [200, 201].includes(first.status) && second.status === 401,
    `${first.status}/${second.status}`,
  );

  // ---- 2. 下单支付并获取凭证 ----
  console.log('\n[2] 下单支付与动态凭证');
  const login = await api('POST', '/api/mini/auth/login', { body: { code: `gate_${RUN}` } });
  const token = login.data?.token;

  const order = await api('POST', '/api/mini/orders', {
    token,
    body: {
      ticketTypeId,
      date: today(),
      timeSlotId: slotId,
      visitors: [
        { name: '核销测试甲', idCard: idCard(1) },
        { name: '核销测试乙', idCard: idCard(2) },
      ],
    },
  });
  check('下单成功（2 人）', !!order.data?.orderNo, JSON.stringify(order.json));
  const orderId = order.data?.orderId;
  const orderNo = order.data?.orderNo;

  await api('POST', `/api/mini/pay/mock-notify?orderNo=${orderNo}`, { token });

  const cred = await api('GET', `/api/mini/orders/${orderId}/credential`, { token });
  check('获取动态凭证 token', !!cred.data?.token && cred.data?.expiresIn === 60, JSON.stringify(cred.data));
  check('凭证返回剩余可入园人数', cred.data?.remainingCount === 2, `remaining=${cred.data?.remainingCount}`);
  let credentialToken = cred.data?.token;

  // ---- 3. 闸机核验开闸 ----
  console.log('\n[3] 闸机核验与开闸');
  const before = await api('GET', '/api/admin/dashboard/realtime', { token: adminToken });
  const presenceBefore = before.data?.presence ?? 0;

  const verify1 = await gateApi('POST', '/api/gate/verify', { credential: credentialToken, direction: 1 });
  check('核验通过并返回开闸指令', verify1.data?.ok === true && !!verify1.data?.cmdId, JSON.stringify(verify1.json));
  check('返回游客姓名与剩余人数', verify1.data?.visitorName === '核销测试甲' && verify1.data?.remaining === 1, JSON.stringify(verify1.data));

  // 在园人数以「通行回执」为准，核验通过本身不计数
  const afterVerify = await api('GET', '/api/admin/dashboard/realtime', { token: adminToken });
  check(
    `仅核验不计入在园（仍为 ${presenceBefore}）`,
    afterVerify.data?.presence === presenceBefore,
    `${presenceBefore} → ${afterVerify.data?.presence}`,
  );

  const verify2 = await gateApi('POST', '/api/gate/verify', { credential: credentialToken, direction: 1 });
  check('再次核验核销第二张票（部分核销）', verify2.data?.ok === true && verify2.data?.remaining === 0, JSON.stringify(verify2.data));

  const verify3 = await gateApi('POST', '/api/gate/verify', { credential: credentialToken, direction: 1 });
  check('第三张无票可核销 → ALREADY_VERIFIED', verify3.data?.ok === false && verify3.data?.code === 'ALREADY_VERIFIED', JSON.stringify(verify3.data));

  const detail = await api('GET', `/api/mini/orders/${orderId}`, { token });
  check('订单状态=已核销(40)', detail.data?.status === 40, `status=${detail.data?.status}`);
  check('预约核销数=2', detail.data?.reservation?.verifyCount === 2);

  // ---- 4. 开闸回执与出园 ----
  console.log('\n[4] 通行回执与出园');
  const passage = await gateApi('POST', '/api/gate/passage', {
    reservationId: detail.data?.reservation?.id,
    direction: 1,
    result: 1,
  });
  check('开闸回执上报成功', passage.data?.ok === true, JSON.stringify(passage.json));
  check(
    `通行回执后在园人数 +1（${presenceBefore} → ${passage.data?.presence}）`,
    passage.data?.presence === presenceBefore + 1,
    JSON.stringify(passage.data),
  );

  const exit = await gateApi('POST', '/api/gate/verify', { credential: credentialToken, direction: 2 }, { gateNo: 'GATE002' });
  check('已核销票从出园闸机通过被拒（无票可核销）', exit.data?.ok === false, JSON.stringify(exit.data?.code));

  const exitPassage = await gateApi(
    'POST',
    '/api/gate/passage',
    { reservationId: detail.data?.reservation?.id, direction: 2, result: 1 },
    { gateNo: 'GATE002' },
  );
  check('出园通行上报成功', exitPassage.data?.ok === true);
  check(
    `出园后在园人数回到 ${presenceBefore}（实际 ${exitPassage.data?.presence}）`,
    exitPassage.data?.presence === presenceBefore,
    JSON.stringify(exitPassage.data),
  );

  // ---- 5. 凭证过期与闸机权限 ----
  console.log('\n[5] 异常场景');
  const entryAsExit = await gateApi('POST', '/api/gate/verify', { credential: credentialToken, direction: 1 }, { gateNo: 'GATE002' });
  check('出园闸机做入园核验被拒（GATE_NO_PERMISSION）', entryAsExit.data?.code === 'GATE_NO_PERMISSION', JSON.stringify(entryAsExit.data?.code));

  const expired = await gateApi('POST', '/api/gate/verify', { credential: 'invalid.token', direction: 1 });
  check('非法凭证被拒（INVALID_CREDENTIAL）', expired.data?.code === 'INVALID_CREDENTIAL', JSON.stringify(expired.data?.code));

  const futureOrder = await api('POST', '/api/mini/orders', {
    token,
    body: {
      ticketTypeId,
      date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
      timeSlotId: slotId,
      visitors: [{ name: '未来日期游客', idCard: idCard(9) }],
    },
  });
  if (futureOrder.data?.orderNo) {
    // 未来日期预约需要先支付，再核验应被拒
    await api('POST', `/api/mini/pay/mock-notify?orderNo=${futureOrder.data.orderNo}`, { token });
    const futureCred = await api('GET', `/api/mini/orders/${futureOrder.data.orderId}/credential`, { token });
    if (futureCred.data?.token) {
      const wrongDate = await gateApi('POST', '/api/gate/verify', { credential: futureCred.data.token, direction: 1 });
      check('非预约日期核验被拒（WRONG_DATE）', wrongDate.data?.code === 'WRONG_DATE', JSON.stringify(wrongDate.data?.code));
    }
  }

  // ---- 6. 告警与离线同步 ----
  console.log('\n[6] 告警与离线记录同步');
  const alarm = await gateApi('POST', '/api/gate/alarm', {
    type: 'tailgate',
    level: 3,
    content: '冒烟测试：检测到尾随',
  });
  check('闸机告警上报成功', alarm.data?.ok === true);

  const alarmList = await api('GET', '/api/admin/alarms?page=1&pageSize=5', { token: adminToken });
  check('后台可见该告警', alarmList.data?.items?.some((a) => a.type === 'tailgate' && a.content.includes('冒烟测试')), JSON.stringify(alarmList.data?.items?.[0]?.type));

  const offline = await gateApi('POST', '/api/gate/offline/sync', {
    batchNo: `SMOKE-${RUN}`,
    records: [
      { credential: credentialToken, direction: 1, result: 1, passedAt: new Date().toISOString() },
    ],
  });
  check('离线记录上传，已核销票标记为冲突（以首次核销为准）', offline.data?.conflicts === 1 && offline.data?.merged === 0, JSON.stringify(offline.data));

  // ---- 7. 看板 ----
  console.log('\n[7] 实时看板');
  const dash = await api('GET', `/api/admin/dashboard/realtime?areaId=${areaId}`, { token: adminToken });
  check('看板返回在园人数', typeof dash.data?.presence === 'number', JSON.stringify(dash.data?.presence));
  check('看板返回承载率', typeof dash.data?.capacityRate === 'number' && dash.data.capacityRate >= 0);
  check('看板返回闸机在线率', typeof dash.data?.gateOnlineRate === 'number');
  check('看板返回今日核销与通道数据', typeof dash.data?.verificationCount === 'number' && typeof dash.data?.inToday === 'number');

  const hourly = await api('GET', `/api/admin/dashboard/hourly?areaId=${areaId}`, { token: adminToken });
  check('分时趋势返回 24 小时', Array.isArray(hourly.data) && hourly.data.length === 24);

  const rebuild = await api('POST', `/api/admin/stats/rebuild?date=${today()}&areaId=${areaId}`, { token: adminToken });
  check('日统计重算成功', rebuild.data?.rebuilt === true);

  const daily = await api('GET', `/api/admin/stats/daily?start=${today()}&end=${today()}&areaId=${areaId}`, { token: adminToken });
  check('日统计可查且入/出园数已落库', daily.data?.length > 0 && Number(daily.data[0].in_count) >= 1, JSON.stringify(daily.data?.[0]));

  console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n冒烟测试异常：', err);
  process.exit(1);
});
