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
 *   7. 首页天气：关闭/没配/配错**一律返回 `null` 且接口不 500**（它是可选依赖），
 *      上游解析是纯函数（打样本断言，不依赖公网与真实 key）；
 *      另有 3 条**上游相关**的断言需要把 `WEATHER_API_BASE` 指向本机再启动服务
 *      （那样脚本能自己起一个 stub 当上游），没配就**打印原因跳过**，不静默
 *
 * 用法：`npm run smoke:config`（需要 ts-node，与 seed 同款：`--transpile-only`）
 * 可重复执行：脚本自己创建票种/景区/出行人，所有被改过的配置在结束前还原。
 */
import { createServer } from 'node:http';
import { config as loadEnv } from 'dotenv';
import { businessToday, addDaysStr } from '../src/common/utils/date.util';
import { buildCapacityLevels } from '../src/common/utils/capacity.util';
import { categoryOf, parseAmap, parseQweather } from '../src/modules/system/weather.parse';
import {
  DEFAULT_CAPACITY_ALARM,
  DEFAULT_REFUND_RULE,
  DEFAULT_RESERVATION,
  DEFAULT_WEATHER_CONFIG,
} from '../src/common/constants/config-defaults';

// 天气那 3 条上游断言要读 `WEATHER_API_BASE`，值就在服务端用的这份 `.env` 里
// （照 seed.ts 的做法自己 load，省得在命令行上再传一遍、也不会与服务进程看到的值不一致）
loadEnv();

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
  for (const k of ['platform', 'reservation', 'capacity_alarm', 'refund', 'weather']) {
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

  // ---- 7. 首页天气 ----
  console.log('\n[7] 首页天气');
  const weatherRow = (await api('GET', '/api/admin/configs', { token: adminToken })).data?.find(
    (c: any) => c.configKey === 'weather',
  )?.configValue;
  const originalWeather = weatherRow ?? DEFAULT_WEATHER_CONFIG;
  const putWeather = (value: object) =>
    api('PUT', '/api/admin/configs/weather', { token: adminToken, body: { configValue: value } });
  const miniSettings = async () => api('GET', '/api/mini/platform/settings');

  try {
    // (1) 关闭：字段**必须在**、值是 null —— 客户端就是靠「键在 + 值为 null」决定不渲染那一行的
    await putWeather({ ...DEFAULT_WEATHER_CONFIG, provider: 'off' });
    const offRes = await miniSettings();
    check(
      '关闭时 weather 字段仍在且为 null（客户端靠它决定不显示，而不是靠字段缺失）',
      offRes.status === 200 && offRes.data && 'weather' in offRes.data && offRes.data.weather === null,
      { status: offRes.status, weather: offRes.data?.weather },
    );

    // (2) 配置读写往返（provider/location/cacheMinutes 三项都要真的存进去）
    await putWeather({ provider: 'qweather', location: '113.60,33.00', cacheMinutes: 5 });
    const saved = (await api('GET', '/api/admin/configs', { token: adminToken })).data?.find(
      (c: any) => c.configKey === 'weather',
    )?.configValue;
    check(
      'weather 配置读写往返',
      saved?.provider === 'qweather' && saved?.location === '113.60,33.00' && saved?.cacheMinutes === 5,
      saved,
    );

    // (3) 数据源填了不认识的值：**不许抛**（抛了整个 platform/settings 就 500，首页顶栏跟着塌）
    await putWeather({ provider: 'nope', location: '113.60,33.00', cacheMinutes: 5 });
    const badRes = await miniSettings();
    check(
      '数据源不认识 → weather=null 且接口仍 200（可选依赖不许把首屏接口打挂）',
      badRes.status === 200 && badRes.json?.code === 0 && badRes.data?.weather === null,
      { status: badRes.status, code: badRes.json?.code, weather: badRes.data?.weather },
    );

    // (4) 数据源选对了但地点空着 → 同样是 null（这条不会去打上游）
    await putWeather({ provider: 'qweather', location: '', cacheMinutes: 5 });
    const noLoc = await miniSettings();
    check('选了数据源但没填地点 → weather=null', noLoc.data?.weather === null, noLoc.data?.weather);
  } finally {
    // 无论成败都还原（同 [3]/[5] 的规矩：冒烟不许留下改过的配置）
    await putWeather(originalWeather);
  }

  // ---- 7b. 上游解析与类别映射（纯函数，离线可跑）----
  // 上游返回体的形状差异全在 weather.parse.ts 里收口，所以这里打样本比打公网值当：
  // 不依赖 key、不消耗额度、也不会因为上游改文案而红。
  const qOk = parseQweather({ code: '200', now: { text: '晴', temp: '21' } });
  check(
    '和风样本 → 归一化（原文 + 温度 + 类别）',
    qOk?.text === '晴' && qOk?.temp === 21 && qOk?.category === 'sunny',
    qOk,
  );
  check('和风上游报错码（key 无效/额度用尽）→ null', parseQweather({ code: '401', now: {} }) === null);
  check('温度离谱值（上游改了口径）→ null，不把脏值渲染给游客', parseQweather({ code: '200', now: { text: '晴', temp: '999' } }) === null);

  const aOk = parseAmap({ status: '1', lives: [{ weather: '雷阵雨', temperature: '26' }] });
  check(
    '高德样本 → 归一化（雷阵雨落在 thunder 而不是 rain）',
    aOk?.text === '雷阵雨' && aOk?.temp === 26 && aOk?.category === 'thunder',
    aOk,
  );
  check('高德 status != 1 → null', parseAmap({ status: '0', info: 'INVALID_USER_KEY', lives: [] }) === null);

  // 类别映射用**一张全等表**钉死：新加天气文案时如果落错桶，这条会立刻指出是哪个词
  const CATEGORY_CASES: [string, string][] = [
    ['晴', 'sunny'],
    ['多云', 'cloudy'],
    ['阴', 'overcast'],
    ['小雨', 'rain'],
    ['雷阵雨', 'thunder'],
    ['雨夹雪', 'snow'],
    ['小雪', 'snow'],
    ['雾', 'fog'],
    ['霾', 'fog'],
    ['浮尘', 'fog'],
    ['冰雹', 'unknown'],
    ['', 'unknown'],
  ];
  const mismatched = CATEGORY_CASES.filter(([text, want]) => categoryOf(text) !== want).map(
    ([text, want]) => `${text}→${categoryOf(text)}(期望 ${want})`,
  );
  check('天气文案 → 类别映射整表一致（含「不认识就 unknown」）', mismatched.length === 0, mismatched);

  // ---- 7c. 上游联通与缓存（需要自己起 stub：见文件头的用法说明）----
  // `WEATHER_API_BASE` 从**服务端那份 .env** 读（与 seed 同款：脚本自己 load dotenv），
  // 这样脚本里的判断与服务进程看到的是同一个值，不用在命令行上再传一遍。
  // ⚠️ **密钥也得有**：`WeatherService` 在「选了数据源但没配 key」时会直接返回 null、根本不打上游，
  //    所以少配一个的话这 3 条会以「上游没答」的形式失败 —— 卡在门口而不是卡在上游，
  //    判据里把这一点说清楚（下面那句跳过原因就是这么来的）。
  const apiBase = process.env.WEATHER_API_BASE ?? '';
  const stubPort = /^https?:\/\/(127\.0\.0\.1|localhost):(\d+)/.exec(apiBase)?.[2];
  const stubKey = (process.env.QWEATHER_KEY ?? '').trim();
  if (!stubPort || !stubKey) {
    console.log(
      `  ⊘ 跳过 3 条上游断言：${!stubPort ? 'WEATHER_API_BASE 没指向本机' : 'QWEATHER_KEY 是空的'}；\n` +
        '    要跑全：在 server/.env 里设 WEATHER_API_BASE=http://127.0.0.1:<端口> 与一个非空的\n' +
        '    QWEATHER_KEY，重启服务，再执行 npm run smoke:config',
    );
  } else {
    // stub 就是「一家上游」：按 mode 决定答什么，并记命中次数
    let mode: 'ok' | 'fail' = 'ok';
    let hits = 0;
    const stub = createServer((req, res) => {
      hits++;
      if (mode === 'fail') {
        res.writeHead(500).end('upstream boom');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      // 和风与高德各答各的形状
      res.end(
        req.url?.includes('/v3/weather/')
          ? JSON.stringify({ status: '1', lives: [{ weather: '小雨', temperature: '18' }] })
          : JSON.stringify({ code: '200', now: { text: '小雨', temp: '18' } }),
      );
    });
    await new Promise<void>((resolve) => stub.listen(Number(stubPort), '127.0.0.1', resolve));

    try {
      // (a) 换一个**新的地点** = 新的缓存 key，保证这次一定回源
      await putWeather({ provider: 'qweather', location: `113.${RUN % 90 + 10},33.00`, cacheMinutes: 5 });
      const liveHitsBefore = hits;
      const live = await miniSettings();
      check(
        '上游可用 → 真实拉到并归一化（走的是 fetch + 缓存那条路，不是纯函数）',
        live.data?.weather?.text === '小雨' &&
          live.data?.weather?.temp === 18 &&
          live.data?.weather?.category === 'rain' &&
          hits > liveHitsBefore,
        { weather: live.data?.weather, hits: hits - liveHitsBefore },
      );

      // (b) 再取一次（同 location）→ 命中缓存，不该再打上游
      const afterFirst = hits;
      const cached = await miniSettings();
      check(
        '同一地点再取 → 命中缓存，上游命中数不增加',
        cached.data?.weather?.text === '小雨' && hits === afterFirst,
        { weather: cached.data?.weather, 上游新增命中: hits - afterFirst },
      );

      // (c) 上游挂掉（500）+ 新地点 → null 且接口仍 200；紧接着再取一次不该重试（60 秒负缓存）
      mode = 'fail';
      await putWeather({ provider: 'qweather', location: `113.${(RUN % 90) + 11},33.00`, cacheMinutes: 5 });
      const boom = await miniSettings();
      const afterBoom = hits;
      const boomAgain = await miniSettings();
      check(
        '上游 500 → weather=null 且接口仍 200；60 秒负缓存内不再重试',
        boom.status === 200 && boom.data?.weather === null && boomAgain.data?.weather === null && hits === afterBoom,
        { status: boom.status, weather: boom.data?.weather, 复取时上游新增命中: hits - afterBoom },
      );
    } finally {
      stub.close();
      await putWeather(originalWeather);
    }
  }

  console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('冒烟脚本异常：', err);
  process.exit(1);
});
