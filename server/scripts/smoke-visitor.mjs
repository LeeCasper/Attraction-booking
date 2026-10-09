#!/usr/bin/env node
/**
 * 常用出行人接口冒烟（PRD U-031 / 技术方案 §3.2 的 `/api/mini/visitors`）
 *
 * 覆盖：
 *   1. 未登录被拒
 *   2. 身份证**校验位验真**（本期新增能力：格式对但校验位/日期不对必须 400）
 *   3. 新增成功，且返回体**只有脱敏信息、没有明文证件**
 *   4. 同证件重复新增幂等（不报错、不产生第二条）
 *   5. 默认出行人**有且只有一个**
 *   6. 编辑：改名、改成重复证件被拒、清空手机号、改默认
 *   7. 越权：改/删别人的出行人返回 404（不泄露存在性）
 *   8. 删除未被引用的成功
 *   9. **删除已被订单引用的被拒**（最容易做错的一条：order_item 只存 visitor_id，
 *      不快照姓名证件，硬删会让历史订单丢掉持票人）
 *  10. 数量上限
 *
 * 用法：node scripts/smoke-visitor.mjs [baseUrl]
 *
 * 可重复执行：mock 登录的 openid 由 code 派生（`mock_openid_${code}`），
 * 所以每次运行换一个带 RUN 的 code 就是一个**全新用户**，列表天然从空开始，
 * 不会累积到上限、也不会撞上历史数据。
 */
const BASE = process.argv[2] ?? 'http://localhost:3000';

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

const fmt = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOffset = (n) => fmt(new Date(Date.now() + n * 86400000));

/** 运行标识：换它 = 换一个全新用户 */
const RUN = Date.now() % 100000;

// ---- 校验位合法（GB 11643 MOD 11-2）的身份证生成 ----
// 与现有 smoke-order.mjs 不同：那边用的是纯构造号（校验位不合法），因为下单接口只校验格式；
// 常用出行人接口要求校验位通过，所以这里必须真的把校验位算出来。
const WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const CHECK_CODES = '10X98765432';

function completeIdCard(body17) {
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += Number(body17[i]) * WEIGHTS[i];
  return body17 + CHECK_CODES[sum % 11];
}

/**
 * 合法且在本轮内唯一的身份证号。
 *
 * 结构必须**严格**是「地区(6) + 出生日期(8) + 顺序码(3) = 17 位」再补校验位 ——
 * 少一位多一位都会在格式校验那关就被打回（曾经把顺序码写成 4 位，整轮用例全崩在这儿）。
 *
 * 这里不需要把 RUN 编进号里：mock 登录按 code 派生 openid，每次运行本来就是**不同的用户**，
 * 唯一性只需保证同一次运行内不重复，顺序码足够。
 */
function idCard(seq) {
  return completeIdCard(`11010119900101${String(seq % 1000).padStart(3, '0')}`);
}

async function main() {
  console.log(`\n=== 常用出行人冒烟 (${BASE}) ===\n`);

  // ---- 准备：管理端登录 + 生成库存（只为「删除已被订单引用」那条用例）----
  const adminLogin = await api('POST', '/api/admin/auth/login', {
    body: { username: 'admin', password: 'admin123' },
  });
  const adminToken = adminLogin.data?.token;
  if (!adminToken) {
    console.error('管理端登录失败，无法继续：', JSON.stringify(adminLogin.json));
    process.exit(1);
  }
  const areas = await api('GET', '/api/admin/scenic/areas', { token: adminToken });
  const areaId = areas.data?.[0]?.id;
  const types = await api('GET', `/api/admin/ticket-types?areaId=${areaId}`, { token: adminToken });
  const ticketTypeId = types.data?.[0]?.id;
  const slots = await api('GET', `/api/admin/time-slots?areaId=${areaId}`, { token: adminToken });
  const slotId = slots.data?.[0]?.id;
  // 独立的日期区间，避免复用上轮已锁定的库存
  const D = dayOffset(30 + (RUN % 300));
  await api('POST', '/api/admin/stocks/generate', {
    token: adminToken,
    body: { ticketTypeId, startDate: D, endDate: D, total: 100 },
  });

  // ---- 1. 登录 ----
  console.log('[1] 小程序登录');
  const login = await api('POST', '/api/mini/auth/login', { body: { code: `visitor_smoke_${RUN}` } });
  const token = login.data?.token;
  check('模拟登录成功（未配置 WX_APPID 时走 mock）', !!token, JSON.stringify(login.json));

  check('未登录访问列表被拒(401)', (await api('GET', '/api/mini/visitors')).status === 401);
  check('未登录新增被拒(401)', (await api('POST', '/api/mini/visitors', { body: { name: 'x', idCard: idCard(1) } })).status === 401);

  // ---- 2. 初始列表 ----
  console.log('\n[2] 初始列表');
  const init = await api('GET', '/api/mini/visitors', { token });
  check('全新用户列表为空', Array.isArray(init.data) && init.data.length === 0, JSON.stringify(init.json));

  // ---- 3. 身份证校验位验真 ----
  console.log('\n[3] 身份证校验位验真');
  const id1 = idCard(1);

  const badCheckDigit = id1.slice(0, 17) + (id1[17] === '0' ? '1' : '0');
  const badChecksum = await api('POST', '/api/mini/visitors', {
    token,
    body: { name: '冒烟甲', idCard: badCheckDigit },
  });
  check('校验位不对 → 400', badChecksum.status === 400, `实际 ${badChecksum.status} ${JSON.stringify(badChecksum.json)}`);

  // 11010119900231001 → 校验位合法，但 1990-02-31 这天不存在
  const badDate = await api('POST', '/api/mini/visitors', {
    token,
    body: { name: '冒烟甲', idCard: completeIdCard('11010119900231001') },
  });
  check('出生日期不存在 → 400（校验位算法拦不住这个）', badDate.status === 400, `实际 ${badDate.status} ${JSON.stringify(badDate.json)}`);

  const badFormat = await api('POST', '/api/mini/visitors', { token, body: { name: '冒烟甲', idCard: '12345' } });
  check('格式不对 → 400', badFormat.status === 400, `实际 ${badFormat.status}`);

  const badPhone = await api('POST', '/api/mini/visitors', {
    token,
    body: { name: '冒烟甲', idCard: id1, phone: '123' },
  });
  check('手机号格式不对 → 400', badPhone.status === 400, `实际 ${badPhone.status}`);

  // ---- 4. 新增成功 + 脱敏 ----
  console.log('\n[4] 新增与脱敏');
  const created1 = await api('POST', '/api/mini/visitors', {
    token,
    body: { name: '冒烟甲', idCard: id1, phone: '13800001234' },
  });
  check('新增成功', created1.status === 201 || created1.status === 200, JSON.stringify(created1.json));
  check('首位出行人自动设为默认', created1.data?.isDefault === true, JSON.stringify(created1.data));
  check('badge=主出行人', created1.data?.badge === '主出行人', created1.data?.badge);
  check('证件号已脱敏', /^\d{3}\*+\d{4}$/.test(created1.data?.idCardMask ?? ''), created1.data?.idCardMask);
  check('手机号已脱敏', created1.data?.phoneMask === '138****1234', created1.data?.phoneMask);
  check(
    '返回体不含明文证件号',
    !JSON.stringify(created1.data).includes(id1),
    JSON.stringify(created1.data),
  );
  const vid1 = created1.data?.id;

  // ---- 5. 幂等 ----
  console.log('\n[5] 同证件重复新增是幂等的');
  const dup = await api('POST', '/api/mini/visitors', { token, body: { name: '冒烟甲换个名', idCard: id1 } });
  check('重复新增返回同一条记录', dup.data?.id === vid1, JSON.stringify(dup.data));
  check('名字没有被覆盖', dup.data?.name === '冒烟甲', dup.data?.name);
  const afterDup = await api('GET', '/api/mini/visitors', { token });
  check('列表仍只有 1 条', afterDup.data?.length === 1, `实际 ${afterDup.data?.length}`);

  // ---- 6. 默认出行人唯一 ----
  console.log('\n[6] 默认出行人有且只有一个');
  const id2 = idCard(2);
  const created2 = await api('POST', '/api/mini/visitors', {
    token,
    body: { name: '冒烟乙', idCard: id2, isDefault: true },
  });
  check('第二个可设为默认', created2.data?.isDefault === true);
  const vid2 = created2.data?.id;

  const list2 = await api('GET', '/api/mini/visitors', { token });
  check('默认只有一个', list2.data?.filter((v) => v.isDefault).length === 1, JSON.stringify(list2.data?.map((v) => v.isDefault)));
  check('默认项排在首位', list2.data?.[0]?.id === vid2, `首项 id=${list2.data?.[0]?.id} 期望 ${vid2}`);

  // ---- 7. 编辑 ----
  console.log('\n[7] 编辑');
  const renamed = await api('PUT', `/api/mini/visitors/${vid1}`, { token, body: { name: '冒烟甲改名' } });
  check('改姓名成功', renamed.data?.name === '冒烟甲改名', JSON.stringify(renamed.data));

  const toDup = await api('PUT', `/api/mini/visitors/${vid1}`, { token, body: { idCard: id2 } });
  check('改成已存在的证件 → 400', toDup.status === 400, `实际 ${toDup.status} ${JSON.stringify(toDup.json)}`);

  const cleared = await api('PUT', `/api/mini/visitors/${vid1}`, { token, body: { phone: '' } });
  check('传空串可清空手机号', cleared.data?.phoneMask === '', cleared.data?.phoneMask);

  await api('PUT', `/api/mini/visitors/${vid1}`, { token, body: { isDefault: true } });
  const list3 = await api('GET', '/api/mini/visitors', { token });
  check('切默认后仍然只有一个默认', list3.data?.filter((v) => v.isDefault).length === 1);
  check('新默认是刚设置的那个', list3.data?.find((v) => v.id === vid1)?.isDefault === true);

  // ---- 8. 越权 ----
  console.log('\n[8] 越权（不能碰别人的出行人）');
  const otherLogin = await api('POST', '/api/mini/auth/login', { body: { code: `visitor_smoke_other_${RUN}` } });
  const otherToken = otherLogin.data?.token;
  check('第二个用户登录成功', !!otherToken);
  // 注意用**合法**的请求体：姓名要 2-32 字，否则会先在参数校验那关返回 400，
  // 测不到「这条记录不属于你」这条路径（曾经用单字 'x' 踩过这个坑）
  const otherPut = await api('PUT', `/api/mini/visitors/${vid1}`, {
    token: otherToken,
    body: { name: '越权改名' },
  });
  check('改别人的出行人 → 404', otherPut.status === 404, `实际 ${otherPut.status} ${JSON.stringify(otherPut.json)}`);
  check('删别人的出行人 → 404', (await api('DELETE', `/api/mini/visitors/${vid1}`, { token: otherToken })).status === 404);
  check('别人看不到我的列表', (await api('GET', '/api/mini/visitors', { token: otherToken })).data?.length === 0);

  // ---- 9. 删除未被引用的 ----
  console.log('\n[9] 删除未被订单引用的');
  const delOk = await api('DELETE', `/api/mini/visitors/${vid2}`, { token });
  check('删除成功', delOk.status === 200, `实际 ${delOk.status} ${JSON.stringify(delOk.json)}`);
  check('删完列表少一条', (await api('GET', '/api/mini/visitors', { token })).data?.length === 1);

  // ---- 10. 已被订单引用的不能删（关键用例）----
  console.log('\n[10] 已被订单引用的出行人不能删');
  const order = await api('POST', '/api/mini/orders', {
    token,
    body: { ticketTypeId, date: D, timeSlotId: slotId, visitors: [{ name: '冒烟甲改名', idCard: id1 }] },
  });
  check('用该出行人下单成功', !!order.data?.orderId, JSON.stringify(order.json));
  const orderId = order.data?.orderId;

  const delUsed = await api('DELETE', `/api/mini/visitors/${vid1}`, { token });
  check('已被订单引用 → 400', delUsed.status === 400, `实际 ${delUsed.status} ${JSON.stringify(delUsed.json)}`);

  const detail = await api('GET', `/api/mini/orders/${orderId}`, { token });
  check(
    '订单详情仍能取到持票人（这正是硬删会破坏的东西）',
    !!detail.data?.items?.[0]?.visitorIdCard && !!detail.data?.items?.[0]?.visitorName,
    JSON.stringify(detail.data?.items?.[0]),
  );

  // ---- 11. 数量上限 ----
  console.log('\n[11] 数量上限');
  // 当前 1 位（vid1），再补到 10 位
  for (let seq = 3; seq <= 11; seq++) {
    await api('POST', '/api/mini/visitors', { token, body: { name: `冒烟${seq}`, idCard: idCard(seq) } });
  }
  const full = await api('GET', '/api/mini/visitors', { token });
  check('恰好到上限 10 位', full.data?.length === 10, `实际 ${full.data?.length}`);
  const overflow = await api('POST', '/api/mini/visitors', {
    token,
    body: { name: '冒烟溢出', idCard: idCard(12) },
  });
  check('超出上限 → 400', overflow.status === 400, `实际 ${overflow.status} ${JSON.stringify(overflow.json)}`);

  // ---- 12. 用 visitorId 下单（服务端新能力）----
  // 为什么需要它：`GET /api/mini/visitors` 只返回**脱敏**证件号，小程序端手里没有明文，
  // 「选一位已保存的出行人下单」只能靠 id。这条路径完全绕过明文证件。
  console.log('\n[12] 用 visitorId 下单（不传明文证件）');
  const target = full.data?.find((v) => v.id !== vid1);
  const byId = await api('POST', '/api/mini/orders', {
    token,
    body: { ticketTypeId, date: D, timeSlotId: slotId, visitors: [{ visitorId: target?.id }] },
  });
  check('传 visitorId 即可下单', !!byId.data?.orderId, JSON.stringify(byId.json));

  const byIdDetail = await api('GET', `/api/mini/orders/${byId.data?.orderId}`, { token });
  check(
    '订单明细里的持票人就是那位出行人',
    byIdDetail.data?.items?.[0]?.visitorName === target?.name,
    `${byIdDetail.data?.items?.[0]?.visitorName} vs ${target?.name}`,
  );
  check(
    '明细里仍是脱敏证件号（没有明文回流）',
    /^\d{3}\*+\d{4}$/.test(byIdDetail.data?.items?.[0]?.visitorIdCard ?? ''),
    byIdDetail.data?.items?.[0]?.visitorIdCard,
  );

  const stolen = await api('POST', '/api/mini/orders', {
    token: otherToken,
    body: { ticketTypeId, date: D, timeSlotId: slotId, visitors: [{ visitorId: target?.id }] },
  });
  check('拿别人的 visitorId 下单 → 404（不泄露存在性）', stolen.status === 404, `实际 ${stolen.status}`);

  console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n冒烟测试异常：', err);
  process.exit(1);
});
