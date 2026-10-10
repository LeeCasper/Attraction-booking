/**
 * 种子数据：角色、权限、超管账号、示例景区/时段/票种/限购规则。
 * 幂等：可重复执行，已存在则跳过/更新。
 * 运行：npm run seed
 */
import 'reflect-metadata';
import { config } from 'dotenv';
config();

import * as bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
// 默认时段/票种/限购/退改规则：与后台「新建景区一键生成」共用同一份，避免两边漂移
import {
  DEFAULT_PURCHASE_RULE,
  DEFAULT_TICKET_REFUND_RULE,
  DEFAULT_TICKET_TYPES,
  DEFAULT_TIME_SLOTS,
} from '../src/common/constants/scenic-defaults';
import { DEFAULT_PLATFORM_SETTINGS } from '../src/common/constants/platform-defaults';
import {
  DEFAULT_CAPACITY_ALARM,
  DEFAULT_REFUND_RULE,
  DEFAULT_RESERVATION,
} from '../src/common/constants/config-defaults';

const ROLES: { code: string; name: string; remark: string; permissions: string[] }[] = [
  { code: 'super', name: '超级管理员', remark: '内置角色，拥有全部权限', permissions: ['*'] },
  {
    code: 'admin',
    name: '景区管理员',
    remark: '票种、库存、订单、核销、设备、内容管理',
    permissions: [
      'scenic:read', 'scenic:create', 'scenic:update', 'scenic:delete',
      'ticket:read', 'ticket:create', 'ticket:update', 'ticket:delete',
      'stock:read', 'stock:update',
      'order:read', 'order:refund_audit', 'verify:execute', 'reconcile:run',
      'gate:read', 'gate:control', 'config:read', 'log:read',
    ],
  },
  {
    code: 'checker',
    name: '检票员',
    remark: '现场核销',
    permissions: ['order:read', 'verify:execute'],
  },
  {
    code: 'finance',
    name: '财务',
    remark: '对账、退款审核、报表',
    permissions: ['order:read', 'order:refund_audit', 'reconcile:run', 'config:read', 'log:read', 'stats:read'],
  },
  {
    code: 'ops',
    name: '运维',
    remark: '闸机监控与远程控制',
    permissions: ['gate:read', 'gate:control', 'reconcile:run', 'log:read', 'stats:read'],
  },
  { code: 'leader', name: '领导', remark: '数据看板、经营分析', permissions: ['stats:read'] },
];

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_DATABASE ?? 'attraction_booking',
    charset: 'utf8mb4',
  });

  // ---- 角色 + 权限 ----
  for (const role of ROLES) {
    const [existing]: any[] = await conn.query(
      'SELECT id FROM role WHERE code = ? LIMIT 1',
      [role.code],
    );
    let roleId: number;
    if (existing.length > 0) {
      roleId = Number(existing[0].id);
      await conn.query('UPDATE role SET name=?, remark=?, status=1 WHERE id=?', [role.name, role.remark, roleId]);
    } else {
      const [res]: any = await conn.query('INSERT INTO role (name, code, remark) VALUES (?,?,?)', [
        role.name, role.code, role.remark,
      ]);
      roleId = Number(res.insertId);
    }
    for (const perm of role.permissions) {
      await conn.query(
        'INSERT IGNORE INTO role_permission (role_id, permission) VALUES (?,?)',
        [roleId, perm],
      );
    }
  }
  console.log('✓ 角色/权限已就绪');

  // ---- 超管账号 admin/admin123 ----
  const hash = await bcrypt.hash('admin123', 10);
  const [superRole]: any[] = await conn.query("SELECT id FROM role WHERE code='super' LIMIT 1");
  const [admins]: any[] = await conn.query('SELECT id FROM admin_user WHERE username=? LIMIT 1', ['admin']);
  if (admins.length === 0) {
    const [res]: any = await conn.query(
      'INSERT INTO admin_user (username, password, real_name, status) VALUES (?,?,?,1)',
      ['admin', hash, '超级管理员'],
    );
    await conn.query('INSERT IGNORE INTO admin_role (admin_id, role_id) VALUES (?,?)', [
      Number(res.insertId), Number(superRole[0].id),
    ]);
    console.log('✓ 已创建超管账号 admin / admin123（请尽快修改密码）');
  } else {
    await conn.query('UPDATE admin_user SET password=?, pwd_fail_count=0, pwd_locked_until=NULL WHERE username=?', [hash, 'admin']);
    await conn.query('INSERT IGNORE INTO admin_role (admin_id, role_id) VALUES (?,?)', [
      Number(admins[0].id), Number(superRole[0].id),
    ]);
    console.log('✓ 超管账号已存在，密码已重置为 admin123');
  }

  // ---- 示例景区 ----
  const [areas]: any[] = await conn.query('SELECT id FROM scenic_area LIMIT 1');
  if (areas.length === 0) {
    const [res]: any = await conn.query(
      `INSERT INTO scenic_area (name, address, intro, open_time, max_capacity, category, status)
       VALUES ('示例山景区', '某某市某某区风景路 1 号', '示例景区，M1 联调用', '08:00-17:00', 50000, 'main', 1)`,
    );
    const areaId = Number(res.insertId);

    // 时段
    const slotIds: number[] = [];
    for (const [i, s] of DEFAULT_TIME_SLOTS.entries()) {
      const [r]: any = await conn.query(
        'INSERT INTO time_slot (scenic_area_id, name, start_time, end_time, sort_order, status) VALUES (?,?,?,?,?,1)',
        [areaId, s.name, s.startTime, s.endTime, i],
      );
      slotIds.push(Number(r.insertId));
    }
    console.log(`✓ 已创建示例景区与 ${DEFAULT_TIME_SLOTS.length} 个时段`);

    // 票种 —— 默认值与后台「新建景区一键生成」共用 `DEFAULT_TICKET_TYPES`，避免两边漂移
    for (const t of DEFAULT_TICKET_TYPES) {
      const [ins]: any = await conn.query(
        `INSERT INTO ticket_type (scenic_area_id, name, audience, base_price, sale_unit, refund_rule, need_realname, status, remark)
         VALUES (?, ?, ?, ?, ?, ?, 1, 1, '示例票种')`,
        [areaId, t.name, t.audience, t.basePrice, t.saleUnit, JSON.stringify(DEFAULT_TICKET_REFUND_RULE)],
      );
      await conn.query(
        `INSERT INTO purchase_rule (ticket_type_id, per_user_per_order, per_user_per_day, per_idcard_per_day)
         VALUES (?, ?, ?, ?)`,
        [
          Number(ins.insertId),
          DEFAULT_PURCHASE_RULE.perUserPerOrder,
          DEFAULT_PURCHASE_RULE.perUserPerDay,
          DEFAULT_PURCHASE_RULE.perIdcardPerDay,
        ],
      );
    }
    console.log(`✓ 已创建 ${DEFAULT_TICKET_TYPES.length} 个示例票种（成人全票 120 / 优待票 60 / 家庭年卡 388）与限购规则`);

    // 公告 —— 小程序首页的公告条直接读它（`GET /api/mini/areas/:id` 的 announcements）
    await conn.query(
      `INSERT INTO announcement (scenic_area_id, title, content, status, published_at)
       VALUES (?, '入园分时预约须知', '请持有效身份证件有序核验入园', 1, NOW())`,
      [areaId],
    );
    console.log('✓ 已创建示例公告「入园分时预约须知」');
    console.log(`\n提示：可用 POST /api/admin/stocks/generate 为未来日期生成分时库存`);
  } else {
    // 老库里示例景区没有分类（`category` 是后加的列）—— 只给**种子里那个**示例景区补，
    // 条件里带 `category IS NULL`，所以管理员自己改过分类就不会被覆盖
    const [fixed]: any = await conn.query(
      "UPDATE scenic_area SET category='main' WHERE name='示例山景区' AND category IS NULL",
    );
    console.log(
      fixed.affectedRows
        ? '✓ 已存在景区数据，并为示例山景区补上分类'
        : '✓ 已存在景区数据，跳过示例数据',
    );
  }

  // ---- 示例闸机（供 gate-simulator 联调）----
  const [gateArea]: any[] = await conn.query('SELECT id FROM scenic_area LIMIT 1');
  if (gateArea.length > 0) {
    const areaId = Number(gateArea[0].id);
    const gates: [string, string, number, string][] = [
      // gate_no, 名称, direction(1入/2出/3双向), 密钥
      ['GATE001', '1号入口闸机', 1, 'dev-gate-secret-change-me'],
      ['GATE002', '1号出口闸机', 2, 'dev-gate-secret-change-me'],
    ];
    for (const [gateNo, name, direction, secret] of gates) {
      await conn.query(
        `INSERT INTO gate_device (scenic_area_id, gate_no, name, location, ip, protocol, direction, status, secret_key)
         VALUES (?,?,?,?,?,?,?,2,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), direction=VALUES(direction), secret_key=VALUES(secret_key)`,
        [areaId, gateNo, name, '示例景区入口', '127.0.0.1', 'http', direction, secret],
      );
    }
    console.log('✓ 示例闸机已就绪（GATE001 入口 / GATE002 出口，密钥 dev-gate-secret-change-me）');
  }

  // ---- 参数配置 ----
  // 这四行的 `config_value` 现在**真的会被读取**（`SysConfigService`）：
  //   reservation    → 下单时的支付超时（order.service.ts）
  //   capacity_alarm → 承载量分级告警阈值（jobs/stats.job.ts）
  //   refund         → 退款手续费全局兜底，票种自身规则按字段覆盖（pay.service.ts）
  //   platform       → 小程序顶栏品牌/联系方式（GET /api/mini/platform/settings）
  const configs: [string, object, string][] = [
    ['reservation', DEFAULT_RESERVATION, '预约规则：支付超时时间'],
    ['capacity_alarm', DEFAULT_CAPACITY_ALARM, '承载量分级预警阈值(在园率)'],
    ['refund', DEFAULT_REFUND_RULE, '全局退改规则(票种可覆盖)'],
    ['platform', DEFAULT_PLATFORM_SETTINGS, '平台信息(名称/联系方式/版本)'],
  ];
  for (const [key, value, remark] of configs) {
    await conn.query(
      'INSERT INTO sys_config (config_key, config_value, remark) VALUES (?,?,?) ON DUPLICATE KEY UPDATE remark=VALUES(remark)',
      [key, JSON.stringify(value), remark],
    );
  }

  // ---- 旧形状配置的一次性归一 ----
  // 上面的 upsert 是 `ON DUPLICATE KEY UPDATE remark=...`，**故意不覆盖 config_value**
  // —— 改成覆盖的话每次重跑种子都会冲掉管理员改过的值。
  // 但旧形状留在库里就等于「改了不生效」，所以这里做一次性迁移：
  //   capacity_alarm 原本是布尔开关 {warn80,warn90,warn100}，阈值却是硬编码在任务里的
  //   refund         原本是 {beforeDayFeeRate,sameDayFeeRate}，与退款代码实际读的
  //                  ticket_type.refund_rule（{beforeDay,feeRate}）**根本不是一套键名**
  // 守卫条件是「旧键存在」，所以跑第二遍不再命中，也不会碰已经是新形状的值。
  const migrations: { key: string; legacyPath: string; value: object }[] = [
    { key: 'refund', legacyPath: '$.sameDayFeeRate', value: DEFAULT_REFUND_RULE },
    { key: 'capacity_alarm', legacyPath: '$.warn80', value: DEFAULT_CAPACITY_ALARM },
  ];
  for (const m of migrations) {
    const [r]: any = await conn.query(
      'UPDATE sys_config SET config_value = ? WHERE config_key = ? AND JSON_EXTRACT(config_value, ?) IS NOT NULL',
      [JSON.stringify(m.value), m.key, m.legacyPath],
    );
    if (r.affectedRows) console.log(`✓ 已将 ${m.key} 的旧形状归一为新形状`);
  }
  console.log('✓ 参数配置已就绪');

  await conn.end();
  console.log('\n种子数据完成。');
}

main().catch((err) => {
  console.error('种子数据失败：', err);
  process.exit(1);
});
