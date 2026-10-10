/**
 * 二维码编码器（字节模式，纠错 L/M/Q/H，版本 1~40 自增）。
 *
 * ## 为什么要自己带一个
 *
 * 小程序包里**没有任何二维码库**，而凭证页必须把服务端签发的动态 token 编成**真能扫的**二维码
 * （闸机就是把扫出来的原文当 `credential` 提交给 `POST /api/gate/verify`，见
 * `server/src/modules/verify/verify.service.ts` 的 `verifyByCredential`）。
 * 装 `qrcode` 包要联网、要新增依赖，而这个算法是纯计算、没有平台 API，自己带一份更省事。
 *
 * 算法按 Kazuhiko Arase 的 `qrcode.js` 实现（MIT，`miniprogram/node_modules/qrcode-terminal/vendor/QRCode`
 * 里就有同一份，本项目是把它的算法用 TS 重写，没有引入运行时依赖）。两张表
 * （`RS_BLOCK_TABLE` / `PATTERN_POSITION_TABLE`）是**从那份实现里机器提取**的，不是手抄的。
 *
 * ## 只做字节模式
 *
 * token 是 base64url（**含小写字母**），塞不进 QR 的数字/字母数字模式，只能走字节模式，
 * 所以这里不实现另外三种模式。中文等非 ASCII 会按 UTF-8 编码。
 *
 * ## 怎么验的
 *
 * `scripts/verify-qrcode.mjs`：随机 payload × 4 个纠错等级 × 版本 1~40 全跑一遍，
 * 一边与 `qrcode-terminal` 自带的那份**逐模块比对**，一边用 `qrcode-reader` 真解码回来对原文。
 */

export type QrEcc = 'L' | 'M' | 'Q' | 'H';

export interface QrMatrix {
  /** 版本号 1~40 */
  version: number;
  /** 边长（模块数）= 版本号 × 4 + 17 */
  size: number;
  /** 每行一个 '0'/'1' 串，'1' = 深色。直接用 `rows[y][x]` 取值即可 */
  rows: string[];
}

/**
 * 每 4 行对应同一个版本，行内顺序固定为 **L / M / Q / H**（与 `RS_BLOCK_TABLE` 的排布一致）。
 * 所以取表时要 `(version - 1) * 4 + offset`。
 */
const ECC_OFFSET: Record<QrEcc, number> = { L: 0, M: 1, Q: 2, H: 3 };

/**
 * 格式信息里的纠错等级指示符。
 *
 * ⚠️ **别拿 `ECC_OFFSET` 当值用** —— 它只是 `RS_BLOCK_TABLE` 的行序（L/M/Q/H），
 * 而写进二维码的格式位是协议另外规定的编码（L=1、M=0、Q=3、H=2，正是 Arase 那份实现里
 * `QRErrorCorrectLevel` 的取值）。这两个映射恰好不一样，混用会得到一个「能扫但解错等级」的码。
 */
const ECC_INDICATOR: Record<QrEcc, number> = { L: 1, M: 0, Q: 3, H: 2 };

/**
 * 纠错块表：每个版本 4 行（L/M/Q/H），行形如：
 * - `[块数, 总码字数, 数据码字数]` —— 单组
 * - `[块数1, 总1, 数据1, 块数2, 总2, 数据2]` —— 两组（高版本会把码字切成两种块）
 */
const RS_BLOCK_TABLE: readonly (readonly number[])[] = [
  [1,26,19],[1,26,16],[1,26,13],[1,26,9],[1,44,34],[1,44,28],[1,44,22],[1,44,16],
  [1,70,55],[1,70,44],[2,35,17],[2,35,13],[1,100,80],[2,50,32],[2,50,24],[4,25,9],
  [1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],[2,86,68],[4,43,27],[4,43,19],[4,43,15],
  [2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],
  [2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],
  [4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],
  [4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],
  [5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12],[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],
  [1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],
  [3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],
  [4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17],[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13],
  [4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16],[6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17],
  [8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16],[10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17],
  [8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16],[3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16],
  [7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16],[5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16],
  [13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16],[17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16],
  [17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16],[13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17],
  [12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16],[6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16],
  [17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16],[4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16],
  [20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16],[19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16],
];

/** 对齐图形（小白方块）的圆心坐标表；下标 = 版本号 - 1 */
const PATTERN_POSITION_TABLE: readonly (readonly number[])[] = [
  [],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],
  [6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],
  [6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],
  [6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],
  [6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170],
];

/** 格式信息、版本信息用的 BCH 生成多项式与掩码（协议固定值） */
const G15 = 0b10100110111;
const G18 = 0b1111100100101;
const G15_MASK = 0b101010000010010;

/** 字节模式的模式指示符（4 bit） */
const MODE_8BIT_BYTE = 0b0100;

/** 填充码字（数据位不够时交替填这两个，协议固定） */
const PAD0 = 0xec;
const PAD1 = 0x11;

// ---------------------------------------------------------------------------
// GF(256) 有限域运算 —— 本原多项式 x^8 + x^4 + x^3 + x^2 + 1 (0x11d)
// ---------------------------------------------------------------------------

const EXP_TABLE = new Uint8Array(256);
const LOG_TABLE = new Uint8Array(256);

for (let i = 0; i < 8; i++) EXP_TABLE[i] = 1 << i;
for (let i = 8; i < 256; i++) {
  EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
}
for (let i = 0; i < 255; i++) LOG_TABLE[EXP_TABLE[i]] = i;

/** α 的 n 次幂，n 按 255 取模（负数也能用） */
function gexp(n: number): number {
  let e = n % 255;
  if (e < 0) e += 255;
  return EXP_TABLE[e];
}

/** 以 α 为底的对数；0 无对数（协议里不会出现） */
function glog(n: number): number {
  if (n < 1) throw new Error(`GF(256) 上 0 没有对数：${n}`);
  return LOG_TABLE[n];
}

interface RsBlock {
  totalCount: number;
  dataCount: number;
}

function rsBlocksOf(version: number, ecc: QrEcc): RsBlock[] {
  const row = RS_BLOCK_TABLE[(version - 1) * 4 + ECC_OFFSET[ecc]];
  const blocks: RsBlock[] = [];
  const push = (count: number, total: number, data: number) => {
    for (let i = 0; i < count; i++) blocks.push({ totalCount: total, dataCount: data });
  };
  push(row[0], row[1], row[2]);
  if (row.length > 3) push(row[3], row[4], row[5]);
  return blocks;
}

/** 该版本 + 纠错等级下，数据码字的总数（不含纠错码字） */
function dataCodewords(version: number, ecc: QrEcc): number {
  return rsBlocksOf(version, ecc).reduce((sum, b) => sum + b.dataCount, 0);
}

/** 字节模式下字符计数指示符的位宽：版本 1~9 是 8 位，10 以上是 16 位 */
function charCountBits(version: number): number {
  return version < 10 ? 8 : 16;
}

/** 这段数据塞进该版本还放得下吗 */
function fits(version: number, ecc: QrEcc, byteLength: number): boolean {
  const needed = 4 + charCountBits(version) + byteLength * 8;
  return needed <= dataCodewords(version, ecc) * 8;
}

/** UTF-8 编码。不用 `TextEncoder` —— 小程序端不保证有 */
function utf8Bytes(str: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.codePointAt(i) as number;
    if (code > 0xffff) i++; // 代理对，一次吃掉两个 code unit
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return out;
}

/** 位缓冲：按位往里塞，最后按字节取 */
class BitBuffer {
  readonly bytes: number[] = [];
  length = 0;

  put(value: number, length: number): void {
    for (let i = 0; i < length; i++) this.putBit(((value >>> (length - i - 1)) & 1) === 1);
  }

  putBit(bit: boolean): void {
    const index = this.length >> 3;
    if (this.bytes.length <= index) this.bytes.push(0);
    if (bit) this.bytes[index] |= 0x80 >>> (this.length & 7);
    this.length++;
  }
}

/** 多项式乘（系数按**最高次在前**排列） */
function polyMultiply(a: number[], b: number[]): number[] {
  const out = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) out[i + j] ^= gexp(glog(a[i]) + glog(b[j]));
  }
  return out;
}

/**
 * 多项式取余。
 *
 * ⚠️ 每一步都要**先掐掉首部的 0**再比阶数 —— 消掉最高次项之后首项必然变成 0
 * （`a ^ gexp(glog(a))` = 0），不掐掉的话长度永远不减、递归不收敛，
 * 而且下一轮会对 0 取对数直接抛错。参考实现在它的多项式构造函数里做了这件事。
 */
function polyMod(self: number[], divisor: number[]): number[] {
  let start = 0;
  while (start < self.length && self[start] === 0) start++;
  const reduced = self.slice(start);
  if (reduced.length - divisor.length < 0) return reduced;

  const ratio = glog(reduced[0]) - glog(divisor[0]);
  const rest = reduced.slice();
  for (let i = 0; i < divisor.length; i++) rest[i] ^= gexp(glog(divisor[i]) + ratio);
  return polyMod(rest, divisor);
}

/** 生成多项式 = ∏(x - α^i)，i 取 0..ecLength-1 */
function errorCorrectPolynomial(ecLength: number): number[] {
  let poly = [1];
  for (let i = 0; i < ecLength; i++) poly = polyMultiply(poly, [1, gexp(i)]);
  return poly;
}

/** 把数据码字切块、逐块算纠错、再按协议交错成最终码字序列 */
function buildCodewords(version: number, ecc: QrEcc, buffer: BitBuffer): number[] {
  const rsBlocks = rsBlocksOf(version, ecc);
  const data: number[][] = [];
  const error: number[][] = [];
  let offset = 0;
  let maxData = 0;
  let maxError = 0;

  rsBlocks.forEach((block, r) => {
    const dataCount = block.dataCount;
    const errorCount = block.totalCount - block.dataCount;
    maxData = Math.max(maxData, dataCount);
    maxError = Math.max(maxError, errorCount);

    data[r] = buffer.bytes.slice(offset, offset + dataCount);
    offset += dataCount;

    // 数据 × x^errorCount 再对生成多项式取余，余数就是纠错码字
    const mod = polyMod([...data[r], ...new Array<number>(errorCount).fill(0)], errorCorrectPolynomial(errorCount));
    error[r] = new Array<number>(errorCount).fill(0);
    for (let i = 0; i < errorCount; i++) {
      const idx = i + mod.length - errorCount;
      error[r][i] = idx >= 0 ? mod[idx] : 0;
    }
  });

  // 交错：先按「第 z 个数据码字」横着取，再按「第 x 个纠错码字」横着取
  const out: number[] = [];
  for (let z = 0; z < maxData; z++) {
    for (let r = 0; r < rsBlocks.length; r++) {
      if (z < data[r].length) out.push(data[r][z]);
    }
  }
  for (let x = 0; x < maxError; x++) {
    for (let r = 0; r < rsBlocks.length; r++) {
      if (x < error[r].length) out.push(error[r][x]);
    }
  }
  return out;
}

/** BCH 余数用的「位数」 */
function bchDigit(value: number): number {
  let digit = 0;
  let rest = value;
  while (rest !== 0) {
    digit++;
    rest >>>= 1;
  }
  return digit;
}

/** 格式信息（纠错等级 + 掩码号），15 位，含 BCH 校验与固定掩码 */
function bchTypeInfo(data: number): number {
  let d = data << 10;
  while (bchDigit(d) - bchDigit(G15) >= 0) d ^= G15 << (bchDigit(d) - bchDigit(G15));
  return ((data << 10) | d) ^ G15_MASK;
}

/** 版本信息（版本 ≥ 7 才有），18 位，含 BCH 校验 */
function bchTypeNumber(data: number): number {
  let d = data << 12;
  while (bchDigit(d) - bchDigit(G18) >= 0) d ^= G18 << (bchDigit(d) - bchDigit(G18));
  return (data << 12) | d;
}

/** 8 种掩码规则，返回 true 表示该格要取反 */
function maskAt(pattern: number, i: number, j: number): boolean {
  switch (pattern) {
    case 0:
      return (i + j) % 2 === 0;
    case 1:
      return i % 2 === 0;
    case 2:
      return j % 3 === 0;
    case 3:
      return (i + j) % 3 === 0;
    case 4:
      return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
    case 5:
      return ((i * j) % 2) + ((i * j) % 3) === 0;
    case 6:
      return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
    case 7:
      return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
    default:
      throw new Error(`掩码号越界：${pattern}`);
  }
}

/** 掩码方案的「罚分」（协议 §8.8.2 的四条规则），分越低越好 */
function lostPoint(matrix: boolean[][], size: number): number {
  let point = 0;

  // 规则一：同色邻块过多
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      let sameCount = 0;
      const dark = matrix[row][col];
      for (let r = -1; r <= 1; r++) {
        if (row + r < 0 || row + r >= size) continue;
        for (let c = -1; c <= 1; c++) {
          if (col + c < 0 || col + c >= size) continue;
          if (r === 0 && c === 0) continue;
          if (dark === matrix[row + r][col + c]) sameCount++;
        }
      }
      if (sameCount > 5) point += 3 + sameCount - 5;
    }
  }

  // 规则二：2×2 同色块
  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      let count = 0;
      if (matrix[row][col]) count++;
      if (matrix[row + 1][col]) count++;
      if (matrix[row][col + 1]) count++;
      if (matrix[row + 1][col + 1]) count++;
      if (count === 0 || count === 4) point += 3;
    }
  }

  // 规则三：形如 1:1:3:1:1 的定位图形（横竖各扫一遍）
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size - 6; col++) {
      if (
        matrix[row][col] && !matrix[row][col + 1] && matrix[row][col + 2] &&
        matrix[row][col + 3] && matrix[row][col + 4] && !matrix[row][col + 5] &&
        matrix[row][col + 6]
      ) point += 40;
    }
  }
  for (let col = 0; col < size; col++) {
    for (let row = 0; row < size - 6; row++) {
      if (
        matrix[row][col] && !matrix[row + 1][col] && matrix[row + 2][col] &&
        matrix[row + 3][col] && matrix[row + 4][col] && !matrix[row + 5][col] &&
        matrix[row + 6][col]
      ) point += 40;
    }
  }

  // 规则四：深色占比偏离 50% 的程度
  let darkCount = 0;
  for (let col = 0; col < size; col++) {
    for (let row = 0; row < size; row++) if (matrix[row][col]) darkCount++;
  }
  point += (Math.abs((100 * darkCount) / size / size - 50) / 5) * 10;

  return point;
}

/**
 * 把一个字符串编成二维码矩阵。
 *
 * @param text 要编码的内容（**原样整串**，不要加前缀或包装 —— 闸机验的就是这个字符串）
 * @param ecc  纠错等级，默认 M。等级越高越抗污损，但同样内容需要的版本越大
 */
export function encodeQr(text: string, ecc: QrEcc = 'M'): QrMatrix {
  const bytes = utf8Bytes(text);

  // 选版本：从小往大试，取第一个放得下的
  let version = 0;
  for (let v = 1; v <= 40; v++) {
    if (fits(v, ecc, bytes.length)) {
      version = v;
      break;
    }
  }
  if (!version) {
    throw new Error(`内容太长，纠错等级 ${ecc} 下 40 版本也放不下（${bytes.length} 字节）`);
  }

  // 数据位：模式指示符 + 字符计数 + 内容 + 结束符 + 补齐到字节
  const buffer = new BitBuffer();
  buffer.put(MODE_8BIT_BYTE, 4);
  buffer.put(bytes.length, charCountBits(version));
  for (const b of bytes) buffer.put(b, 8);

  const capacity = dataCodewords(version, ecc) * 8;
  if (buffer.length + 4 <= capacity) buffer.put(0, 4); // 结束符（放不下就省略，协议允许）
  while (buffer.length % 8 !== 0) buffer.putBit(false);
  while (buffer.bytes.length < capacity / 8) {
    buffer.bytes.push(PAD0);
    buffer.length += 8;
    if (buffer.bytes.length < capacity / 8) {
      buffer.bytes.push(PAD1);
      buffer.length += 8;
    }
  }

  const codewords = buildCodewords(version, ecc, buffer);
  const size = version * 4 + 17;

  /** 铺一遍矩阵；`test = true` 时格式/版本信息位置先留空，只用来给掩码打分 */
  const build = (test: boolean, maskPattern: number): boolean[][] => {
    const m: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    /** 该格是否已被功能图形占用（null 语义在 TS 里用一个平行矩阵表达） */
    const fixed: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

    // 三个定位图形（7×7 回字）+ 它们外侧的一格分隔带
    const probe = (row: number, col: number) => {
      for (let r = -1; r <= 7; r++) {
        if (row + r < 0 || row + r >= size) continue;
        for (let c = -1; c <= 7; c++) {
          if (col + c < 0 || col + c >= size) continue;
          const dark =
            (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
            (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          m[row + r][col + c] = dark;
          fixed[row + r][col + c] = true;
        }
      }
    };
    probe(0, 0);
    probe(size - 7, 0);
    probe(0, size - 7);

    // 对齐图形。⚠️ **必须在定时图形之前画** —— 版本 7 以上有圆心正好落在第 6 行/列上的
    // 对齐图形（如 (6,22)），先画定时图形会把圆心占掉，这一格就会被当成「已占用」而整个跳过。
    const positions = PATTERN_POSITION_TABLE[version - 1];
    for (const row of positions) {
      for (const col of positions) {
        if (fixed[row][col]) continue;
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            m[row + r][col + c] = r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0);
            fixed[row + r][col + c] = true;
          }
        }
      }
    }

    // 定时图形（第 6 行/列交替），跳过已经被对齐图形占掉的位置
    for (let r = 8; r < size - 8; r++) {
      if (fixed[r][6]) continue;
      m[r][6] = r % 2 === 0;
      fixed[r][6] = true;
    }
    for (let c = 8; c < size - 8; c++) {
      if (fixed[6][c]) continue;
      m[6][c] = c % 2 === 0;
      fixed[6][c] = true;
    }

    // 格式信息（纠错等级 + 掩码号）。这两个指示符**不是** RS_BLOCK_TABLE 的行序：
    // 表里是 L/M/Q/H，而格式位里 L=1、M=0、Q=3、H=2（协议规定，不能直接拿 ECC_OFFSET 当值）
    const eccBits = ECC_INDICATOR[ecc];
    const formatBits = bchTypeInfo((eccBits << 3) | maskPattern);
    for (let i = 0; i < 15; i++) {
      const dark = !test && ((formatBits >> i) & 1) === 1;
      if (i < 6) {
        m[i][8] = dark;
        fixed[i][8] = true;
      } else if (i < 8) {
        m[i + 1][8] = dark;
        fixed[i + 1][8] = true;
      } else {
        m[size - 15 + i][8] = dark;
        fixed[size - 15 + i][8] = true;
      }
    }
    for (let i = 0; i < 15; i++) {
      const dark = !test && ((formatBits >> i) & 1) === 1;
      if (i < 8) {
        m[8][size - i - 1] = dark;
        fixed[8][size - i - 1] = true;
      } else if (i < 9) {
        m[8][15 - i - 1 + 1] = dark;
        fixed[8][15 - i - 1 + 1] = true;
      } else {
        m[8][15 - i - 1] = dark;
        fixed[8][15 - i - 1] = true;
      }
    }
    // 固定深色模块（不是格式位，但占着数据区不放）—— 同样必须登记，否则会被数据覆盖
    m[size - 8][8] = !test;
    fixed[size - 8][8] = true;

    // 版本信息（版本 ≥ 7）
    if (version >= 7) {
      const versionBits = bchTypeNumber(version);
      for (let i = 0; i < 18; i++) {
        const dark = !test && ((versionBits >> i) & 1) === 1;
        const y = Math.floor(i / 3);
        const x = (i % 3) + size - 8 - 3;
        m[y][x] = dark;
        fixed[y][x] = true;
      }
      for (let i = 0; i < 18; i++) {
        const dark = !test && ((versionBits >> i) & 1) === 1;
        const y = (i % 3) + size - 8 - 3;
        const x = Math.floor(i / 3);
        m[y][x] = dark;
        fixed[y][x] = true;
      }
    }

    // 数据区：从右下角起，两列一组蛇形上升
    let inc = -1;
    let row = size - 1;
    let bitIndex = 7;
    let byteIndex = 0;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--; // 让开第 6 列的定时图形
      for (;;) {
        for (let c = 0; c < 2; c++) {
          const x = col - c;
          if (!fixed[row][x]) {
            let dark = false;
            if (byteIndex < codewords.length) {
              dark = ((codewords[byteIndex] >>> bitIndex) & 1) === 1;
            }
            if (maskAt(maskPattern, row, x)) dark = !dark;
            m[row][x] = dark;
            fixed[row][x] = true;
            bitIndex--;
            if (bitIndex === -1) {
              byteIndex++;
              bitIndex = 7;
            }
          }
        }
        row += inc;
        if (row < 0 || row >= size) {
          row -= inc;
          inc = -inc;
          break;
        }
      }
    }

    return m;
  };

  // 8 种掩码各铺一遍，取罚分最低的
  let best = 0;
  let bestPoint = Number.MAX_SAFE_INTEGER;
  for (let pattern = 0; pattern < 8; pattern++) {
    const point = lostPoint(build(true, pattern), size);
    if (point < bestPoint) {
      bestPoint = point;
      best = pattern;
    }
  }

  const matrix = build(false, best);
  return {
    version,
    size,
    rows: matrix.map((row) => row.map((dark) => (dark ? '1' : '0')).join('')),
  };
}
