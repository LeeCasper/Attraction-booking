/**
 * 给历史预约补凭证号。
 *
 * `reservation.credential_no` 是**后加的列**（见 `deploy/sql/init.sql`）——
 * 老数据是 NULL。第一版凭证号是「预约 id 派生」的，不需要存；改成随机落库之后，
 * 已存在的预约得补一次，否则它们的凭证页上「凭证号」那一行是空的。
 *
 * 幂等：只处理 `credential_no IS NULL` 的行，重复执行不会改动已有的号。
 * 用法：`npm run backfill:credential-no`
 * ⚠️ 与 seed 一样必须走 `ts-node`（不能用 tsx/esbuild 系，见 CLAUDE.md 第 1 条）。
 */
import 'reflect-metadata';
import { config } from 'dotenv';
config();

import mysql from 'mysql2/promise';
import { generateCredentialNo } from '../src/modules/order/order-no.util';

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_DATABASE ?? 'attraction_booking',
    charset: 'utf8mb4',
  });

  const [rows] = (await conn.query(
    'SELECT id, date FROM reservation WHERE credential_no IS NULL ORDER BY id ASC',
  )) as [Array<{ id: number; date: string | Date }>, unknown];

  if (!rows.length) {
    console.log('✓ 没有需要补凭证号的预约');
    await conn.end();
    return;
  }

  // 逐行生成：号是随机的，不能像派生那样一条 SQL 批量算 —— 而且这里要保证
  // 与建单时用的是**同一个生成器**（字母表、长度、前缀一旦漂移就查不出来了）
  let done = 0;
  for (const row of rows) {
    // `date` 列取回来可能是 Date（驱动把 DATE 转成了 JS Date），统一成 yyyy-MM-dd
    const date =
      row.date instanceof Date
        ? `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, '0')}-${String(row.date.getDate()).padStart(2, '0')}`
        : String(row.date).slice(0, 10);
    await conn.query('UPDATE reservation SET credential_no = ? WHERE id = ? AND credential_no IS NULL', [
      generateCredentialNo(date),
      row.id,
    ]);
    done++;
  }

  console.log(`✓ 已为 ${done} 条历史预约补上凭证号（V+预约日+8 位随机）`);
  await conn.end();
}

main().catch((err) => {
  console.error('✗ 补凭证号失败：', err);
  process.exit(1);
});
