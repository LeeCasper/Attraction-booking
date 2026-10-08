/**
 * 压测公共库（k6）
 *
 * 与冒烟脚本（scripts/smoke-*.mjs）的分工：
 * - 冒烟脚本验证「功能正确性」，用 Node 直接跑，无需额外依赖
 * - 压测脚本验证「性能与并发正确性」，用 k6 跑（设计文档 §8.1 要求 k6/artillery 脚本随交付）
 *
 * 约定：所有带参数的 URL 都必须打 `name` tag，否则 k6 会按真实 URL 建指标，造成指标基数爆炸。
 */
import http from 'k6/http';
import crypto from 'k6/crypto';

export const BASE = String(__ENV.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');

/** 让 k6 在汇总里输出 p(50)/p(99)，默认只有 avg/min/med/max/p(90)/p(95) */
export const SUMMARY_TREND_STATS = ['avg', 'min', 'med', 'p(50)', 'p(90)', 'p(95)', 'p(99)', 'max'];

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * 把 4xx 视为「预期响应」——本系统的业务拒绝（余票不足/限购/凭证无效）走 HTTP 4xx，
 * 这是正确行为，不该计入 http_req_failed。改造后 http_req_failed 只剩 5xx 与网络错误，
 * 阈值 `rate==0` 才是「零服务端错误」的真断言。
 *
 * 必须在 init 上下文调用（模块顶层）。
 */
export function onlyServerErrorsAreFailures() {
  http.setResponseCallback(http.expectedStatuses({ min: 200, max: 499 }));
}

/** 给拒绝请求打稳定、可读的标签（避免用 400/40000 这类裸码做 tag） */
export function rejectLabel(r) {
  if (r.status >= 500) return 'SERVER_ERROR';
  if (r.status === 400) return 'BIZ_REJECT';
  if (r.status === 403) return 'FORBIDDEN';
  if (r.status === 404) return 'NOT_FOUND';
  if (r.status === 429) return 'RATE_LIMITED';
  return `HTTP_${r.status}`;
}

/** 统一响应体为 {code,msg,data}；code=0 为业务成功 */
export function api(method, path, opts = {}) {
  const headers = Object.assign({}, JSON_HEADERS);
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const res = http.request(method, BASE + path, opts.body === undefined ? null : JSON.stringify(opts.body), {
    headers,
    tags: opts.tags,
  });

  let json = null;
  try {
    json = res.json();
  } catch (e) {
    json = null;
  }

  return {
    status: res.status,
    ok: res.status >= 200 && res.status < 300,
    /** 信封业务码，0 为成功 */
    code: json ? json.code : undefined,
    msg: json ? json.msg : undefined,
    data: json ? json.data : undefined,
    cost: res.timings.duration,
    res,
  };
}

export function adminLogin(username, password) {
  const r = api('POST', '/api/admin/auth/login', {
    body: {
      username: username || __ENV.ADMIN_USER || 'admin',
      password: password || __ENV.ADMIN_PASSWORD || 'admin123',
    },
    tags: { name: 'admin_login' },
  });
  if (!r.data || !r.data.token) {
    throw new Error(`管理端登录失败：HTTP ${r.status} ${r.msg ?? ''}`);
  }
  return r.data.token;
}

export function miniLogin(code) {
  const r = api('POST', '/api/mini/auth/login', {
    body: { code },
    tags: { name: 'mini_login' },
  });
  if (!r.data || !r.data.token) {
    throw new Error(`小程序登录失败：HTTP ${r.status} ${r.msg ?? ''}`);
  }
  return { token: r.data.token, userId: r.data.userId, openid: r.data.openid };
}

// ---------------------------------------------------------------- 日期

const pad = (n, len) => String(n).padStart(len, '0');

export function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}

export function addDays(n) {
  return fmtDate(new Date(Date.now() + n * 86400000));
}

export function today() {
  return fmtDate(new Date());
}

// ---------------------------------------------------------------- 测试数据生成

/** 生成 18 位身份证号（形如 310115xxxxxxxxxxx），仅满足校验正则，不构造真实校验位 */
export function makeIdCard(seed, index) {
  const serial = pad(seed % 100000, 5) + pad(index % 1000000, 6);
  return `310115${serial}${(seed + index) % 10}`;
}

export function makePhone(seed, index) {
  return `19${pad((seed * 7 + index) % 100000000, 8)}${index % 10}`;
}

// ---------------------------------------------------------------- 闸机签名（设计文档 §5.4）

/** HMAC-SHA256(secret, method + path + timestamp + nonce + body) */
export function gateSign(secret, method, path, timestamp, nonce, body) {
  return crypto.hmac('sha256', secret, `${method}${path}${timestamp}${nonce}${body}`, 'hex');
}

/**
 * 带签名调用闸机接口。
 * 注意：签名覆盖原始 body 串，必须自己 JSON.stringify 后原样发出，不能交给 k6 再序列化。
 */
export function gateCall(gateNo, secret, method, path, body, tags) {
  const raw = body === undefined ? '' : JSON.stringify(body);
  const timestamp = String(Date.now());
  const nonce = `${timestamp.toString(36)}${Math.random().toString(36).slice(2, 10)}`;

  const res = http.request(method, BASE + path, raw || null, {
    headers: {
      'Content-Type': 'application/json',
      'X-Gate-No': gateNo,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Signature': gateSign(secret, method, path, timestamp, nonce, raw),
    },
    tags,
  });

  let json = null;
  try {
    json = res.json();
  } catch (e) {
    json = null;
  }

  return {
    status: res.status,
    ok: res.status >= 200 && res.status < 300,
    code: json ? json.code : undefined,
    msg: json ? json.msg : undefined,
    /** 闸机业务结果（ok/code/cmdId/remaining/presence），非统一信封 */
    data: json ? json.data : undefined,
    cost: res.timings.duration,
    res,
  };
}

// ---------------------------------------------------------------- 夹具（前置数据）

export function listAreas(adminToken) {
  const r = api('GET', '/api/admin/scenic/areas', { token: adminToken, tags: { name: 'admin_list_areas' } });
  if (!r.data || r.data.length === 0) throw new Error('未查询到景区，请先执行 npm run seed');
  return r.data;
}

/**
 * 确保存在一个覆盖「当前时刻」的时段（压测专用）。
 *
 * 必要性：verify.service 的时段校验为 [start-60min, end+60min]（§6.4.2），
 * 种子时段 08:00-17:00 在夜间跑压测会全部判 WRONG_SLOT，因此核验类压测
 * 必须有一条全天时段兜底。按时段名幂等复用，不重复创建。
 */
export function ensureAnytimeSlot(adminToken, areaId) {
  const SLOT_NAME = '压测专用 00:00-23:59';
  const list = api('GET', `/api/admin/time-slots?areaId=${areaId}`, {
    token: adminToken,
    tags: { name: 'admin_list_slots' },
  });
  const existing = (list.data ?? []).find((s) => s.name === SLOT_NAME);
  if (existing) return existing.id;

  const created = api('POST', '/api/admin/time-slots', {
    token: adminToken,
    tags: { name: 'admin_create_slot' },
    body: { scenicAreaId: areaId, name: SLOT_NAME, startTime: '00:00', endTime: '23:59', sortOrder: 99 },
  });
  if (!created.data) throw new Error(`创建压测时段失败：HTTP ${created.status} ${created.msg ?? ''}`);
  return created.data.id ?? created.data;
}

/**
 * 建一套独立的压测夹具：新票种 + 指定日期的分时库存。
 * 每次压测都用「新票种」，从而拿到干净、总量精确的库存行 —— 这是可重复执行的关键
 * （generate 不覆盖已有库存，复用旧票种会带上历史 sold/locked 干扰断言）。
 */
export function createStockFixture(adminToken, opts) {
  const { areaId, name, total, date } = opts;

  const type = api('POST', '/api/admin/ticket-types', {
    token: adminToken,
    tags: { name: 'admin_create_ticket_type' },
    body: {
      scenicAreaId: areaId,
      name,
      audience: '压测',
      basePrice: 6000,
      needRealname: 1,
      remark: 'loadtest fixture（可随时清理）',
      purchaseRule: { perUserPerOrder: 10, perUserPerDay: 100, perIdcardPerDay: 1 },
    },
  });
  if (!type.data || !type.data.id) throw new Error(`创建压测票种失败：HTTP ${type.status} ${type.msg ?? ''}`);
  const ticketTypeId = type.data.id;

  const gen = api('POST', '/api/admin/stocks/generate', {
    token: adminToken,
    tags: { name: 'admin_generate_stock' },
    body: { ticketTypeId, startDate: date, endDate: date, total },
  });
  if (!gen.data) throw new Error(`生成库存失败：HTTP ${gen.status} ${gen.msg ?? ''}`);

  const rows = listStock(adminToken, ticketTypeId, date);
  if (rows.length === 0) throw new Error('库存生成后查询为空');

  return { ticketTypeId, date, rows };
}

/** 查库存行（含 sold/locked/available） */
export function listStock(adminToken, ticketTypeId, date) {
  const r = api('GET', `/api/admin/stocks?ticketTypeId=${ticketTypeId}&start=${date}&end=${date}`, {
    token: adminToken,
    tags: { name: 'admin_list_stock' },
  });
  return r.data ?? [];
}

export function stockRowOf(rows, timeSlotId) {
  const row = rows.find((r) => Number(r.timeSlotId) === Number(timeSlotId));
  if (!row) throw new Error(`未找到时段 ${timeSlotId} 的库存行`);
  return row;
}

/**
 * 批量调用（分片并发）。setup 阶段造数据用，避免串行发上百个请求拖长前置时间。
 * calls: [{ method, path, token?, body?, tags? }]
 */
export function apiBatch(calls, chunkSize = 50) {
  const out = [];
  for (let i = 0; i < calls.length; i += chunkSize) {
    const chunk = calls.slice(i, i + chunkSize).map((c) => {
      const headers = Object.assign({}, JSON_HEADERS);
      if (c.token) headers.Authorization = `Bearer ${c.token}`;
      return {
        method: c.method,
        url: BASE + c.path,
        body: c.body === undefined ? null : JSON.stringify(c.body),
        params: { headers, tags: c.tags },
      };
    });

    for (const res of http.batch(chunk)) {
      let json = null;
      try {
        json = res.json();
      } catch (e) {
        json = null;
      }
      out.push({
        status: res.status,
        ok: res.status >= 200 && res.status < 300,
        code: json ? json.code : undefined,
        msg: json ? json.msg : undefined,
        data: json ? json.data : undefined,
        cost: res.timings.duration,
      });
    }
  }
  return out;
}

/** 批量登录小程序用户（分片并发，避免一次性打爆登录接口） */
export function batchMiniLogin(runSeed, count, chunkSize = 50) {
  const calls = [];
  for (let i = 0; i < count; i++) {
    calls.push({
      method: 'POST',
      path: '/api/mini/auth/login',
      body: { code: `loadtest-${runSeed}-${i}` },
      tags: { name: 'mini_login' },
    });
  }
  return apiBatch(calls, chunkSize).map((r, i) => {
    if (!r.data || !r.data.token) throw new Error(`批量登录失败（第 ${i} 个）：HTTP ${r.status}`);
    return r.data.token;
  });
}

// ---------------------------------------------------------------- 汇总输出

export function stat(data, metric, key) {
  const m = data.metrics[metric];
  if (!m || !m.values) return undefined;
  return m.values[key];
}

export function ms(v) {
  return v === undefined ? '—' : `${v.toFixed(1)}ms`;
}

export function num(v) {
  return v === undefined ? '—' : String(v);
}

/** 打印一张 KPI 对照表；未达标项标 ✗ */
export function kpiTable(rows) {
  const labelWidth = Math.max(...rows.map((r) => r.label.length), 10);
  const lines = [];
  for (const r of rows) {
    const mark = r.pass === undefined ? '  ' : r.pass ? '✓ ' : '✗ ';
    const actual = String(r.actual).padStart(12);
    lines.push(`  ${mark}${r.label.padEnd(labelWidth)}${actual}   目标 ${r.target}`);
  }
  return lines.join('\n');
}

/** 计算失败请求的构成（按 name tag 分类）——只看错误率不够，要看清是「业务拒绝」还是「服务端错误」 */
export function failureBreakdown(data, names) {
  const lines = [];
  for (const name of names) {
    const failed = stat(data, `http_req_failed{name:${name}}`, 'rate');
    const total = stat(data, `http_reqs{name:${name}}`, 'count');
    if (total === undefined) continue;
    const rate = failed === undefined ? 0 : failed * 100;
    lines.push(`  ${name.padEnd(26)} 请求 ${String(total).padStart(6)}   失败率 ${rate.toFixed(2)}%`);
  }
  return lines.join('\n');
}
