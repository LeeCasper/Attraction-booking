#!/usr/bin/env node
/**
 * 公告（提示公告 / 弹窗公告）冒烟 —— PRD A-002 公告管理、技术方案 §3.2 的 `/api/mini/announcements`。
 *
 * 覆盖：
 *   1. 管理端扁平列表 + 三种范围筛选（全部 / 只看全平台 / 某个景点）
 *   2. 新建：提示公告与弹窗公告两种类型、按景点与全平台两种归属
 *   3. **生效区间**：`startAt` 在未来的不返回、`endAt` 已过的不返回（小程序端）
 *   4. **`status=2` 下架**后小程序端不返回、管理端仍在
 *   5. `sort` 排序（`tips`/`popups` 各自按 sort 升序）
 *   6. 小程序端 `tips` / `popups` **分桶正确**
 *   7. **全平台公告在任意景点下都能看到**；不带 `scenicAreaId` 时只返回全平台
 *   8. 清空类字段（`imageUrl` / `endAt` / `scenicAreaId`）**传 null 真的清掉**（不是被忽略）
 *   9. 小程序端**匿名可达**（不带 token）
 *  10. 删除
 *
 * 用法：node scripts/smoke-announcement.mjs [baseUrl]
 *
 * 可重复执行：自己建、`finally` 里按 id 删干净；所有断言只认「本次建的那几条 id」，
 * 不依赖库里既有的公告（种子在本机插过两条挂在已删景点上的公告，不能拿它当基线）。
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

/** 运行标识：标题带它，断言只认自己建的这几条 */
const RUN = Date.now() % 100000;

/** 业务时区的「现在」加减天数 —— 与小程序端/服务端同一把尺子（都按本地墙上时间比） */
function shiftDays(days) {
  const d = new Date(Date.now() + days * 86400_000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

async function main() {
  console.log(`\n=== 公告冒烟 RUN=${RUN} → ${BASE} ===`);

  const admin = await api('POST', '/api/admin/auth/login', {
    body: { username: 'admin', password: 'admin123' },
  });
  const adminToken = admin.data?.token;
  if (!adminToken) {
    console.error('管理端登录失败，无法继续：', admin.json);
    process.exit(1);
  }

  // 找一个真实存在的景点（小程序端要按它查）
  const areas = await api('GET', '/api/admin/scenic/areas', { token: adminToken });
  const area = (areas.data ?? [])[0];
  if (!area) {
    console.error('库里一个景区都没有，无法继续');
    process.exit(1);
  }

  const created = [];
  const create = async (body) => {
    const r = await api('POST', '/api/admin/scenic/announcements', { token: adminToken, body });
    if (r.data?.id) created.push(r.data.id);
    return r;
  };

  try {
    // ---- 1. 建四种组合 ----
    console.log('\n[1] 新建（类型 × 归属）');
    const tipPlatform = await create({
      type: 1,
      title: `冒烟提示-全平台-${RUN}`,
      content: '全平台可见',
      sort: 10,
    });
    const tipArea = await create({
      type: 1,
      scenicAreaId: area.id,
      title: `冒烟提示-按景点-${RUN}`,
      sort: 20,
    });
    const popupArea = await create({
      type: 2,
      scenicAreaId: area.id,
      title: `冒烟弹窗-按景点-${RUN}`,
      content: '弹窗正文',
      imageUrl: '/uploads/smoke-not-exist.jpg',
      linkType: 1,
      sort: 10,
      startAt: shiftDays(-1),
      endAt: shiftDays(7),
    });
    const tipFuture = await create({
      type: 1,
      title: `冒烟提示-未生效-${RUN}`,
      startAt: shiftDays(3),
    });
    const tipExpired = await create({
      type: 1,
      title: `冒烟提示-已过期-${RUN}`,
      endAt: shiftDays(-1),
    });
    check('五条都建成功', created.length === 5, `实际 ${created.length}`);

    // ---- 2. 管理端列表与三态筛选 ----
    console.log('\n[2] 管理端列表（范围三态）');
    const all = await api('GET', '/api/admin/scenic/announcements', { token: adminToken });
    const ids = (all.data ?? []).map((a) => Number(a.id));
    check('不带筛选 = 能列出本次建的五条', created.every((id) => ids.includes(id)), `缺少 ${created.filter((i) => !ids.includes(i))}`);

    const platformOnly = await api('GET', '/api/admin/scenic/announcements?scope=platform', { token: adminToken });
    const platformIds = (platformOnly.data ?? []).map((a) => Number(a.id));
    check(
      'scope=platform 只回全平台的（本次那两条）',
      platformIds.includes(Number(tipPlatform.data.id)) && !platformIds.includes(Number(tipArea.data.id)),
      platformIds,
    );

    const byArea = await api('GET', `/api/admin/scenic/announcements?scope=scenic&scenicAreaId=${area.id}`, {
      token: adminToken,
    });
    const byAreaIds = (byArea.data ?? []).map((a) => Number(a.id));
    check(
      'scope=scenic 只回该景点的（不含全平台）',
      byAreaIds.includes(Number(tipArea.data.id)) && !byAreaIds.includes(Number(tipPlatform.data.id)),
      byAreaIds,
    );

    // ---- 3. 小程序端：生效过滤 + 分桶 + 范围 ----
    console.log('\n[3] 小程序端（生效过滤 / 分桶 / 范围）');
    const mini = await api('GET', `/api/mini/announcements?scenicAreaId=${area.id}`);
    check('匿名可达（不带 token 也 200）', mini.status === 200, `实际 ${mini.status}`);
    const tipIds = (mini.data?.tips ?? []).map((t) => Number(t.id));
    const popupIds = (mini.data?.popups ?? []).map((p) => Number(p.id));
    check('全平台提示公告可见', tipIds.includes(Number(tipPlatform.data.id)), tipIds);
    check('按景点的提示公告可见', tipIds.includes(Number(tipArea.data.id)), tipIds);
    check('弹窗公告进 popups 桶（不在 tips 里）', popupIds.includes(Number(popupArea.data.id)) && !tipIds.includes(Number(popupArea.data.id)), { tipIds, popupIds });
    check('**未生效**（startAt 在未来）的不返回', !tipIds.includes(Number(tipFuture.data.id)), tipIds);
    check('**已过期**（endAt 在过去）的不返回', !tipIds.includes(Number(tipExpired.data.id)), tipIds);
    check(
      'tips 按 sort 升序（10 的那条在前）',
      tipIds.indexOf(Number(tipPlatform.data.id)) < tipIds.indexOf(Number(tipArea.data.id)),
      tipIds,
    );
    check('归该景点的公告带 areaName', (mini.data?.popups ?? []).find((p) => Number(p.id) === Number(popupArea.data.id))?.areaName === area.name);
    check('全平台公告 areaName 为 null', (mini.data?.tips ?? []).find((t) => Number(t.id) === Number(tipPlatform.data.id))?.areaName === null);

    const platformMini = await api('GET', '/api/mini/announcements');
    const pIds = (platformMini.data?.tips ?? []).map((t) => Number(t.id));
    check(
      '不带 scenicAreaId = 只要全平台',
      pIds.includes(Number(tipPlatform.data.id)) && !pIds.includes(Number(tipArea.data.id)),
      pIds,
    );

    // ---- 4. 下架后小程序端消失、管理端仍在 ----
    console.log('\n[4] 上下架');
    await api('PUT', `/api/admin/scenic/announcements/${tipPlatform.data.id}`, {
      token: adminToken,
      body: { status: 2 },
    });
    const afterOff = await api('GET', '/api/mini/announcements');
    check(
      '下架后小程序端不返回',
      !(afterOff.data?.tips ?? []).some((t) => Number(t.id) === Number(tipPlatform.data.id)),
      afterOff.data?.tips,
    );
    const stillInAdmin = await api('GET', '/api/admin/scenic/announcements?scope=platform', { token: adminToken });
    check(
      '下架后管理端仍能看到（「已发布」只是没手动下架）',
      (stillInAdmin.data ?? []).some((a) => Number(a.id) === Number(tipPlatform.data.id)),
    );

    // ---- 5. 清空类字段必须传 null 才真的清 ----
    console.log('\n[5] 清空语义（null vs 省略）');
    await api('PUT', `/api/admin/scenic/announcements/${popupArea.data.id}`, {
      token: adminToken,
      body: { imageUrl: null, endAt: null, scenicAreaId: null },
    });
    const cleared = (await api('GET', '/api/admin/scenic/announcements', { token: adminToken })).data?.find(
      (a) => Number(a.id) === Number(popupArea.data.id),
    );
    check('imageUrl 传 null 真的清空', cleared?.imageUrl === null, cleared?.imageUrl);
    check('endAt 传 null 真的清空（变成长期有效）', cleared?.endAt === null, cleared?.endAt);
    check('scenicAreaId 传 null 变成全平台', cleared?.scenicAreaId === null, cleared?.scenicAreaId);
    const afterClear = await api('GET', '/api/mini/announcements');
    check(
      '清空后它变成全平台公告：不带 areaId 也能查到',
      (afterClear.data?.popups ?? []).some((p) => Number(p.id) === Number(popupArea.data.id)),
      afterClear.data?.popups,
    );

    // ---- 6. 删除 ----
    console.log('\n[6] 删除');
    const del = await api('DELETE', `/api/admin/scenic/announcements/${tipArea.data.id}`, { token: adminToken });
    check('删除成功', del.status === 200 || del.status === 204, `实际 ${del.status}`);
    const afterDel = await api('GET', `/api/mini/announcements?scenicAreaId=${area.id}`);
    check(
      '删掉的不再返回',
      !(afterDel.data?.tips ?? []).some((t) => Number(t.id) === Number(tipArea.data.id)),
    );

    console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===\n`);
  } finally {
    // 无论成败都把本次建的删干净（可重复执行的底线）
    for (const id of created) {
      await api('DELETE', `/api/admin/scenic/announcements/${id}`, { token: adminToken }).catch(() => {});
    }
    console.log(`（已清理本次建的 ${created.length} 条公告）`);
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n冒烟测试异常：', err);
  process.exit(1);
});
