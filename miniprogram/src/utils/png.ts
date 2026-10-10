/**
 * 极简单色 PNG 编码器：把一张「黑/白」网格编成 1 位灰度 PNG 的 data URI。
 *
 * ## 为什么要自己写
 *
 * 二维码要画在页面上，而小程序里能画图的只有两条路：canvas 或 `<image>`。
 * canvas 那条走不通 —— `type="2d"` 拿节点要 `createSelectorQuery`，在真机上时有时无
 * （开发者工具能画、手机退回降级路径），换 `canvas-id` 老接口又因为它是原生组件、
 * 会盖住水印层。`<image>` 则是最普通的元素：不依赖任何平台 API、不参与层级打架、
 * H5 与小程序一份代码。
 *
 * 关键点是**体积**：1 位灰度（每像素 1 bit）下，一张 456×456 的二维码 PNG 只有 ~25KB，
 * base64 后 ~34KB —— 因为二维码本来就是两色的，1 bit 刚好够。
 *
 * ## 为什么不需要 zlib
 *
 * PNG 的 IDAT 是 zlib 流，而 zlib 允许**不压缩的存储块**（BTYPE=00）。
 * 所以只要自己算 adler32 与 crc32，把原始扫描线原样塞进去即可，不必实现 DEFLATE。
 * 代价是文件比压缩过的大，但二维码是 1 bit/px 的稀疏图，本来就没多少可压的。
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** zlib 流：2 字节头 + 若干「存储块」+ adler32 */
function zlibStored(raw: Uint8Array): Uint8Array {
  const MAX = 0xffff;
  const out = new Uint8Array(raw.length + 11 + Math.ceil(raw.length / MAX) * 5);
  let p = 0;
  out[p++] = 0x78; // CMF：deflate / 32K 窗口
  out[p++] = 0x01; // FLG：无字典、最低压缩
  for (let offset = 0; offset < raw.length; offset += MAX) {
    const len = Math.min(MAX, raw.length - offset);
    const final = offset + len >= raw.length ? 1 : 0;
    out[p++] = final;
    out[p++] = len & 0xff;
    out[p++] = (len >>> 8) & 0xff;
    out[p++] = ~len & 0xff;
    out[p++] = (~len >>> 8) & 0xff;
    out.set(raw.subarray(offset, offset + len), p);
    p += len;
  }
  const sum = adler32(raw);
  out[p++] = (sum >>> 24) & 0xff;
  out[p++] = (sum >>> 16) & 0xff;
  out[p++] = (sum >>> 8) & 0xff;
  out[p++] = sum & 0xff;
  return out.subarray(0, p);
}

/** 一个 PNG 数据块：长度 + 类型 + 数据 + CRC */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[b2 & 0x3f] : '=';
  }
  return out;
}

/**
 * 把网格编成 1 位灰度 PNG 的 data URI。
 *
 * @param scale 每个格子放大成多少像素（避免画布/图片被拉伸模糊）
 * @param grid  `grid[y][x] === true` 表示该格是深色
 */
export function monoPngDataUri(scale: number, grid: readonly (readonly boolean[])[]): string {
  const cells = grid.length;
  const side = cells * scale;
  const rowBytes = Math.ceil(side / 8);

  // 原始扫描线：每行 1 字节滤波类型（0 = None）+ 位打包（MSB 在前，1 = 白、0 = 黑）
  const raw = new Uint8Array((rowBytes + 1) * side);
  for (let py = 0; py < side; py++) {
    const row = grid[Math.floor(py / scale)];
    const base = py * (rowBytes + 1) + 1;
    for (let px = 0; px < side; px++) {
      if (!row[Math.floor(px / scale)]) raw[base + (px >> 3)] |= 0x80 >> (px & 7);
    }
  }

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, side);
  view.setUint32(4, side);
  ihdr[8] = 1; // 位深 1
  ihdr[9] = 0; // 颜色类型 0 = 灰度
  ihdr[10] = 0; // 压缩方法
  ihdr[11] = 0; // 滤波方法
  ihdr[12] = 0; // 非隔行

  const parts = [
    Uint8Array.from(PNG_SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibStored(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }

  return `data:image/png;base64,${base64(png)}`;
}
