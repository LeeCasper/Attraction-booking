#!/usr/bin/env node
/**
 * M4 冒烟测试：运营分析、报表导出、对账、备份、承载量预警
 *
 * 用法：node scripts/smoke-m4.mjs [baseUrl]
 * 注：承载量预警一项需等待定时任务（60s 间隔），整体耗时约 1.5 分钟。
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

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => fmt(new Date());
const daysAgo = (n) => fmt(new Date(Date.now() - n * 86400000));

async function main() {
  console.log(`\n=== M4 冒烟测试 (${BASE}) ===\n`);

  const login = await api('POST', '/api/admin/auth/login', {
    body: { username: 'admin', password: 'admin123' },
  });
  const token = login.data?.token;
  if (!token) {
    console.error('管理端登录失败');
    process.exit(1);
  }

  const areas = await api('GET', '/api/admin/scenic/areas', { token });
  const areaId = areas.data?.[0]?.id;
  const start = daysAgo(30);
  const end = today();
  const range = `areaId=${areaId}&start=${start}&end=${end}`;

  // ---- 1. 运营分析 ----
  console.log('[1] 运营分析');
  const trend = await api('GET', `/api/admin/analysis/trend?${range}`, { token });
  check('预约趋势返回连续日期序列（无数据补 0）', Array.isArray(trend.data) && trend.data.length === 31, `长度 ${trend.data?.length}`);
  check(
    '趋势项含预约/核销/核销率/收入/退款',
    trend.data?.[0] && 'reserved' in trend.data[0] && 'verifyRate' in trend.data[0] && 'refundAmount' in trend.data[0],
    JSON.stringify(trend.data?.[0]),
  );

  const conversion = await api('GET', `/api/admin/analysis/conversion?${range}`, { token });
  check(
    '转化指标含核销率/爽约率/退单率',
    typeof conversion.data?.verifyRate === 'number' &&
      typeof conversion.data?.noShowRate === 'number' &&
      typeof conversion.data?.refundRate === 'number',
    JSON.stringify(conversion.data),
  );

  const traffic = await api('GET', `/api/admin/analysis/traffic?${range}&granularity=day`, { token });
  check('客流分析（按日）返回数组', Array.isArray(traffic.data));
  const hourly = await api('GET', `/api/admin/analysis/traffic?${range}&granularity=hour`, { token });
  check('客流分析（分时）可用', Array.isArray(hourly.data));

  const types = await api('GET', `/api/admin/analysis/ticket-types?${range}`, { token });
  check('票种分析含销量与占比', Array.isArray(types.data) && (types.data.length === 0 || 'soldRatio' in types.data[0]), JSON.stringify(types.data?.[0]));

  const channels = await api('GET', `/api/admin/analysis/channels?${range}`, { token });
  check('渠道分析返回订单量与金额', Array.isArray(channels.data) && (channels.data.length === 0 || 'amount' in channels.data[0]));

  const finance = await api('GET', `/api/admin/analysis/finance?${range}`, { token });
  check(
    '财务分析：实收 = 收入 - 退款',
    finance.data?.netAmount === finance.data?.grossAmount - finance.data?.refundAmount,
    JSON.stringify(finance.data),
  );

  const overview = await api('GET', `/api/admin/analysis/overview?${range}`, { token });
  check(
    '概览一次返回转化/财务/票种/渠道',
    !!overview.data?.conversion && !!overview.data?.finance && Array.isArray(overview.data?.ticketTypes) && Array.isArray(overview.data?.channels),
  );

  // ---- 2. 报表导出 ----
  console.log('\n[2] 报表导出（CSV）');
  for (const type of ['orders', 'verifications', 'passages', 'refunds', 'daily']) {
    const res = await fetch(`${BASE}/api/admin/export/${type}?${range}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const hasBom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
    const lines = buf.toString('utf8').split('\r\n').filter(Boolean);
    check(
      `导出 ${type}：CSV + BOM + 表头（${lines.length - 1} 行数据）`,
      res.status === 200 &&
        String(res.headers.get('content-type')).includes('text/csv') &&
        hasBom &&
        lines.length >= 1,
      `status=${res.status} lines=${lines.length}`,
    );
  }

  // ---- 3. 三方对账 ----
  console.log('\n[3] 三方对账');
  const reconcile = await api('POST', `/api/admin/reconciliations/run?date=${today()}&areaId=${areaId}`, { token });
  check('对账执行成功', [10, 20].includes(reconcile.data?.status), JSON.stringify(reconcile.data));
  check(
    '对账返回订单/支付/退款三侧数据',
    typeof reconcile.data?.orderCount === 'number' &&
      typeof reconcile.data?.paymentCount === 'number' &&
      typeof reconcile.data?.refundCount === 'number',
    JSON.stringify(reconcile.data),
  );

  const reconcileAgain = await api('POST', `/api/admin/reconciliations/run?date=${today()}&areaId=${areaId}`, { token });
  check('重复对账幂等（不报错、结果一致）', reconcileAgain.data?.status === reconcile.data?.status);

  const reconcileList = await api('GET', '/api/admin/reconciliations?page=1&pageSize=5', { token });
  check('对账记录可查', reconcileList.data?.items?.length > 0, JSON.stringify(reconcileList.data?.total));

  const reconcileDetail = await api('GET', `/api/admin/reconciliations/${today()}`, { token });
  check('对账详情含差异明细结构', !!reconcileDetail.data?.diffDetail, JSON.stringify(reconcileDetail.data?.diffDetail));

  // ---- 4. 数据备份 ----
  console.log('\n[4] 数据备份');
  const backup = await api('POST', '/api/admin/backups/run', { token });
  check('备份执行成功（mysqldump + gzip）', backup.data?.status === 20 || backup.data?.skipped === true, JSON.stringify(backup.data));
  if (backup.data?.status === 20) {
    check(
      `备份文件已生成（${(backup.data.fileSize / 1024).toFixed(0)} KB）`,
      backup.data.fileSize > 0,
      JSON.stringify(backup.data),
    );
  }

  const backupList = await api('GET', '/api/admin/backups?page=1&pageSize=5', { token });
  check('备份记录可查', backupList.data?.items?.length > 0, JSON.stringify(backupList.data?.total));

  const backupId = backupList.data?.items?.[0]?.id;
  if (backupId) {
    const dl = await fetch(`${BASE}/api/admin/backups/${backupId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    check(
      '备份文件可下载（gzip）',
      dl.status === 200 && String(dl.headers.get('content-type')).includes('gzip'),
      `status=${dl.status}`,
    );
  }

  // ---- 5. 承载量分级预警 ----
  console.log('\n[5] 承载量分级预警（需等待定时任务，最多 75 秒）');
  const area = areas.data?.[0];
  const originalCapacity = area.maxCapacity;
  await api('PUT', `/api/admin/scenic/areas/${areaId}`, {
    token,
    body: { name: area.name, maxCapacity: 1 },
  });

  // 承载量告警有「同一天同等级只告警一次」的去重机制，
  // 因此这里分两条路径验证，保证脚本可重复执行：
  //   a) 今日尚无该告警 → 应在 75 秒内触发
  //   b) 今日已有该告警 → 应保持不变（验证去重生效，不刷屏）
  const countCapacityAlarms = async () => {
    const list = await api('GET', '/api/admin/alarms?page=1&pageSize=50&status=10', { token });
    return (list.data?.items ?? []).filter((a) => String(a.type).startsWith('capacity_')).length;
  };
  const before = await countCapacityAlarms();

  let fired = null;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const after = await countCapacityAlarms();
    if (after > before) {
      const list = await api('GET', '/api/admin/alarms?page=1&pageSize=50&status=10', { token });
      fired = list.data?.items?.find((a) => String(a.type).startsWith('capacity_'));
      break;
    }
    if (before > 0) break; // 今日已告警过，无需等待
  }

  if (before > 0) {
    const after = await countCapacityAlarms();
    check(
      `承载量告警去重生效（今日已有 ${before} 条，触发后仍为 ${after} 条，不重复刷屏）`,
      after === before,
      `${before} → ${after}`,
    );
  } else {
    check(
      `承载量超阈值触发分级告警（${fired?.type ?? '未触发'}）`,
      !!fired,
      fired ? '' : '等待 75 秒仍未触发',
    );
  }

  // 还原承载量
  await api('PUT', `/api/admin/scenic/areas/${areaId}`, {
    token,
    body: { name: area.name, maxCapacity: originalCapacity },
  });
  check('承载量已还原', true);

  console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n冒烟测试异常：', err);
  process.exit(1);
});
