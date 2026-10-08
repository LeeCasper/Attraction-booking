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
      'order:read', 'order:refund_audit', 'verify:execute',
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
    permissions: ['order:read', 'order:refund_audit', 'config:read', 'log:read', 'stats:read'],
  },
  {
    code: 'ops',
    name: '运维',
    remark: '闸机监控与远程控制',
    permissions: ['gate:read', 'gate:control', 'log:read', 'stats:read'],
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
      `INSERT INTO scenic_area (name, address, intro, open_time, max_capacity, status)
       VALUES ('示例山景区', '某某市某某区风景路 1 号', '示例景区，M1 联调用', '08:00-17:00', 50000, 1)`,
    );
    const areaId = Number(res.insertId);

    // 时段
    const slotIds: number[] = [];
    for (const [i, s] of [
      ['上午场 08:00-10:00', '08:00', '10:00'],
      ['上午场 10:00-12:00', '10:00', '12:00'],
      ['下午场 13:00-15:00', '13:00', '15:00'],
      ['下午场 15:00-17:00', '15:00', '17:00'],
    ].entries()) {
      const [r]: any = await conn.query(
        'INSERT INTO time_slot (scenic_area_id, name, start_time, end_time, sort_order, status) VALUES (?,?,?,?,?,1)',
        [areaId, s[0], s[1], s[2], i],
      );
      slotIds.push(Number(r.insertId));
    }
    console.log('✓ 已创建示例景区与 4 个时段');

    // 票种
    const [t]: any = await conn.query(
      `INSERT INTO ticket_type (scenic_area_id, name, audience, base_price, refund_rule, need_realname, status, remark)
       VALUES (?, '成人票', '18-60周岁', 6000, ?, 1, 1, '示例票种')`,
      [areaId, JSON.stringify({ beforeDay: 1, feeRate: 0.2, expiredNoRefund: true })],
    );
    await conn.query(
      `INSERT INTO purchase_rule (ticket_type_id, per_user_per_order, per_user_per_day, per_idcard_per_day)
       VALUES (?, 4, 5, 1)`,
      [Number(t.insertId)],
    );
    console.log('✓ 已创建示例票种「成人票」(60 元) 与限购规则');
    console.log(`\n提示：可用 POST /api/admin/stocks/generate 为未来日期生成分时库存`);
  } else {
    console.log('✓ 已存在景区数据，跳过示例数据');
  }

  // ---- 参数配置 ----
  const configs: [string, object, string][] = [
    ['reservation', { payTimeoutMinutes: 15, cancelOnTimeout: true }, '预约规则：支付超时时间'],
    ['capacity_alarm', { warn80: true, warn90: true, warn100: true }, '承载量分级预警开关(80%/90%/100%)'],
    ['refund', { beforeDayFeeRate: 0, sameDayFeeRate: 0.2, expiredNoRefund: true }, '全局退改规则(票种可覆盖)'],
  ];
  for (const [key, value, remark] of configs) {
    await conn.query(
      'INSERT INTO sys_config (config_key, config_value, remark) VALUES (?,?,?) ON DUPLICATE KEY UPDATE remark=VALUES(remark)',
      [key, JSON.stringify(value), remark],
    );
  }
  console.log('✓ 参数配置已就绪');

  await conn.end();
  console.log('\n种子数据完成。');
}

main().catch((err) => {
  console.error('种子数据失败：', err);
  process.exit(1);
});
