#!/usr/bin/env node
/**
 * M2 冒烟测试：下单 → 防超卖 → 支付 → 退款
 *
 * 覆盖设计文档 §4（防超卖）与 §6（微信支付，mock 模式）：
 *   1. 小程序模拟登录
 *   2. 票种/余票查询
 *   3. 下单锁定库存（Redis 预减 + MySQL 乐观锁）
 *   4. 支付回调幂等（locked → sold）
 *   5. 并发下单不超卖
 *   6. 每证每日限购
 *   7. 取消订单释放库存
 *   8. 退款申请 → 后台审核 → 库存回流
 *
 * 用法：node scripts/smoke-order.mjs [baseUrl]
 * 可重复执行（每次运行使用新的证件号，避免撞限购）
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

/** 运行标识：保证每次运行的证件号唯一，避免撞上历史限购 */
const RUN = Date.now() % 100000;

/** 生成唯一身份证号（格式合法即可，服务端只做格式与哈希校验） */
function idCard(seq) {
  return `11010119900101${String(RUN % 100).padStart(2, '0')}${String(seq % 100).padStart(2, '0')}`;
}

async function main() {
  console.log(`\n=== M2 冒烟测试 (${BASE}) ===\n`);

  // ---- 准备：管理端登录 + 库存生成 ----
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

  // 每次运行使用独立的日期区间，避免复用上轮已锁定的库存（库存生成不覆盖已有记录）
  const BASE_DAY = 30 + (RUN % 300);
  const D_MAIN = dayOffset(BASE_DAY); // 主流程
  const D_CANCEL = dayOffset(BASE_DAY + 1); // 取消流程
  const D_CONCURRENT = dayOffset(BASE_DAY + 2); // 并发超卖

  for (const d of [D_MAIN, D_CANCEL]) {
    await api('POST', '/api/admin/stocks/generate', {
      token: adminToken,
      body: { ticketTypeId, startDate: d, endDate: d, total: 100 },
    });
  }
  // 并发测试用 3 个库存，验证不超卖
  await api('POST', '/api/admin/stocks/generate', {
    token: adminToken,
    body: { ticketTypeId, startDate: D_CONCURRENT, endDate: D_CONCURRENT, total: 3 },
  });

  // ---- 1. 小程序登录 ----
  console.log('[1] 小程序登录');
  const login = await api('POST', '/api/mini/auth/login', { body: { code: `smoke_${RUN}` } });
  check('模拟登录成功（未配置 WX_APPID 时走 mock）', !!login.data?.token, JSON.stringify(login.json));
  const token = login.data?.token;
  check('返回 openid', !!login.data?.openid);

  const noAuth = await api('GET', '/api/mini/orders');
  check('未登录访问订单被拒(401)', noAuth.status === 401, `实际 ${noAuth.status}`);

  // ---- 2. 票务查询 ----
  console.log('\n[2] 票务查询');
  const miniAreas = await api('GET', '/api/mini/areas');
  check('景区列表（免登录）', miniAreas.data?.length > 0);

  const miniTickets = await api('GET', `/api/mini/tickets?areaId=${areaId}&date=${D_MAIN}`);
  check('票种列表含当日价格', miniTickets.data?.[0]?.price > 0, JSON.stringify(miniTickets.data?.[0]));
  // 计价单位：客户端据此把「按张卖」的票种标为暂不支持在线预约 ——
  // 下单只有「单价 × 人数」一种计价，按张会被算成错金额
  check(
    '票种带计价单位 saleUnit（person|ticket）',
    miniTickets.data?.length > 0 &&
      miniTickets.data.every((t) => t.saleUnit === 'person' || t.saleUnit === 'ticket'),
    JSON.stringify(miniTickets.data?.map((t) => `${t.name}=${t.saleUnit}`)),
  );

  const stocksBefore = await api('GET', `/api/mini/stocks?ticketTypeId=${ticketTypeId}&date=${D_MAIN}`);
  const availableBefore = stocksBefore.data?.find((s) => s.timeSlotId === slotId)?.available;
  check('分时余票可查', typeof availableBefore === 'number', JSON.stringify(stocksBefore.data?.[0]));

  // ---- 3. 下单 ----
  console.log('\n[3] 下单锁定库存');
  const order1 = await api('POST', '/api/mini/orders', {
    token,
    body: {
      ticketTypeId,
      date: D_MAIN,
      timeSlotId: slotId,
      visitors: [{ name: '冒烟游客A', idCard: idCard(1) }],
    },
  });
  check('下单成功并返回支付参数', !!order1.data?.orderNo && !!order1.data?.payParams?.paySign, JSON.stringify(order1.json));
  check('金额=票种价格×人数', order1.data?.amount === miniTickets.data?.[0]?.price, `amount=${order1.data?.amount}`);
  const orderNo1 = order1.data?.orderNo;
  const orderId1 = order1.data?.orderId;

  const afterOrder = await api('GET', `/api/mini/stocks?ticketTypeId=${ticketTypeId}&date=${D_MAIN}`);
  const availableAfter = afterOrder.data?.find((s) => s.timeSlotId === slotId)?.available;
  check('下单后余票减 1（Redis 预减生效）', availableAfter === availableBefore - 1, `${availableBefore} → ${availableAfter}`);

  const detail1 = await api('GET', `/api/mini/orders/${orderId1}`, { token });
  check('订单详情状态=待支付(10)', detail1.data?.status === 10, `status=${detail1.data?.status}`);
  check('订单详情返回脱敏证件号', /^\d{3}\*+\d{4}$/.test(detail1.data?.items?.[0]?.visitorIdCard ?? ''), detail1.data?.items?.[0]?.visitorIdCard);

  // ---- 4. 支付（幂等）----
  console.log('\n[4] 支付回调幂等');
  const pay1 = await api('POST', `/api/mini/pay/mock-notify?orderNo=${orderNo1}`, { token });
  check('首次支付回调生效', pay1.data?.alreadyHandled === false, JSON.stringify(pay1.json));

  const pay2 = await api('POST', `/api/mini/pay/mock-notify?orderNo=${orderNo1}`, { token });
  check('重复支付回调被幂等忽略', pay2.data?.alreadyHandled === true, JSON.stringify(pay2.json));

  const detailPaid = await api('GET', `/api/mini/orders/${orderId1}`, { token });
  check('订单状态=已支付(20)', detailPaid.data?.status === 20, `status=${detailPaid.data?.status}`);
  check('支付时间已写入', !!detailPaid.data?.payTime);

  const stocksPaid = await api('GET', `/api/mini/stocks?ticketTypeId=${ticketTypeId}&date=${D_MAIN}`);
  const availablePaid = stocksPaid.data?.find((s) => s.timeSlotId === slotId)?.available;
  check('支付后可用量不变（locked→sold）', availablePaid === availableAfter, `${availableAfter} → ${availablePaid}`);

  // ---- 5. 限购 ----
  console.log('\n[5] 每证每日限购');
  const dup = await api('POST', '/api/mini/orders', {
    token,
    body: {
      ticketTypeId,
      date: D_MAIN,
      timeSlotId: slotId,
      visitors: [{ name: '冒烟游客A', idCard: idCard(1) }],
    },
  });
  check('同证件同日重复下单被拒', dup.status === 400, `实际 ${dup.status} ${dup.json?.msg ?? ''}`);

  // ---- 6. 并发下单不超卖 ----
  console.log('\n[6] 并发下单防超卖（库存 3，并发 6）');
  const concurrent = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      api('POST', '/api/mini/orders', {
        token,
        body: {
          ticketTypeId,
          date: D_CONCURRENT,
          timeSlotId: slotId,
          visitors: [{ name: `并发游客${i}`, idCard: idCard(10 + i) }],
        },
      }),
    ),
  );
  const okCount = concurrent.filter((r) => r.status === 201 || r.status === 200).length;
  const rejected = concurrent.filter((r) => r.status === 400).length;
  check(`恰好 3 单成功 / 3 单拒绝（成功 ${okCount}，拒绝 ${rejected}）`, okCount === 3 && rejected === 3);

  const concurrentStocks = await api('GET', `/api/admin/stocks?ticketTypeId=${ticketTypeId}&start=${D_CONCURRENT}&end=${D_CONCURRENT}`, { token: adminToken });
  const row = concurrentStocks.data?.find((s) => s.timeSlotId === slotId);
  check(
    `库存账目自洽：locked=${row?.locked} + sold=${row?.sold} ≤ total=${row?.total}`,
    row && row.locked + row.sold === 3 && row.total === 3,
    JSON.stringify(row),
  );

  // ---- 7. 取消订单释放库存 ----
  console.log('\n[7] 取消订单释放库存');
  const cancelOrder = await api('POST', '/api/mini/orders', {
    token,
    body: {
      ticketTypeId,
      date: D_CANCEL,
      timeSlotId: slotId,
      visitors: [{ name: '待取消游客', idCard: idCard(50) }],
    },
  });
  const cancelStocksBefore = await api('GET', `/api/admin/stocks?ticketTypeId=${ticketTypeId}&start=${D_CANCEL}&end=${D_CANCEL}`, { token: adminToken });
  const lockedBefore = cancelStocksBefore.data?.find((s) => s.timeSlotId === slotId)?.locked;

  const cancelled = await api('POST', `/api/mini/orders/${cancelOrder.data?.orderId}/cancel`, { token });
  check('取消订单成功', cancelled.status === 201 || cancelled.status === 200, JSON.stringify(cancelled.json));

  const cancelStocksAfter = await api('GET', `/api/admin/stocks?ticketTypeId=${ticketTypeId}&start=${D_CANCEL}&end=${D_CANCEL}`, { token: adminToken });
  const lockedAfter = cancelStocksAfter.data?.find((s) => s.timeSlotId === slotId)?.locked;
  check(`取消后锁定库存释放（${lockedBefore} → ${lockedAfter}）`, lockedAfter === lockedBefore - 1);

  const cancelAgain = await api('POST', `/api/mini/orders/${cancelOrder.data?.orderId}/cancel`, { token });
  check('重复取消被拒', cancelAgain.status === 400, `实际 ${cancelAgain.status}`);

  // ---- 8. 退款 ----
  console.log('\n[8] 退款申请与审核');
  const refundApply = await api('POST', `/api/mini/orders/${orderId1}/refund`, {
    token,
    body: { reason: '冒烟测试退款' },
  });
  check('退款申请成功（提前 30 天免手续费）', refundApply.data?.fee === 0, JSON.stringify(refundApply.json));
  const refundId = refundApply.data?.refundId;

  // 申请退款只是**提交申请**：订单状态不变，只多一条待审的退款单。
  // 客户端要靠 refundStatus 才知道「审核中」，否则只会看到「待入园」。
  const appliedDetail = await api('GET', `/api/mini/orders/${orderId1}`, { token });
  check(
    '申请后详情能读到退款状态=待审核(10)，且订单状态本身不变(20)',
    appliedDetail.data?.refund?.status === 10 && appliedDetail.data?.status === 20,
    JSON.stringify({ refund: appliedDetail.data?.refund, status: appliedDetail.data?.status }),
  );
  const appliedList = await api('GET', '/api/mini/orders', { token });
  const appliedRow = appliedList.data?.find((o) => o.id === orderId1);
  check('列表带 refundStatus', appliedRow?.refundStatus === 10, JSON.stringify(appliedRow?.refundStatus));
  check(
    '列表带票种名（原先只有 itemCount，卡片没法说清买的是什么票）',
    !!appliedRow?.ticketName,
    JSON.stringify(appliedRow?.ticketName),
  );

  // 重复申请应被拒（前端据此不再展示「申请退款」）
  const refundAgain = await api('POST', `/api/mini/orders/${orderId1}/refund`, {
    token,
    body: { reason: '重复申请' },
  });
  check('已有待审核申请时重复申请被拒(400)', refundAgain.status === 400, `实际 ${refundAgain.status}`);

  const refundList = await api('GET', '/api/admin/refunds?status=10&pageSize=50', { token: adminToken });
  check('后台可见待审核退款单', refundList.data?.items?.some((r) => r.id === refundId));

  const audit = await api('POST', `/api/admin/refunds/${refundId}/audit`, {
    token: adminToken,
    body: { approve: true, remark: '冒烟测试通过' },
  });
  check('审核通过并完成退款', audit.data?.status === 30, JSON.stringify(audit.json));

  const refundedOrder = await api('GET', `/api/mini/orders/${orderId1}`, { token });
  check('订单状态=已退款(60)', refundedOrder.data?.status === 60, `status=${refundedOrder.data?.status}`);

  const stocksRefunded = await api('GET', `/api/admin/stocks?ticketTypeId=${ticketTypeId}&start=${D_MAIN}&end=${D_MAIN}`, { token: adminToken });
  const refundedRow = stocksRefunded.data?.find((s) => s.timeSlotId === slotId);
  check(
    `退款后库存回流（sold=${refundedRow?.sold}, available=${refundedRow?.available}）`,
    refundedRow?.sold === 0 && refundedRow?.available === refundedRow?.total,
    JSON.stringify(refundedRow),
  );

  const auditAgain = await api('POST', `/api/admin/refunds/${refundId}/audit`, {
    token: adminToken,
    body: { approve: true },
  });
  check('重复审核被拒', auditAgain.status === 400, `实际 ${auditAgain.status}`);

  console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n冒烟测试异常：', err);
  process.exit(1);
});
