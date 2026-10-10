/**
 * 参数配置（`sys_config`）与「新建景区一键生成默认时段/票种/库存」的冒烟测试。
 *
 * 为什么单独一个脚本：这一轮之前，`sys_config` 里的几行配置**没有任何读取者** ——
 * 后台能改、改完存进库，但退款费率、承载量阈值、支付超时全都读的是别的地方
 * （票种自身的 refundRule / 硬编码常量 / `.env`）。那种「改了不生效」光看代码看不出来，
 * 必须有一条断言真的去改配置、再去跑业务、比对结果。
 *
 * 覆盖：
 *   1. 平台信息端点免登录可达（小程序顶栏读的就是它）
 *   2. 参数配置读写往返
 *   3. 退款手续费**真的**按 `sys_config.refund` 走（用一个不带自身规则的票种，排除覆盖干扰）
 *   4. 承载量阈值 → 等级表的纯函数映射
 *   5. 支付超时**真的**按 `sys_config.reservation.payTimeoutMinutes` 走
 *   6. 一键生成默认时段/票种/库存，且**第二次调用是幂等的**
 *
 * 用法：`npm run smoke:config`（需要 ts-node，与 seed 同款：`--transpile-only`）
 * 可重复执行：脚本自己创建票种/景区/出行人，所有被改过的配置在结束前还原。
 */
import { businessToday, addDaysStr } from '../src/common/utils/date.util';
import { buildCapacityLevels } from '../src/common/utils/capacity.util';
import {
  DEFAULT_CAPACITY_ALARM,
  DEFAULT_REFUND_RULE,
  DEFAULT_RESERVATION,
} from '../src/common/constants/config-defaults';

const BASE = process.argv[2] ?? 'http://localhost:3000';

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail === undefined ? '' : ` → ${JSON.stringify(detail)}`}`);
  }
}

interface ApiResult {
  status: number;
  json: any;
  data: any;
}

async function api(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<ApiResult> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* 空响应 */
  }
  return { status: res.status, json, data: json?.data };
}

/** 运行标识：保证每次运行的证件号 / 票种名 / 景区名唯一，脚本可重复跑 */
const RUN = Date.now() % 100000;

function idCard(seq: number) {
  return `11010119900101${String(RUN % 100).padStart(2, '0')}${String(seq % 100).padStart(2, '0')}`;
}

const TODAY = businessToday();
const TOMORROW = addDaysStr(TODAY, 1);

async function main() {
  console.log(`\n=== 参数配置冒烟测试 (${BASE}) ===\n`);

  const adminLogin = await api('POST', '/api/admin/auth/login', {
    body: { username: 'admin', password: 'admin123' },
  });
  const adminToken: string | undefined = adminLogin.data?.token;
  if (!adminToken) {
    console.error('管理端登录失败，无法继续：', JSON.stringify(adminLogin.json));
    process.exit(1);
  }

  // ---- 1. 平台信息端点（免登录）----
  console.log('[1] 平台信息端点');
  const platform = await api('GET', '/api/mini/platform/settings');
  check('不带 token 也能读（小程序启动时还没登录）', platform.status === 200, `实际 ${platform.status}`);
  check('返回平台名称', typeof platform.data?.name === 'string' && platform.data.name.length > 0, platform.data);
  check('返回版本号', !!platform.data?.version, platform.data);

  // 后台改平台名 → 小程序端点跟着变（这就是「平台信息可在后台修改」的闭环）
  const originalPlatform = (await api('GET', '/api/admin/configs', { token: adminToken })).data?.find(
    (c: any) => c.configKey === 'platform',
  )?.configValue;
  const newPlatformName = `冒烟平台${RUN}`;
  await api('PUT', '/api/admin/configs/platform', {
    token: adminToken,
    body: { configValue: { ...(originalPlatform ?? {}), name: newPlatformName } },
  });
  const platformAfter = await api('GET', '/api/mini/platform/settings');
  check(
    '后台改名后小程序端点同步',
    platformAfter.data?.name === newPlatformName,
    { expect: newPlatformName, actual: platformAfter.data?.name },
  );
  // 还原（拿原始值整体写回，避免多留一个「冒烟平台」）
  await api('PUT', '/api/admin/configs/platform', {
    token: adminToken,
    body: { configValue: originalPlatform ?? {} },
  });

  // ---- 2. 配置读写往返 ----
  console.log('\n[2] 参数配置读写往返');
  const configs = await api('GET', '/api/admin/configs', { token: adminToken });
  const keys = (configs.data ?? []).map((c: any) => c.configKey);
  for (const k of ['platform', 'reservation', 'capacity_alarm', 'refund']) {
    check(`配置项 ${k} 存在`, keys.includes(k), keys);
  }
  check(
    '承载量阈值已是数值三档（不再是 warn80/90/100 布尔开关）',
    configs.data?.find((c: any) => c.configKey === 'capacity_alarm')?.configValue?.critical !== undefined,
    configs.data?.find((c: any) => c.configKey === 'capacity_alarm')?.configValue,
  );

  const originalRefund = configs.data?.find((c: any) => c.configKey === 'refund')?.configValue ?? DEFAULT_REFUND_RULE;
  const originalReservation =
    configs.data?.find((c: any) => c.configKey === 'reservation')?.configValue ?? DEFAULT_RESERVATION;

  try {
    // ---- 3. 退款手续费真的按配置走 ----
    console.log('\n[3] 退款费率来自 sys_config（用一个不带自身规则的票种，排除「票种覆盖」的干扰）');
    const areaId = (await api('GET', '/api/admin/scenic/areas', { token: adminToken })).data?.[0]?.id;

    // 票种的 refund_rule 会**逐字段覆盖**全局配置；要单独验证全局生效，
    // 必须用一个自身没写 refundRule 的票种 —— 种子那三个票种都自带 feeRate:0.2，
    // 拿它们去测「改全局费率」永远看不到变化（这正是最容易被误判为通过的情形）。
    const newType = await api('POST', '/api/admin/ticket-types', {
      token: adminToken,
      body: { scenicAreaId: areaId, name: `冒烟配置票种${RUN}`, basePrice: 10000 },
    });
    const smokeTypeId = newType.data?.id;
    check('已创建冒烟票种', !!smokeTypeId, newType.json);

    await api('POST', '/api/admin/stocks/generate', {
      token: adminToken,
      body: { ticketTypeId: smokeTypeId, startDate: TODAY, endDate: TODAY, total: 50 },
    });

    const slotId = (await api('GET', `/api/admin/time-slots?areaId=${areaId}`, { token: adminToken })).data?.[0]?.id;

    const miniLogin = await api('POST', '/api/mini/auth/login', { body: { code: `smoke_config_${RUN}` } });
    const token = miniLogin.data?.token;
    check('小程序登录成功', !!token);

    const order = await api('POST', '/api/mini/orders', {
      token,
      body: {
        ticketTypeId: smokeTypeId,
        date: TODAY,
        timeSlotId: slotId,
        visitors: [{ name: '冒烟配置游客', idCard: idCard(1) }],
      },
    });
    const orderId = order.data?.orderId;
    const amount = order.data?.amount;
    check('下单成功（今日票）', !!orderId && amount === 10000, order.json);

    const paid = await api('POST', `/api/mini/pay/mock-notify?orderNo=${order.data?.orderNo}`, { token });
    // 注意别按 200 判：NestJS 的 POST 默认返回 201，这里看响应体的业务 code 更稳
    check('模拟支付成功', paid.json?.code === 0 && !!paid.data?.orderId, { status: paid.status, json: paid.json });

    // 改成 25%，且 beforeDay=1 保证「今天申请」落在收费窗口里（0 < 1）
    await api('PUT', '/api/admin/configs/refund', {
      token: adminToken,
      body: { configValue: { beforeDay: 1, feeRate: 0.25, expiredNoRefund: true } },
    });

    const refund = await api('POST', `/api/mini/orders/${orderId}/refund`, {
      token,
      body: { reason: '冒烟：验证全局退改规则生效' },
    });
    check(
      '手续费按 sys_config 的 feeRate 计算',
      refund.data?.fee === Math.round(amount * 0.25),
      { expect: Math.round(amount * 0.25), actual: refund.data?.fee, json: refund.json },
    );

    // ---- 5. 支付超时来自 sys_config ----
    console.log('\n[5] 支付超时来自 sys_config');
    await api('PUT', '/api/admin/configs/reservation', {
      token: adminToken,
      body: { configValue: { ...originalReservation, payTimeoutMinutes: 30 } },
    });
    const before = Date.now();
    const order2 = await api('POST', '/api/mini/orders', {
      token,
      body: {
        ticketTypeId: smokeTypeId,
        date: TODAY,
        timeSlotId: slotId,
        visitors: [{ name: '冒烟超时游客', idCard: idCard(2) }],
      },
    });
    const deadlineDeltaMin = (new Date(order2.data?.payDeadline).getTime() - before) / 60000;
    check(
      'payDeadline ≈ 30 分钟后（不再是写死的 15）',
      deadlineDeltaMin > 29 && deadlineDeltaMin < 31,
      { deltaMin: Number(deadlineDeltaMin.toFixed(2)), payDeadline: order2.data?.payDeadline },
    );
    if (order2.data?.orderId) {
      await api('POST', `/api/mini/orders/${order2.data.orderId}/cancel`, { token });
    }
  } finally {
    // 无论成败都还原配置，保证脚本可重复执行、也不影响其它冒烟
    await api('PUT', '/api/admin/configs/refund', { token: adminToken, body: { configValue: originalRefund } });
    await api('PUT', '/api/admin/configs/reservation', {
      token: adminToken,
      body: { configValue: originalReservation },
    });
  }

  // ---- 4. 承载量阈值 → 等级表映射（纯函数，不依赖在园人数）----
  console.log('\n[4] 承载量阈值 → 等级表映射');
  const levels = buildCapacityLevels({ warn: 0.5, serious: 0.6, critical: 0.7 });
  check(
    '等级表按「高等级在前」排列（任务命中即 break，顺序决定报哪一档）',
    levels.map((l) => l.rate).join(',') === '0.7,0.6,0.5',
    levels.map((l) => l.rate),
  );
  check(
    '缺字段时用默认阈值兜底',
    buildCapacityLevels({}).map((l) => l.rate).join(',') ===
      `${DEFAULT_CAPACITY_ALARM.critical},${DEFAULT_CAPACITY_ALARM.serious},${DEFAULT_CAPACITY_ALARM.warn}`,
    buildCapacityLevels({}).map((l) => l.rate),
  );

  // ---- 6. 新建景区一键生成默认时段/票种/库存 ----
  console.log('\n[6] 新建景区一键生成默认时段/票种/库存');
  const created = await api('POST', '/api/admin/scenic/areas', {
    token: adminToken,
    body: {
      name: `冒烟默认景区${RUN}`,
      maxCapacity: 1000,
      generateDefaults: true,
      defaultStockDays: 2,
      defaultSlotStock: 7,
    },
  });
  const areaId = created.data?.id;
  const defaults = created.data?.defaults;
  check('景区创建成功', !!areaId, created.json);
  check('生成 4 个时段', defaults?.slots === 4, defaults);
  check('生成 3 个票种', defaults?.ticketTypes === 3, defaults);
  // 2 天 × 4 时段 × 2 个按人计价票种 = 16（按张卖的年卡不分时入园，不生成库存）
  check('生成 2×4×2 = 16 条分时库存', defaults?.stockCreated === 16, defaults);
  check('库存那一步没有报错', !defaults?.error, defaults?.error);

  const areaSlots = await api('GET', `/api/admin/time-slots?areaId=${areaId}`, { token: adminToken });
  check('时段数实查为 4', areaSlots.data?.length === 4, areaSlots.data?.length);

  const areaTypes = await api('GET', `/api/admin/ticket-types?areaId=${areaId}`, { token: adminToken });
  check('票种数实查为 3', areaTypes.data?.length === 3, areaTypes.data?.length);
  check(
    '家庭年卡是按张卖（saleUnit=ticket）—— 否则会被按人数计价、静默多收钱',
    areaTypes.data?.some((t: any) => t.saleUnit === 'ticket'),
    areaTypes.data?.map((t: any) => `${t.name}:${t.saleUnit}`),
  );

  const personTypes = (areaTypes.data ?? []).filter((t: any) => t.saleUnit === 'person');
  let stockRows = 0;
  for (const t of personTypes) {
    const stocks = await api(
      'GET',
      `/api/admin/stocks?ticketTypeId=${t.id}&start=${TODAY}&end=${TOMORROW}`,
      { token: adminToken },
    );
    stockRows += stocks.data?.length ?? 0;
    check(
      `票种「${t.name}」每天 4 个时段 × 2 天都有库存`,
      stocks.data?.length === 8,
      stocks.data?.length,
    );
  }
  check('按人计价票种共 2 个', personTypes.length === 2, personTypes.map((t: any) => t.name));

  // 幂等：再调一次不该重复建
  const again = await api('POST', `/api/admin/scenic/areas/${areaId}/defaults`, {
    token: adminToken,
    body: { defaultStockDays: 2, defaultSlotStock: 7 },
  });
  check('重跑 generateDefaults 幂等：新建库存为 0', again.data?.stockCreated === 0, again.data);
  check('重跑后时段数仍为 4', again.data?.slots === 4, again.data);
  check('重跑后票种数仍为 3', again.data?.ticketTypes === 3, again.data);

  console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('冒烟脚本异常：', err);
  process.exit(1);
});
