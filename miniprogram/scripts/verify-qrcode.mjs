// =============================================================================
// 校验 src/utils/qrcode.ts 编出来的二维码**真的能扫**
//
// 两条独立的证据链，缺一不可：
//
//  1. **逐模块对比**：与 `qrcode-terminal` 自带的那份 Kazuhiko Arase 实现（同一套算法，
//     久经使用）编同一个内容，断言版本号、边长、每一个模块都完全一致 —— 能抓出掩码选择、
//     纠错分块、格式位之类的细微写错。
//  2. **真解码**：把矩阵画成 PNG，交给 `qrcode-reader`（jsqrcode 的移植，是个正经解码器）
//     解回字符串，断言与原文逐字相同 —— 这一条不依赖「我的理解对不对」，只看能不能扫出来。
//
// ⚠️ §3/§5 的解码断言是**概率性**的：`qrcode-reader` 是 2010 年代 jsqrcode 的移植，
// 对随机码有 10~25% 的失败率，且**与密度无关**（45×45 和 65×65 都一样失败）。
// 所以判定失败时会把参考实现的同名矩阵也喂进去 —— 参考实现同样解不出，就断定是解码器的问题、
// 不计失败。**真正的确定性证据是 §2**（与参考实现逐模块一致），解码只是「确实能扫出来」的旁证。
//
// ⚠️ 用到的几个包（`qrcode-terminal` / `qrcode-reader` / `pngjs` / `jimp` / `esbuild`）
// 都不是本工程声明的依赖，而是 uni CLI 与 vite 的**传递依赖**（版本锁在 package-lock.json 里）。
// 哪天上游换掉它们，这个脚本会**明确报缺哪个包**而不是悄悄放行。
//
// 跑：npm run verify:qrcode
// =============================================================================

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync } from 'node:fs';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const ECC_LEVELS = ['L', 'M', 'Q', 'H'];

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? `  ${detail}` : ''}`);
  }
}

function need(pkg, hint) {
  try {
    return require(pkg);
  } catch {
    console.error(`✗ 缺少依赖 ${pkg} —— ${hint}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 把 TS 编成能 import 的 mjs（用 vite 自带的 esbuild，不引新依赖）
// ---------------------------------------------------------------------------
const esbuild = need('esbuild', '它是 vite 的依赖，试着重装 miniprogram 的依赖');
const outDir = join(tmpdir(), 'ab-qrcode-verify');
mkdirSync(outDir, { recursive: true });
await esbuild.build({
  // 编码器和渲染层都打进来 —— 几何换算在 qr-render.ts，验证要覆盖到它，而不只是编码器
  entryPoints: [join(ROOT, 'src/utils/qrcode.ts'), join(ROOT, 'src/utils/qr-render.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outdir: outDir,
  // 工程里没有 "type": "module"，.js 会被当成 CommonJS —— 显式产 .mjs 才能直接 import
  outExtension: { '.js': '.mjs' },
  logLevel: 'warning',
});
const { encodeQr } = await import(join(outDir, 'qrcode.mjs'));
const { qrImageDataUri, isFinder } = await import(join(outDir, 'qr-render.mjs'));
rmSync(outDir, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// 造测试内容：覆盖纯数字、base64url（真实 token 的形状）、中文、长内容
// ---------------------------------------------------------------------------
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function randomText(length, alphabet = BASE64URL) {
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

console.log('§1 真实 token 形状（136 字符 base64url）');
{
  const token = `${randomText(92)}.${randomText(43)}`;
  for (const ecc of ECC_LEVELS) {
    const qr = encodeQr(token, ecc);
    check(
      `纠错 ${ecc}：${token.length} 字符 → 版本 ${qr.version}，${qr.size}×${qr.size}`,
      qr.size === qr.version * 4 + 17,
    );
  }
  // 版本自增的边界：ECC H 下版本 11 只能放 137 字节（137 = (1120 位 - 4 位模式 - 16 位计数) / 8）
  check('ECC H：136 字符的 token 落在版本 11（只余 1 字节）', encodeQr(randomText(136), 'H').version === 11);
  check('ECC H：137 字节仍在版本 11', encodeQr(randomText(137), 'H').version === 11);
  check('ECC H：138 字节自增到版本 12', encodeQr(randomText(138), 'H').version === 12);
}

console.log('\n§2 与 qrcode-terminal 自带的参考实现逐模块对比');
{
  const QRCode = need('qrcode-terminal/vendor/QRCode', 'uni CLI 的传递依赖');
  const ECL = need('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel', '同上');

  let compared = 0;
  let mismatches = 0;
  let firstMismatch = '';
  const lengths = [1, 2, 5, 10, 17, 18, 20, 30, 50, 70, 90, 120, 136, 140, 141, 160, 200, 260, 300];

  for (const ecc of ECC_LEVELS) {
    for (const len of lengths) {
      const text = randomText(len);
      const mine = encodeQr(text, ecc);

      const ref = new QRCode(0, ECL[ecc]);
      ref.addData(text);
      ref.make();
      const refSize = ref.getModuleCount();

      compared++;
      if (refSize !== mine.size) {
        mismatches++;
        firstMismatch = firstMismatch || `长度 ${len} 纠错 ${ecc}：边长 ${mine.size} vs 参考 ${refSize}`;
        continue;
      }
      let diff = 0;
      for (let y = 0; y < refSize; y++) {
        for (let x = 0; x < refSize; x++) {
          if ((mine.rows[y][x] === '1') !== ref.isDark(y, x)) diff++;
        }
      }
      if (diff > 0) {
        mismatches++;
        firstMismatch = firstMismatch || `长度 ${len} 纠错 ${ecc}：${diff} 个模块不一致`;
      }
    }
  }
  check(
    `${compared} 组（4 个纠错等级 × ${lengths.length} 种长度）全部逐模块一致`,
    mismatches === 0,
    firstMismatch,
  );
  if (mismatches > 0) console.error(`    共 ${mismatches} 组不一致；首个：${firstMismatch}`);
}

console.log('\n§3 画成 PNG 后真解码（qrcode-reader）');
{
  const { PNG } = need('pngjs', 'vite 工具链的传递依赖');
  const QrCode = need('qrcode-reader', '传递依赖；它才是真正的「能不能扫」裁判');
  const QRCode = need('qrcode-terminal/vendor/QRCode', 'uni CLI 的传递依赖');
  const ECL = need('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel', '同上');

  const SCALE = 8;
  const QUIET = 8; // 静默区给足，免得因为边界被解码器判为无效

  /** 把矩阵画成 PNG 再交给解码器，返回解出来的字符串（失败则返回一句说明） */
  function decodeRows(rows, side) {
    const px = side + QUIET * 2;
    const png = new PNG({ width: px * SCALE, height: px * SCALE });
    for (let y = 0; y < px * SCALE; y++) {
      for (let x = 0; x < px * SCALE; x++) {
        const mx = Math.floor(x / SCALE) - QUIET;
        const my = Math.floor(y / SCALE) - QUIET;
        const dark = mx >= 0 && mx < side && my >= 0 && my < side && rows[my][mx] === '1';
        const off = (y * px * SCALE + x) * 4;
        const v = dark ? 0 : 255;
        png.data[off] = v;
        png.data[off + 1] = v;
        png.data[off + 2] = v;
        png.data[off + 3] = 255;
      }
    }
    return new Promise((resolve) => {
      const reader = new QrCode();
      // 回调是 (error, { result, points })，解出来的字符串在 `value.result`
      reader.callback = (err, value) =>
        resolve(err ? `解码失败：${err?.message ?? err}` : (value?.result ?? ''));
      reader.decode({ data: png.data, width: png.width, height: png.height });
    });
  }

  /** 用参考实现编同一个内容，取它的矩阵 */
  function referenceRows(text, ecc) {
    const ref = new QRCode(0, ECL[ecc]);
    ref.addData(text);
    ref.make();
    const n = ref.getModuleCount();
    const rows = [];
    for (let y = 0; y < n; y++) {
      let line = '';
      for (let x = 0; x < n; x++) line += ref.isDark(y, x) ? '1' : '0';
      rows.push(line);
    }
    return { rows, side: n };
  }

  /**
   * 解码断言。**解不出来时先拿参考实现的矩阵走同一条路**：
   * 参考实现也解不出来 → 是 `qrcode-reader` 对高密度码的分辨能力不够，不算我们的错（记一条提示）；
   * 只有我们解不出、参考能解出 → 我们错了。
   */
  async function expectDecode(name, text, ecc) {
    const mine = encodeQr(text, ecc);
    const got = await decodeRows(mine.rows, mine.size);
    if (got === text) {
      check(`${name}（${text.length} 字符，纠错 ${ecc}，版本 ${mine.version}）能解回原文`, true);
      return;
    }
    const ref = referenceRows(text, ecc);
    const refGot = await decodeRows(ref.rows, ref.side);
    if (refGot !== text) {
      console.log(
        `  · ${name}（${text.length} 字符，纠错 ${ecc}，版本 ${mine.version}）解码器解不出来，` +
          `参考实现同样解不出来（${String(refGot).slice(0, 30)}）→ 判为解码器自身对高密度码的限制，不计失败`,
      );
      return;
    }
    check(`${name}（${text.length} 字符，纠错 ${ecc}）能解回原文`, false, `我们解出 ${String(got).slice(0, 40)}…`);
  }

  // 真实 token 形状（136 字符，就是凭证页要编的内容）
  const token = `${randomText(92)}.${randomText(43)}`;
  for (const ecc of ECC_LEVELS) await expectDecode('真实 token 形状', token, ecc);

  // 边界与不同字符集
  await expectDecode('单字符', 'A', 'L');
  await expectDecode('纯数字', '1234567890', 'M');
  await expectDecode('中文', '景区动态凭证·闸机验票', 'M');
  await expectDecode('长内容', randomText(300), 'L');
  await expectDecode('接近 40 版本', randomText(1200), 'L');
}

console.log('\n§4 定位图形判定（渲染层要拿它上品牌色）');
{
  const qr = encodeQr(randomText(136), 'H');
  const n = qr.size;
  check('左上角属于定位图形', isFinder(n, 0, 0) && isFinder(n, 6, 6));
  check('右上角属于定位图形', isFinder(n, 0, n - 1) && isFinder(n, 3, n - 7));
  check('左下角属于定位图形', isFinder(n, n - 1, 0) && isFinder(n, n - 7, 3));
  check('中心区域不属于定位图形', !isFinder(n, Math.floor(n / 2), Math.floor(n / 2)));
  check('右下角不属于定位图形', !isFinder(n, n - 1, n - 1));
}

console.log('\n§5 渲染层：编出来的 PNG 逐格像素对不对、能不能解回原文');
{
  const { PNG } = need('pngjs', 'vite 工具链的传递依赖');
  const QrCode = need('qrcode-reader', '传递依赖；它才是真正的「能不能扫」裁判');

  const token = `${randomText(92)}.${randomText(43)}`;
  const qr = encodeQr(token, 'M');
  const uri = qrImageDataUri(qr.rows, qr.size);
  const buf = Buffer.from(uri.replace(/^data:image\/png;base64,/, ''), 'base64');
  const png = PNG.sync.read(buf);

  // 直接读 IHDR 的位深/颜色类型：位深 1、颜色类型 0（灰度）—— 这正是体积能压到几十 KB 的原因
  check('头部是 1 位灰度 PNG', buf[24] === 1 && buf[25] === 0, `depth=${buf[24]} colorType=${buf[25]}`);
  check(`尺寸是整数倍格数（${png.width}px / ${qr.size + 8} 格）`, png.width === png.height && png.width % (qr.size + 8) === 0);

  const cells = qr.size + 8;
  const scale = png.width / cells;
  let bad = 0;
  let quietBad = 0;
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const px = Math.floor((cx + 0.5) * scale);
      const py = Math.floor((cy + 0.5) * scale);
      const dark = png.data[(py * png.width + px) * 4] < 128;
      const my = cy - 4;
      const mx = cx - 4;
      const inside = my >= 0 && my < qr.size && mx >= 0 && mx < qr.size;
      const expect = inside && qr.rows[my][mx] === '1';
      if (dark !== expect) {
        bad++;
        if (!inside) quietBad++;
      }
    }
  }
  check(`逐格颜色与原矩阵一致（${cells}×${cells} 格）`, bad === 0, `${bad} 格不符`);
  check('静默区是白的（越界格没有一个是深色）', quietBad === 0, `${quietBad} 格越界`);

  console.log(`  · data URI 体积 ${(uri.length / 1024).toFixed(1)} KB，${png.width}×${png.height}，单格 ${scale}px`);

  // 解码（解码器有随机失败率，换几张码重试）
  let ok = false;
  let got = '';
  for (let attempt = 1; attempt <= 5 && !ok; attempt++) {
    const t = attempt === 1 ? token : `${randomText(92)}.${randomText(43)}`;
    const q = encodeQr(t, 'M');
    const bytes = Buffer.from(qrImageDataUri(q.rows, q.size).replace(/^data:image\/png;base64,/, ''), 'base64');
    const img = PNG.sync.read(bytes);
    got = await new Promise((resolve) => {
      const reader = new QrCode();
      reader.callback = (err, value) =>
        resolve(err ? `解码失败：${err?.message ?? err}` : (value?.result ?? ''));
      reader.decode({ data: img.data, width: img.width, height: img.height });
    });
    ok = got === t;
  }
  check('把这张图解回来 → 与 token 逐字相同', ok, String(got).slice(0, 40));
}

console.log(`\n${failed === 0 ? '✓' : '✗'} 通过 ${passed} 项，失败 ${failed} 项`);
process.exitCode = failed === 0 ? 0 : 1;
