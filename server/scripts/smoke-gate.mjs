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

  // —— 被测景区由**闸机**决定，不用 `areas[0]` ——
  //
  // 闸机是种子里绑在某个景区上的，而核验接口按「这台闸机服不服务于这单的景区」判
  // `GATE_NO_PERMISSION`。硬编码 `areas[0]` 的后果实测过：把运营景区换成另一家之后，
  // 核验/开闸/核销/在园人数**整组断言一起红**，报的全是「该闸机不服务于本景区」——
  // 看着像功能坏了，其实是「闸机绑的景区」和「areas[0]」不是同一家。
  // 所以反过来推：找一台**所服务的景区仍然存在**的示例闸机，用它所在的景区当被测景区。
  //
  // ⚠️ 脚本用的是示例密钥 `dev-gate-secret-change-me`，所以只认种子里的 GATE001/002。
  //    换成别的闸机要同步改 `GATE_SECRET`。
  const gates = await api('GET', '/api/admin/gates', { token: adminToken });
  const gateRows = gates.data ?? [];
  const entryGate = gateRows.find((g) => g.gateNo === 'GATE001');
  const exitGate = gateRows.find((g) => g.gateNo === 'GATE002');
  const areaOf = (g) => (areas.data ?? []).find((a) => a.id === g?.scenicAreaId);

  if (!entryGate || !areaOf(entryGate)) {
    // 只有**一条**失败，而且写清怎么修 —— 以前这里会连坐 7 条，报的全是同一句「该闸机不服务于本景区」
    check(
      '示例闸机服务的景区仍然存在（否则 M3 链路无从执行）',
      false,
      `GATE001 现在绑在景区 id=${entryGate?.scenicAreaId ?? '(不存在)'}，而该景区已不在列表里；` +
        `现有景区 id：${(areas.data ?? []).map((a) => a.id).join('/') || '(空)'}。` +
        `核验/开闸/核销/在园人数这几组断言全部无从执行。` +
        `修法：把闸机改绑到在营景区 —— 后台「闸机管理 → 闸机设备」里「编辑」即可换绑（需要 gate:update，` +
        `种子给了景区管理员），也可以在那边「新增闸机」建一台；应急时改库：` +
        `UPDATE gate_device SET scenic_area_id=<景区id> WHERE gate_no IN ('GATE001','GATE002')。`,
    );
    console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败（闸机没有服务于任何在营景区，提前中止）===\n`);
    process.exit(1);
  }

  const areaId = entryGate.scenicAreaId;
  if (!exitGate || exitGate.scenicAreaId !== areaId) {
    check(
      '出口闸机 GATE002 与入口在同一景区',
      false,
      `GATE002 绑的是景区 id=${exitGate?.scenicAreaId ?? '(不存在)'}，与入口的 ${areaId} 不一致；` +
        `出园方向那几条断言会拿不到通行回执`,
    );
  }

  const types = await api('GET', `/api/admin/ticket-types?areaId=${areaId}`, { token: adminToken });
  const ticketTypeId = types.data?.[0]?.id;

  // 需要一个「当前时间落在核销时段容差内」的时段。
  // 优先复用已有的冒烟时段（避免每次运行都新增时段、让库存维度无限增长），没有才新建。
  const now = new Date();
  //
  // ⚠️ 时间必须**夹在当天之内**。原来直接取 `now±1h` 的时分，跨零点时会出事：
  // 00:57 跑时 start 变成前一天的 `23:57`、end 是 `01:57`，而服务端按**字符串**比
  // `startTime < endTime`，`'23:57' >= '01:57'` 直接 400「开始时间需早于结束时间」——
  // 结果这套冒烟在 **00:00~01:00 之间根本跑不起来**（实测过）。
  const clampHm = (deltaHours) => {
    const h = Math.min(23, Math.max(0, now.getHours() + deltaHours));
    return `${pad(h)}:00`;
  };
  const startTime = clampHm(-1);
  const endTime = clampHm(2);
  const minutesOf = (t) => {
    const [h, m] = String(t).split(':').map(Number);
    return h * 60 + m;
  };
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const coversNow = (slot) =>
    nowMinutes >= minutesOf(slot.startTime) - 60 && nowMinutes <= minutesOf(slot.endTime) + 60;

  const existingSlots = await api('GET', `/api/admin/time-slots?areaId=${areaId}`, { token: adminToken });
  const reusable = (existingSlots.data ?? []).find((s) => s.name.startsWith('冒烟时段') && coversNow(s));

  let slotId = reusable?.id;
  if (!slotId) {
    const slotRes = await api('POST', '/api/admin/time-slots', {
      token: adminToken,
      body: {
        scenicAreaId: areaId,
        name: `冒烟时段${RUN % 1000}`,
        startTime,
        endTime,
        sortOrder: 99,
      },
    });
    slotId = slotRes.data?.id;
    if (!slotId) {
      console.error('临时时段创建失败：', JSON.stringify(slotRes.json));
      process.exit(1);
    }
  }

  // 为今天生成该时段的库存
  await api('POST', '/api/admin/stocks/generate', {
    token: adminToken,
    body: { ticketTypeId, startDate: today(), endDate: today(), total: 50 },
  });

  // 闸机与所属景区在开头就查过了（被测景区就是由它推出来的）
  check('示例闸机已注册（入口+出口）', !!entryGate && !!exitGate, JSON.stringify(gateRows.map((g) => g.gateNo)));
  check('入口闸机服务于本次被测景区', entryGate?.scenicAreaId === areaId, `GATE001 → 景区 ${entryGate?.scenicAreaId}，被测景区 ${areaId}`);

  // ---- 闸机设备的新增 / 编辑 / 删除 ----
  // 自己能建自己能删，所以不留垃圾：建的是一台「没跑过」的新闸机，最后删掉。
  {
    const gateNo = `SMOKE-GATE-${RUN}`;
    const created = await api('POST', '/api/admin/gates', {
      token: adminToken,
      body: { scenicAreaId: areaId, gateNo, name: '冒烟闸机', direction: 3 },
    });
    const newGateId = created.data?.id;
    check(
      '新增闸机（返回一次性密钥）',
      !!newGateId && (created.data?.secretKey ?? '').length >= 32,
      JSON.stringify(created.json).slice(0, 140),
    );

    const dup = await api('POST', '/api/admin/gates', {
      token: adminToken,
      body: { scenicAreaId: areaId, gateNo, name: '重名' },
    });
    check('闸机编号重复被拒(409)', dup.status === 409, `${dup.status} ${dup.json?.msg}`);

    const badArea = await api('POST', '/api/admin/gates', {
      token: adminToken,
      body: { scenicAreaId: 999999, gateNo: `${gateNo}-X` },
    });
    check('绑到不存在的景区被拒(400)', badArea.status === 400, `${badArea.status} ${badArea.json?.msg}`);

    const updated = await api('PUT', `/api/admin/gates/${newGateId}`, {
      token: adminToken,
      body: { name: '冒烟闸机（已改名）', direction: 1, status: 3 },
    });
    check('编辑闸机（改名/方向/禁用）', updated.status === 200, JSON.stringify(updated.json).slice(0, 140));

    const after = await api('GET', `/api/admin/gates?areaId=${areaId}`, { token: adminToken });
    const mine = (after.data ?? []).find((g) => g.id === newGateId);
    check(
      '列表看到改动（名称 / 方向 / 禁用都生效）',
      mine?.name === '冒烟闸机（已改名）' && mine?.direction === 1 && mine?.status === 3,
      JSON.stringify(mine),
    );
    // 密钥只在新增那一次下发；列表里连字段都不该有（listDevices 里 secretKey: undefined）
    check('列表不下发密钥', mine?.secretKey === undefined, JSON.stringify(mine)?.slice(0, 200));

    const badStatus = await api('PUT', `/api/admin/gates/${newGateId}`, { token: adminToken, body: { status: 2 } });
    check('运行时状态（2 离线）不接受直接写(400)', badStatus.status === 400, badStatus.status);

    // 删除：跑过的删不掉（那些记录会变成说不清是哪台设备的孤儿行），刚建的能删
    const delOld = await api('DELETE', `/api/admin/gates/${entryGate.id}`, { token: adminToken });
    check('删有记录的闸机被拒(409)', delOld.status === 409, `${delOld.status} ${String(delOld.json?.msg).slice(0, 70)}`);
    const delNew = await api('DELETE', `/api/admin/gates/${newGateId}`, { token: adminToken });
    check('删刚建、没跑过的闸机 → 成功', delNew.status === 200, `${delNew.status} ${delNew.json?.msg}`);
  }

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

  // ---- 通行规则（A-044）：时段 / 票种 ----
  // 同样借**这张还没用过的凭证**验 —— 被规则挡下不消耗名额，之后照常走完核销流程。
  {
    const slots = (await api('GET', `/api/admin/time-slots?areaId=${areaId}`, { token: adminToken })).data ?? [];
    const types = (await api('GET', `/api/admin/ticket-types?areaId=${areaId}`, { token: adminToken })).data ?? [];
    const otherSlot = slots.find((s) => s.id !== slotId);
    const otherType = types.find((t) => t.id !== ticketTypeId);
    const orderDetail = await api('GET', `/api/mini/orders/${orderId}`, { token });
    const reservationId = orderDetail.data?.reservation?.id;

    // ① 时段：把规则配成「另一个时段」，这张预约就应当被拒
    await api('PUT', `/api/admin/gates/${entryGate.id}`, {
      token: adminToken,
      body: { allowedSlotIds: [otherSlot?.id ?? slotId] },
    });
    if (otherSlot) {
      const blockedSlot = await gateApi('POST', '/api/gate/verify', { credential: credentialToken, direction: 1 });
      check(
        '通行规则：预约时段不在允许列表里 → 拒（提示走其他通道）',
        blockedSlot.data?.ok === false && /不放行此时段/.test(blockedSlot.data?.message ?? ''),
        JSON.stringify(blockedSlot.data),
      );
    } else {
      check('通行规则：预约时段不在允许列表里 → 拒', false, '本景区只有一个时段，造不出「另一个时段」');
    }

    // ② 票种：规则配成「另一个票种」
    await api('PUT', `/api/admin/gates/${entryGate.id}`, {
      token: adminToken,
      body: { allowedSlotIds: [], allowedTicketTypeIds: [otherType?.id ?? -1] },
    });
    if (otherType) {
      const blockedType = await gateApi('POST', '/api/gate/verify', { credential: credentialToken, direction: 1 });
      check(
        '通行规则：订单票种不在允许列表里 → 拒（提示走其他通道）',
        blockedType.data?.ok === false && /不放行此票种/.test(blockedType.data?.message ?? ''),
        JSON.stringify(blockedType.data),
      );
    } else {
      check('通行规则：订单票种不在允许列表里 → 拒', false, '本景区只有一个票种，造不出「另一个票种」');
    }

    // ③ 规则要下发给闸机（真机离线时按同一套拦）
    await api('PUT', `/api/admin/gates/${entryGate.id}`, {
      token: adminToken,
      body: { allowedSlotIds: [slotId], allowedTicketTypeIds: [ticketTypeId] },
    });
    const allowed = await gateApi('GET', '/api/gate/rules');
    check(
      '通行规则随 /gate/rules 下发',
      (allowed.data?.passageRules?.slotIds ?? []).includes(slotId) &&
        (allowed.data?.passageRules?.ticketTypeIds ?? []).includes(ticketTypeId),
      JSON.stringify(allowed.data?.passageRules),
    );
    check(
      '离线白名单按规则过滤后仍含本单（时段+票种都放行）',
      (allowed.data?.reservationIds ?? []).includes(reservationId),
      `白名单 ${allowed.data?.reservationIds?.length ?? 0} 条，本单 reservationId=${reservationId}`,
    );

    // ④ 反向：规则只放行**另一个**时段 → 离线白名单里就该没有本单（断网时也不会把它放进来）
    if (otherSlot) {
      await api('PUT', `/api/admin/gates/${entryGate.id}`, {
        token: adminToken,
        body: { allowedSlotIds: [otherSlot.id], allowedTicketTypeIds: [] },
      });
      const filtered = await gateApi('GET', '/api/gate/rules');
      check(
        '离线白名单按规则把本单过滤掉',
        !(filtered.data?.reservationIds ?? []).includes(reservationId),
        `白名单 ${filtered.data?.reservationIds?.length ?? 0} 条，本单 reservationId=${reservationId}`,
      );
    }

    // 恢复「不限」，别把规则留在闸机上（后面还要走完整的核销流程）
    const cleared = await api('PUT', `/api/admin/gates/${entryGate.id}`, {
      token: adminToken,
      body: { allowedSlotIds: [], allowedTicketTypeIds: [] },
    });
    check('清空规则 = 恢复「不限」', cleared.status === 200, `${cleared.status} ${cleared.json?.msg}`);
    const after = await api('GET', '/api/admin/gates', { token: adminToken });
    const g = (after.data ?? []).find((x) => x.id === entryGate.id);
    check('清空后回读是 null（不是空数组）', g?.allowedSlotIds === null && g?.allowedTicketTypeIds === null, JSON.stringify({ s: g?.allowedSlotIds, t: g?.allowedTicketTypeIds }));
  }

  // 闸机被禁用 ⇒ 核验一律拒。
  // 借**这张还没用过的凭证**验：被拒**不会消耗名额**（这正是「拒绝」的含义），之后照常走完核销。
  // 用完立刻恢复，别把这台闸机留在禁用态（后面还有出入园的断言要靠它）。
  {
    await api('PUT', `/api/admin/gates/${entryGate.id}`, { token: adminToken, body: { status: 3 } });
    const disabled = await gateApi('POST', '/api/gate/verify', { credential: credentialToken, direction: 1 });
    // ⚠️ 拒在**鉴权层**：`GateAuthGuard` 直接在验签前拦掉 `status === 3`，回 401 + 「闸机已禁用」，
    // 业务层那句 `checkGate` 的「闸机已禁用」根本走不到（那条只有 `/api/admin/verify` 代刷那条路会用）。
    check(
      '闸机被禁用时核验被拒（401 闸机已禁用）',
      disabled.status === 401 && /禁用/.test(disabled.json?.msg ?? ''),
      `${disabled.status} ${disabled.json?.msg}`,
    );

    await api('PUT', `/api/admin/gates/${entryGate.id}`, { token: adminToken, body: { status: 1 } });
    const restored = await api('GET', `/api/admin/gates?areaId=${areaId}`, { token: adminToken });
    const back = (restored.data ?? []).find((g) => g.id === entryGate.id);
    // 「启用」落成 1 在线还是 2 离线，取决于最近有没有心跳 —— 只要不是 3 就行
    check('恢复启用（不再是禁用态）', back?.status !== 3, `status=${back?.status}`);
  }

  // ---- 3. 闸机核验开闸 ----
  console.log('\n[3] 闸机核验与开闸');
  const before = await api('GET', '/api/admin/dashboard/realtime', { token: adminToken });
  const presenceBefore = before.data?.presence ?? 0;

  const verify1 = await gateApi('POST', '/api/gate/verify', { credential: credentialToken, direction: 1 });
  check(
    '核验通过并返回开闸指令（open=true + cmdId）',
    verify1.data?.ok === true && verify1.data?.open === true && !!verify1.data?.cmdId,
    JSON.stringify(verify1.json),
  );
  check('返回游客姓名与剩余人数', verify1.data?.visitorName === '核销测试甲' && verify1.data?.remaining === 1, JSON.stringify(verify1.data));

  // 此时订单是「部分核销(30)」—— 不允许退款。
  // 理由：退款金额按**整单金额**算（见 PayService.calcRefund），不看已核销人数，
  // 放行的话 2 人单核销 1 人后退款会把已经消费掉的那张票的钱也退掉。
  const partialRefund = await api('POST', `/api/mini/orders/${orderId}/refund`, {
    token,
    body: { reason: '部分核销后尝试退款' },
  });
  check(
    '部分核销(30)的订单不能申请退款',
    partialRefund.status === 400,
    `实际 ${partialRefund.status} ${JSON.stringify(partialRefund.json)}`,
  );

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

  // **业务日期回归**：看板的 `date` 是服务端算出来的「今天」，必须与本机（东八区）的今天一致。
  // 这正对着那个 UTC bug —— 服务端原来用 `toISOString().slice(0,10)`，
  // 每天 00:00–08:00 会返回昨天，这条断言在凌晨跑就会失败（白天跑看不出来）。
  const localToday = today();
  check(
    `服务端的「今天」= 本地今天（${localToday}）`,
    dash.data?.date === localToday,
    `服务端 ${dash.data?.date} / 本地 ${localToday}`,
  );

  // 小程序首页「在园率」走的是免登录的 areas/:id/presence ——
  // 直接在这里比它和看板的值，确保两处**口径没有漂移**（都以内通行回执为准）
  const miniPresence = await api('GET', `/api/mini/areas/${areaId}/presence`);
  check(
    '小程序在园接口免登录且与看板口径一致',
    miniPresence.data?.current === dash.data?.presence &&
      miniPresence.data?.capacityRate === dash.data?.capacityRate &&
      typeof miniPresence.data?.maxCapacity === 'number',
    `小程序 ${JSON.stringify(miniPresence.data)} vs 看板 presence=${dash.data?.presence} rate=${dash.data?.capacityRate}`,
  );

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
