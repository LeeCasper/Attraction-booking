#!/usr/bin/env node
/**
 * M1 冒烟测试：认证 → RBAC → 景区 → 票种 → 库存生成/调整 → 操作日志
 * 用法：node scripts/smoke-test.mjs [baseUrl]
 * 零依赖，直接打真实接口。
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
  return { status: res.status, json };
}

const today = new Date();
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const start = fmt(today);
const end = fmt(new Date(today.getTime() + 6 * 86400000));

async function main() {
  console.log(`\n=== M1 冒烟测试 (${BASE}) ===\n`);

  // 1. 认证
  console.log('[1] 认证');
  const badLogin = await api('POST', '/api/admin/auth/login', { body: { username: 'admin', password: 'wrong-password' } });
  check('错误密码被拒绝', badLogin.status === 401, `实际 ${badLogin.status}`);

  const login = await api('POST', '/api/admin/auth/login', { body: { username: 'admin', password: 'admin123' } });
  check('超管登录成功', login.status === 201 && !!login.json?.data?.token, JSON.stringify(login.json));
  const token = login.json?.data?.token;
  check('返回权限含通配符 *', login.json?.data?.permissions?.includes('*'), JSON.stringify(login.json?.data?.permissions));

  const noToken = await api('GET', '/api/admin/scenic/areas');
  check('未带 token 访问被拒(401)', noToken.status === 401, `实际 ${noToken.status}`);

  const profile = await api('GET', '/api/admin/auth/profile', { token });
  check('获取个人信息成功', profile.status === 200 && profile.json?.data?.username === 'admin');

  // 2. 景区/票种
  console.log('\n[2] 景区与票种');
  const areas = await api('GET', '/api/admin/scenic/areas', { token });
  check('景区列表可用', areas.status === 200 && areas.json?.data?.length > 0);
  const areaId = areas.json?.data?.[0]?.id;
  console.log(`     景区: ${areas.json?.data?.[0]?.name} (id=${areaId})`);

  const types = await api('GET', `/api/admin/ticket-types?areaId=${areaId}`, { token });
  check('票种列表可用', types.status === 200 && types.json?.data?.length > 0);
  const typeId = types.json?.data?.[0]?.id;
  console.log(`     票种: ${types.json?.data?.[0]?.name} (id=${typeId}, 价格 ${types.json?.data?.[0]?.basePrice} 分)`);

  const detail = await api('GET', `/api/admin/ticket-types/${typeId}`, { token });
  check('票种详情含限购规则', detail.json?.data?.purchaseRule?.perUserPerOrder === 4, JSON.stringify(detail.json?.data?.purchaseRule));
  const slotCount = detail.json?.data?.availableSlots?.length ?? 0;
  check(`票种详情含可用时段（${slotCount} 个）`, slotCount >= 4);

  const slots = await api('GET', `/api/admin/time-slots?areaId=${areaId}`, { token });
  check('时段列表可用', slots.json?.data?.length >= 4, `实际 ${slots.json?.data?.length}`);

  // 3. 库存
  console.log('\n[3] 库存生成与调整');
  const preStock = await api('GET', `/api/admin/stocks?ticketTypeId=${typeId}&start=${start}&end=${end}`, { token });
  const preCount = preStock.json?.data?.length ?? 0;

  const gen = await api('POST', '/api/admin/stocks/generate', {
    token,
    body: { ticketTypeId: typeId, startDate: start, endDate: end, total: 100 },
  });
  check(
    `批量生成库存（7 天 × ${slotCount} 时段，新增 ${gen.json?.data?.created} 条）`,
    (gen.json?.data?.created ?? 0) % 7 === 0,
    JSON.stringify(gen.json?.data),
  );

  const genAgain = await api('POST', '/api/admin/stocks/generate', {
    token,
    body: { ticketTypeId: typeId, startDate: start, endDate: end, total: 100 },
  });
  check('重复生成不覆盖已有库存(幂等)', genAgain.json?.data?.created === 0, JSON.stringify(genAgain.json?.data));

  const stocks = await api('GET', `/api/admin/stocks?ticketTypeId=${typeId}&start=${start}&end=${end}`, { token });
  const stockList = stocks.json?.data ?? [];
  check(
    `库存查询返回 7 天 × ${slotCount} 时段 = ${slotCount * 7} 条`,
    stockList.length === slotCount * 7,
    `实际 ${stockList.length}`,
  );
  check(
    '库存剩余量自洽(total-sold-locked)且含时段名',
    stockList[0]?.available === stockList[0]?.total - stockList[0]?.sold - stockList[0]?.locked && !!stockList[0]?.slotName,
    JSON.stringify(stockList[0]),
  );

  const stockId = stockList[0]?.id;
  const before = stockList[0]?.total ?? 0;
  const adjust = await api('PUT', `/api/admin/stocks/${stockId}/adjust`, {
    token,
    body: { changeValue: 50, remark: '冒烟测试加库存' },
  });
  check(`加库存成功(${before}→${before + 50})`, adjust.json?.data?.total === before + 50, JSON.stringify(adjust.json?.data));

  const minus = await api('PUT', `/api/admin/stocks/${stockId}/adjust`, {
    token,
    body: { changeValue: -(before + 50 + 1000), remark: '冒烟测试负数校验' },
  });
  check('库存调整不得低于已售+锁定(拒绝)', minus.status === 400, `实际 ${minus.status}`);

  // 还原库存，保证脚本可重复执行
  await api('PUT', `/api/admin/stocks/${stockId}/adjust`, {
    token,
    body: { changeValue: -50, remark: '冒烟测试还原库存' },
  });

  // 4. 价格日历
  console.log('\n[4] 价格日历');
  const priceSet = await api('PUT', '/api/admin/price-calendar', {
    token,
    body: { ticketTypeId: typeId, date: start, price: 8000 },
  });
  check('设置节假日价成功', priceSet.status === 200);
  const priceGet = await api('GET', `/api/admin/price-calendar?ticketTypeId=${typeId}&start=${start}&end=${end}`, { token });
  check('价格日历回读 80 元', priceGet.json?.data?.[0]?.price === 8000, JSON.stringify(priceGet.json?.data));
  await api('DELETE', `/api/admin/price-calendar/${typeId}/${start}`, { token });

  // 5. RBAC 权限隔离
  console.log('\n[5] RBAC 权限隔离');
  const checkerName = `checker_smoke_${Date.now().toString().slice(-6)}`;
  const created = await api('POST', '/api/admin/admin-users', {
    token,
    body: { username: checkerName, password: 'checker123', realName: '冒烟检票员', roleIds: [3] },
  });
  check('创建检票员账号成功', created.status === 201, JSON.stringify(created.json));

  const checkerLogin = await api('POST', '/api/admin/auth/login', { body: { username: checkerName, password: 'checker123' } });
  const checkerToken = checkerLogin.json?.data?.token;
  check('检票员登录成功且权限不含 *', !!checkerToken && !checkerLogin.json?.data?.permissions?.includes('*'));

  const checkerStock = await api('GET', `/api/admin/stocks?ticketTypeId=${typeId}&start=${start}&end=${end}`, { token: checkerToken });
  check('检票员无 stock:read 权限被拒(403)', checkerStock.status === 403, `实际 ${checkerStock.status}`);

  const checkerAdjust = await api('PUT', `/api/admin/stocks/${stockId}/adjust`, {
    token: checkerToken,
    body: { changeValue: 1, remark: '越权尝试' },
  });
  check('检票员调整库存被拒(403)', checkerAdjust.status === 403, `实际 ${checkerAdjust.status}`);

  // 6. 操作日志
  console.log('\n[6] 操作日志');
  const logs = await api('GET', '/api/admin/logs/operations?pageSize=50', { token });
  const actions = (logs.json?.data?.items ?? []).map((l) => l.action);
  check('日志记录了库存生成', actions.includes('stock:generate'), actions.join(','));
  check('日志记录了库存调整', actions.includes('stock:adjust'));
  check('日志记录了登录', actions.includes('login'));

  // 清理
  const userId = created.json?.data?.id;
  if (userId) await api('DELETE', `/api/admin/admin-users/${userId}`, { token });

  console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n冒烟测试异常：', err);
  process.exit(1);
});
