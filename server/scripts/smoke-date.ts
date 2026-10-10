/**
 * 业务日期工具（`common/utils/date.util.ts`）的确定性回归测试。
 *
 * 为什么单独有这么一个脚本：这套东西修的是一个**很隐蔽**的 bug ——
 * 服务端拿 `new Date().toISOString().slice(0, 10)` 当「今天」，而那是 UTC，
 * 于是每天 00:00–08:00 与东八区的 DB 差一天（当天有效票被拒入园、昨天的票被放行）。
 * 这种错在白天跑任何冒烟都看不出来，所以断言必须**钉死在固定时刻**上，
 * 不能依赖墙上时钟，也不能依赖跑测试时的进程时区。
 *
 * 用法：`npm run smoke:date`（需要 ts-node，与 seed 同款：`--transpile-only`）
 */
import { execFileSync } from 'node:child_process';
import {
  DEFAULT_BUSINESS_TZ,
  addDaysStr,
  businessDate,
  businessDayEnd,
  businessToday,
  diffDays,
} from '../src/common/utils/date.util';

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail === undefined ? '' : `\n      ${JSON.stringify(detail)}`}`);
  }
}

/**
 * 一个**落在 bug 窗口里**的固定时刻：东八区 2026-10-10 00:30。
 * 此刻 UTC 还是 10-09 —— 老写法算出来就是错的。
 */
const IN_BUG_WINDOW = new Date('2026-10-10T00:30:00+08:00');
/** 另一个固定时刻：正常白天，两种算法应当一致 */
const IN_DAYTIME = new Date('2026-10-10T13:00:00+08:00');

// —— `--emit` 模式：只输出计算结果，供父进程在不同 TZ 下对比 ——
if (process.argv.includes('--emit')) {
  console.log(
    JSON.stringify({
      bugWindow: businessDate(IN_BUG_WINDOW),
      daytime: businessDate(IN_DAYTIME),
      today: businessToday(),
      plusOne: addDaysStr('2026-10-10', 1),
      dayEnd: businessDayEnd(IN_BUG_WINDOW).toISOString(),
    }),
  );
  process.exit(0);
}

console.log('\n=== 业务日期工具回归测试 ===\n');
console.log(`业务时区：${DEFAULT_BUSINESS_TZ}（BUSINESS_TZ=${process.env.BUSINESS_TZ ?? '未设置，用默认'}）`);

// ---- 1. 核心：bug 窗口内的日期 —— 这就是整个修复的意义 ----
console.log('\n[1] bug 窗口（东八区 00:30，UTC 还是前一天）');
check(`businessDate(${IN_BUG_WINDOW.toISOString()}) === '2026-10-10'`, businessDate(IN_BUG_WINDOW) === '2026-10-10', businessDate(IN_BUG_WINDOW));
check(
  "旧写法 toISOString().slice(0,10) 确实是错的（'2026-10-09'）—— 证明这个测试抓得住",
  IN_BUG_WINDOW.toISOString().slice(0, 10) === '2026-10-09',
  IN_BUG_WINDOW.toISOString().slice(0, 10),
);
check('白天时刻两种算法一致（所以白天跑冒烟看不出来）', businessDate(IN_DAYTIME) === IN_DAYTIME.toISOString().slice(0, 10));

// ---- 2. 日历日加减 ----
console.log('\n[2] addDaysStr（纯日历，跨月/跨年/闰年）');
check("addDaysStr('2026-10-10', 1) === '2026-10-11'", addDaysStr('2026-10-10', 1) === '2026-10-11', addDaysStr('2026-10-10', 1));
check("addDaysStr('2026-10-10', -1) === '2026-10-09'", addDaysStr('2026-10-10', -1) === '2026-10-09', addDaysStr('2026-10-10', -1));
check("跨月：'2026-10-31' + 1", addDaysStr('2026-10-31', 1) === '2026-11-01', addDaysStr('2026-10-31', 1));
check("跨年：'2026-12-31' + 1", addDaysStr('2026-12-31', 1) === '2027-01-01', addDaysStr('2026-12-31', 1));
check("闰年：'2028-02-28' + 1", addDaysStr('2028-02-28', 1) === '2028-02-29', addDaysStr('2028-02-28', 1));
check("平年：'2027-02-28' + 1", addDaysStr('2027-02-28', 1) === '2027-03-01', addDaysStr('2027-02-28', 1));
check('加再减回到原点（跨年 365 天往返）', addDaysStr(addDaysStr('2026-10-10', 365), -365) === '2026-10-10');

// ---- 3. 日差 ----
console.log('\n[3] diffDays');
check('同一天为 0', diffDays('2026-10-10', '2026-10-10') === 0);
check("'2026-10-10' → '2026-10-12' 为 2", diffDays('2026-10-10', '2026-10-12') === 2);
check('可负', diffDays('2026-10-12', '2026-10-10') === -2);
check('跨月正确', diffDays('2026-10-30', '2026-11-02') === 3);

// ---- 4. 业务日的结束时刻（限购 TTL 用）----
console.log('\n[4] businessDayEnd（业务日次日 00:00）');
const end = businessDayEnd(IN_BUG_WINDOW);
check(
  `00:30 时算出的次日 00:00 是东八区的 2026-10-11T00:00（UTC 为 10-10T16:00）`,
  end.toISOString() === '2026-10-10T16:00:00.000Z',
  end.toISOString(),
);
check('业务时区下它确实是次日的 00:00:00', new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_BUSINESS_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(end) === '00:00:00');

// ---- 5. 不依赖进程时区 ----
// 这是「显式业务时区」区别于「靠进程 TZ」的关键：把 TZ 换成 UTC / 纽约 / 豪勋爵岛，
// 结果必须**逐字相同**。做法是起子进程重跑 --emit 再比对。
console.log('\n[5] 不依赖进程时区（换 TZ 重跑，结果必须一致）');
// 本项目是 CommonJS（tsconfig `module: commonjs`、package.json 无 `type`），
// 所以子进程走 `-r ts-node/register/transpile-only`，与 `npm run seed` 同一套路子。
const self = __filename;
const runWith = (tz: string): string =>
  execFileSync(process.execPath, ['-r', 'ts-node/register/transpile-only', self, '--emit'], {
    cwd: process.cwd(),
    env: { ...process.env, TZ: tz },
    encoding: 'utf8',
  }).trim();

try {
  const baseline = runWith('Asia/Shanghai');
  for (const tz of ['UTC', 'America/New_York', 'Australia/Lord_Howe']) {
    const out = runWith(tz);
    check(`TZ=${tz} 与 Asia/Shanghai 结果一致`, out === baseline, { [tz]: out, 'Asia/Shanghai': baseline });
  }
} catch (err) {
  // 子进程起不来不该算「通过」，单独标出来让人看见
  fail++;
  console.log(`  ✗ TZ 对照没跑起来 —— ${(err as Error).message.split('\n')[0]}`);
}

console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===\n`);
process.exit(fail ? 1 : 0);
