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

/** 运行标识：保证每次运行建的景区名唯一 */
const RUN = Date.now() % 100000;

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
  // ⚠️ 只断言「非空」，**不要写 `>= 4`**：那 4 个是种子给示例景区的，而时段是运营能在后台随手
  // 增删的用户数据 —— 实测把首个景区换成真实景区（只留一个「全天场」）后这条就红了，
  // 报的是「时段不够」，看着像功能坏了。冒烟要状态无关（见 CLAUDE.md 的「常用命令」那段）。
  const slotCount = detail.json?.data?.availableSlots?.length ?? 0;
  check(`票种详情含可用时段（${slotCount} 个）`, slotCount >= 1);

  const slots = await api('GET', `/api/admin/time-slots?areaId=${areaId}`, { token });
  check('时段列表可用', slots.json?.data?.length >= 1, `实际 ${slots.json?.data?.length}`);

  // 3. 库存
  console.log('\n[3] 库存生成与调整');
  const preStock = await api('GET', `/api/admin/stocks?ticketTypeId=${typeId}&start=${start}&end=${end}`, { token });
  const preCount = preStock.json?.data?.length ?? 0;

  const gen = await api('POST', '/api/admin/stocks/generate', {
    token,
    body: { ticketTypeId: typeId, startDate: start, endDate: end, total: 100 },
  });
  // 断言「生成后每个（日期 × 时段）都有且仅有一行」。
  //
  // 原来断言的是 `created % 7 === 0`（新增行数是天数的整数倍）—— 那依赖「跑之前库里恰好缺哪些行」：
  // 冒烟脚本自己会造时段，时段集合一变、或某个日期只缺部分时段，这条就假失败。
  // 实测撞到过（24/25），状态收敛后自己又好了。
  // 区间天数：两端都用同一种解析（带时间 → 本地），差值不受时区影响
  const days = Math.round((new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000) + 1;
  check(
    `批量生成库存（${days} 天 × ${slotCount} 时段，本次新增 ${gen.json?.data?.created} 条）`,
    (gen.json?.data?.created ?? 0) >= 0,
    JSON.stringify(gen.json?.data),
  );
  const stocked = await api('GET', `/api/admin/stocks?ticketTypeId=${typeId}&start=${start}&end=${end}`, { token });
  const stockRows = stocked.json?.data ?? [];
  const stockKeys = new Set(stockRows.map((r) => `${r.date}#${r.timeSlotId}`));
  check(
    `日期区间内每个（日期 × 时段）恰好一行（${stockRows.length} 行 / 无重复）`,
    stockRows.length === days * slotCount && stockKeys.size === stockRows.length,
    JSON.stringify({ rows: stockRows.length, expect: days * slotCount, unique: stockKeys.size }),
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

  // 7. 景点一览（小程序「景点选择与预约」页的数据源）
  console.log('\n[7] 景点一览接口');
  const overview = await api('GET', '/api/mini/areas/overview');
  check('免登录可读（该页在小程序启动后即打开，不保证已登录）', overview.status === 200, overview.status);
  const ovAreas = overview.json?.data?.areas ?? [];
  check('返回景点列表', ovAreas.length > 0, ovAreas.length);
  const ov = ovAreas.find((a) => a.id === areaId) ?? ovAreas[0];
  check('每项带分类字段（可为 null）', 'category' in ov, ov);
  check('每项带今日余票', typeof ov.remaining === 'number', ov.remaining);
  check('每项带在园情况', typeof ov.presence?.capacityRate === 'number', ov.presence);
  check('每项带是否有启用时段', typeof ov.hasSlots === 'boolean', ov.hasSlots);

  // 起价口径：只看**在线可售**（按人计价）的票种 —— 按张卖的年卡进不了购票流程
  const ovTickets = await api('GET', `/api/mini/tickets?areaId=${ov.id}&date=${start}`);
  const sellable = (ovTickets.json?.data ?? []).filter((t) => t.saleUnit === 'person').map((t) => t.price);
  check(
    'minPrice = 可售票种里的最低价',
    sellable.length > 0 && ov.minPrice === Math.min(...sellable),
    { minPrice: ov.minPrice, sellable },
  );

  // 汇总口径必须与后台看板「全部景区」（不传 areaId）一致：Σ在园 / Σ容量
  const dash = await api('GET', '/api/admin/dashboard/realtime', { token });
  const sum = overview.json?.data?.summary;
  check(
    'summary 容量 = 各开放景点容量之和',
    sum?.maxCapacity === dash.json?.data?.maxCapacity,
    { summary: sum?.maxCapacity, dashboard: dash.json?.data?.maxCapacity },
  );
  check(
    'summary 在园 = 各开放景点在园之和',
    sum?.current === dash.json?.data?.presence,
    { summary: sum?.current, dashboard: dash.json?.data?.presence },
  );

  // 分类能写能读（后台配了分类，小程序端才筛得出来）
  const CATEGORY = 'nature';
  const catArea = await api('POST', '/api/admin/scenic/areas', {
    token,
    body: { name: `冒烟分类景区${RUN}`, maxCapacity: 100, category: CATEGORY },
  });
  const catId = catArea.json?.data?.id;
  check('新建景区可带分类', !!catId, catArea.json);
  const afterCreate = await api('GET', '/api/mini/areas/overview');
  check(
    '分类能从接口读回',
    afterCreate.json?.data?.areas?.find((a) => a.id === catId)?.category === CATEGORY,
    afterCreate.json?.data?.areas?.find((a) => a.id === catId),
  );
  const badCategory = await api('POST', '/api/admin/scenic/areas', {
    token,
    body: { name: `冒烟非法分类${RUN}`, maxCapacity: 100, category: 'not-a-category' },
  });
  check('非法分类被拒(400)', badCategory.status === 400, badCategory.status);

  // ---- 图片上传（景区封面）----
  console.log('\n[9] 图片上传与读取');
  {
    // 1×1 PNG
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const form = new FormData();
    form.append('file', new Blob([png], { type: 'image/png' }), 'cover.png');
    const up = await fetch(`${BASE}/api/admin/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const upJson = await up.json();
    const url = upJson?.data?.url;
    check('上传图片返回相对路径', up.status === 201 && /^\/uploads\/[a-f0-9]{16}\.png$/.test(url ?? ''), JSON.stringify(upJson));

    if (url) {
      const back = await fetch(`${BASE}/api${url}`);
      const buf = Buffer.from(await back.arrayBuffer());
      check(
        '按相对路径能读回同一张图（免登录）',
        back.status === 200 && back.headers.get('content-type') === 'image/png' && buf.length === png.length,
        `status=${back.status} bytes=${buf.length}`,
      );

      // 传给景区，再从小程序接口读回来（三张图的链路端到端）。
      // 景区有三张图：封面（列表卡/推荐卡）、轮播图（首页）、缩略图（购票页头卡）——
      // 三处画幅不同，所以拆成三个字段；**都不传也能跑**（客户端逐级回落，见 utils/area.ts）。
      const withCover = await api('POST', '/api/admin/scenic/areas', {
        token,
        body: { name: `冒烟封面景区${RUN}`, maxCapacity: 100, coverUrl: url, bannerUrl: url, thumbnailUrl: url },
      });
      const coverId = withCover.json?.data?.id;
      const overview = await api('GET', '/api/mini/areas/overview');
      const row = overview.json?.data?.areas?.find((a) => a.id === coverId);
      check('封面能存进景区并从小程序接口读回', row?.coverUrl === url, JSON.stringify(row));
      check(
        '轮播图 / 缩略图也能存进景区并从小程序接口读回',
        row?.bannerUrl === url && row?.thumbnailUrl === url,
        JSON.stringify({ bannerUrl: row?.bannerUrl, thumbnailUrl: row?.thumbnailUrl }),
      );
      // 只传封面时另两张应为 null —— 回落到封面这件事在**客户端**做（`utils/area.ts`），
      // 服务端不替它补值：补了就看不出「运营到底配了几张」
      const onlyCover = await api('POST', '/api/admin/scenic/areas', {
        token,
        body: { name: `冒烟仅封面景区${RUN}`, maxCapacity: 100, coverUrl: url },
      });
      const onlyCoverRow = (await api('GET', '/api/mini/areas')).json?.data?.find((a) => a.id === onlyCover.json?.data?.id);
      check(
        '只传封面时轮播图/缩略图为 null（回落由客户端做）',
        onlyCoverRow?.coverUrl === url && onlyCoverRow?.bannerUrl === null && onlyCoverRow?.thumbnailUrl === null,
        JSON.stringify(onlyCoverRow),
      );
      if (onlyCover.json?.data?.id) await api('DELETE', `/api/admin/scenic/areas/${onlyCover.json.data.id}`, { token });
      if (coverId) await api('DELETE', `/api/admin/scenic/areas/${coverId}`, { token });
    }

    // 类型白名单
    const badForm = new FormData();
    badForm.append('file', new Blob([Buffer.from('not an image')], { type: 'text/plain' }), 'a.txt');
    const bad = await fetch(`${BASE}/api/admin/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: badForm,
    });
    check('非图片类型被拒(400)', bad.status === 400, bad.status);

    // 路径穿越必须被挡住（文件名白名单卡死形状，越级无从谈起）
    for (const evil of ['..%2f.env', '%2e%2e%2f.env']) {
      const r = await fetch(`${BASE}/api/uploads/${evil}`);
      check(`路径穿越被拒（${evil}）`, r.status === 404, r.status);
    }
  }

  // ---- 删除景区的「引用保护」----
  // init.sql 一条外键都没有（刻意不用 FK），所以硬删景区不级联：闸机会核不了单、
  // 订单会变成「按景区看不到、但总额里还算着」的孤儿。这里断言「有引用就拒」，
  // 并且**引用清空后必须还能删**（否则运营再也没法删掉建错的景区）。
  console.log('\n[10] 删除景区的引用保护');
  {
    const area = await api('POST', '/api/admin/scenic/areas', {
      token,
      body: { name: `冒烟待删景区${RUN}`, maxCapacity: 50 },
    });
    const delAreaId = area.json?.data?.id;
    check('新建一个干净景区（不带默认时段/票种）', !!delAreaId, JSON.stringify(area.json));

    const fresh = await api('DELETE', `/api/admin/scenic/areas/${delAreaId}`, { token });
    check('没有任何引用时能删掉（不误伤）', fresh.status === 200 || fresh.status === 201, `${fresh.status} ${fresh.json?.msg}`);

    const area2 = await api('POST', '/api/admin/scenic/areas', {
      token,
      body: { name: `冒烟待删景区B${RUN}`, maxCapacity: 50 },
    });
    const delAreaId2 = area2.json?.data?.id;
    const type = await api('POST', '/api/admin/ticket-types', {
      token,
      body: { scenicAreaId: delAreaId2, name: `冒烟待删票种${RUN}`, basePrice: 1000, saleUnit: 'person' },
    });
    const delTypeId = type.json?.data?.id;
    check('给它挂一个票种', !!delTypeId, JSON.stringify(type.json));

    const blocked = await api('DELETE', `/api/admin/scenic/areas/${delAreaId2}`, { token });
    check('有票种引用时删除被拒(409)', blocked.status === 409, `${blocked.status} ${blocked.json?.msg}`);
    check(
      '拒绝时说明了原因与替代做法',
      /票种/.test(blocked.json?.msg ?? '') && /关闭/.test(blocked.json?.msg ?? ''),
      blocked.json?.msg,
    );

    // 收尾：清掉引用后应当能删
    await api('DELETE', `/api/admin/ticket-types/${delTypeId}`, { token });
    const removed = await api('DELETE', `/api/admin/scenic/areas/${delAreaId2}`, { token });
    check('引用清空后可以删掉', removed.status === 200 || removed.status === 201, `${removed.status} ${removed.json?.msg}`);
  }

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
