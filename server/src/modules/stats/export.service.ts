import { Injectable } from '@nestjs/common';
import { areaCondition } from '../../common/utils/sql.util';
import { DataSource } from 'typeorm';

/** 导出文件 */
export interface CsvFile {
  fileName: string;
  content: Buffer;
}

/** 列定义 */
interface Column {
  title: string;
  /** 取值；返回 undefined/null 时输出空字符串 */
  value: (row: Record<string, any>) => string | number | null | undefined;
}

/**
 * 报表导出（PRD A-063）
 *
 * 采用 CSV：零依赖、Excel/WPS 可直接打开；UTF-8 BOM 保证中文不乱码。
 * 单次导出上限 5 万行，超出提示收窄日期范围（避免把服务内存打满）。
 */
@Injectable()
export class ExportService {
  private static readonly MAX_ROWS = 50_000;

  constructor(private readonly dataSource: DataSource) {}

  /** 订单明细导出（一行一位游客） */
  async orders(areaId: number | undefined, start: string, end: string): Promise<CsvFile> {
    const rows: Record<string, any>[] = await this.dataSource.query(
      `SELECT o.order_no, o.status, o.amount, o.channel, o.created_at, o.pay_time,
              r.date AS visit_date, ts.name AS slot_name,
              tt.name AS ticket_name, oi.price, oi.status AS item_status,
              v.name AS visitor_name, v.id_card_mask AS visitor_id_card,
              p.transaction_id
         FROM order_item oi
         JOIN orders o ON o.id = oi.order_id
         LEFT JOIN reservation r ON r.id = o.reservation_id
         LEFT JOIN time_slot ts ON ts.id = r.time_slot_id
         LEFT JOIN visitor v ON v.id = oi.visitor_id
         LEFT JOIN ticket_type tt ON tt.id = oi.ticket_type_id
         LEFT JOIN payment p ON p.order_id = o.id AND p.status = 2
        WHERE ${areaCondition(areaId, 'o.scenic_area_id').sql} AND DATE(o.created_at) BETWEEN ? AND ?
        ORDER BY o.id DESC
        LIMIT ?`,
      [...areaCondition(areaId, 'o.scenic_area_id').params, start, end, ExportService.MAX_ROWS],
    );

    return this.build(`订单明细_${start}_${end}`, rows, [
      { title: '订单号', value: (r) => r.order_no },
      { title: '订单状态', value: (r) => ORDER_STATUS[r.status as number] ?? r.status },
      { title: '订单金额(元)', value: (r) => this.yuan(r.amount) },
      { title: '渠道', value: (r) => ORDER_CHANNEL[r.channel as string] ?? r.channel },
      { title: '下单时间', value: (r) => this.time(r.created_at) },
      { title: '支付时间', value: (r) => this.time(r.pay_time) },
      { title: '微信支付单号', value: (r) => r.transaction_id },
      { title: '入园日期', value: (r) => r.visit_date },
      { title: '入园时段', value: (r) => r.slot_name },
      { title: '票种', value: (r) => r.ticket_name },
      { title: '单价(元)', value: (r) => this.yuan(r.price) },
      { title: '明细状态', value: (r) => ITEM_STATUS[r.item_status as number] ?? r.item_status },
      { title: '游客姓名', value: (r) => r.visitor_name },
      { title: '证件号(脱敏)', value: (r) => r.visitor_id_card },
    ]);
  }

  /** 核销记录导出 */
  async verifications(areaId: number | undefined, start: string, end: string): Promise<CsvFile> {
    const rows: Record<string, any>[] = await this.dataSource.query(
      `SELECT v.verify_time, v.channel, v.gate_id, v.operator_id,
              o.order_no, r.date AS visit_date, ts.name AS slot_name,
              tt.name AS ticket_name, vi.name AS visitor_name, vi.id_card_mask
         FROM verification v
         JOIN reservation r ON r.id = v.reservation_id
         JOIN orders o ON o.id = r.order_id
         LEFT JOIN time_slot ts ON ts.id = r.time_slot_id
         LEFT JOIN order_item oi ON oi.id = v.order_item_id
         LEFT JOIN ticket_type tt ON tt.id = oi.ticket_type_id
         LEFT JOIN visitor vi ON vi.id = oi.visitor_id
        WHERE ${areaCondition(areaId, 'r.scenic_area_id').sql} AND DATE(v.verify_time) BETWEEN ? AND ?
        ORDER BY v.id DESC
        LIMIT ?`,
      [...areaCondition(areaId, 'r.scenic_area_id').params, start, end, ExportService.MAX_ROWS],
    );

    return this.build(`核销记录_${start}_${end}`, rows, [
      { title: '核销时间', value: (r) => this.time(r.verify_time) },
      { title: '核销渠道', value: (r) => VERIFY_CHANNEL[r.channel as string] ?? r.channel },
      { title: '订单号', value: (r) => r.order_no },
      { title: '入园日期', value: (r) => r.visit_date },
      { title: '入园时段', value: (r) => r.slot_name },
      { title: '票种', value: (r) => r.ticket_name },
      { title: '游客姓名', value: (r) => r.visitor_name },
      { title: '证件号(脱敏)', value: (r) => r.id_card_mask },
      { title: '闸机ID', value: (r) => r.gate_id ?? '（手动核销）' },
      { title: '操作人ID', value: (r) => r.operator_id ?? '（闸机核销）' },
    ]);
  }

  /** 通行记录导出 */
  async passages(areaId: number | undefined, start: string, end: string): Promise<CsvFile> {
    const rows: Record<string, any>[] = await this.dataSource.query(
      `SELECT p.passed_at, p.direction, p.result, p.reject_reason, p.gate_id, p.reservation_id,
              g.gate_no, g.name AS gate_name
         FROM passage_record p
         LEFT JOIN gate_device g ON g.id = p.gate_id
        WHERE ${areaCondition(areaId, 'p.scenic_area_id').sql} AND DATE(p.passed_at) BETWEEN ? AND ?
        ORDER BY p.id DESC
        LIMIT ?`,
      [...areaCondition(areaId, 'p.scenic_area_id').params, start, end, ExportService.MAX_ROWS],
    );

    return this.build(`通行记录_${start}_${end}`, rows, [
      { title: '通行时间', value: (r) => this.time(r.passed_at) },
      { title: '方向', value: (r) => (r.direction === 1 ? '入园' : '出园') },
      { title: '结果', value: (r) => PASSAGE_RESULT[r.result as number] ?? r.result },
      { title: '拒绝原因', value: (r) => r.reject_reason },
      { title: '闸机编号', value: (r) => r.gate_no },
      { title: '闸机名称', value: (r) => r.gate_name },
      { title: '预约ID', value: (r) => r.reservation_id },
    ]);
  }

  /** 退款单导出 */
  async refunds(areaId: number | undefined, start: string, end: string): Promise<CsvFile> {
    const rows: Record<string, any>[] = await this.dataSource.query(
      `SELECT f.refund_no, f.status, f.amount, f.actual_amount, f.fee, f.reason,
              f.created_at, f.audited_at, f.refunded_at, f.wx_refund_id,
              o.order_no, o.amount AS order_amount
         FROM refund f
         JOIN orders o ON o.id = f.order_id
        WHERE ${areaCondition(areaId, 'o.scenic_area_id').sql} AND DATE(f.created_at) BETWEEN ? AND ?
        ORDER BY f.id DESC
        LIMIT ?`,
      [...areaCondition(areaId, 'o.scenic_area_id').params, start, end, ExportService.MAX_ROWS],
    );

    return this.build(`退款单_${start}_${end}`, rows, [
      { title: '退款单号', value: (r) => r.refund_no },
      { title: '订单号', value: (r) => r.order_no },
      { title: '订单金额(元)', value: (r) => this.yuan(r.order_amount) },
      { title: '申请金额(元)', value: (r) => this.yuan(r.amount) },
      { title: '手续费(元)', value: (r) => this.yuan(r.fee) },
      { title: '实退金额(元)', value: (r) => this.yuan(r.actual_amount) },
      { title: '状态', value: (r) => REFUND_STATUS[r.status as number] ?? r.status },
      { title: '退款原因', value: (r) => r.reason },
      { title: '申请时间', value: (r) => this.time(r.created_at) },
      { title: '审核时间', value: (r) => this.time(r.audited_at) },
      { title: '退款完成时间', value: (r) => this.time(r.refunded_at) },
      { title: '微信退款单号', value: (r) => r.wx_refund_id },
    ]);
  }

  /** 日统计导出（经营报表） */
  async daily(areaId: number | undefined, start: string, end: string): Promise<CsvFile> {
    const rows: Record<string, any>[] = await this.dataSource.query(
      `SELECT * FROM daily_stats WHERE ${areaCondition(areaId, 'scenic_area_id').sql} AND date BETWEEN ? AND ? ORDER BY date`,
      [...areaCondition(areaId, 'scenic_area_id').params, start, end],
    );

    return this.build(`经营日报_${start}_${end}`, rows, [
      { title: '日期', value: (r) => r.date },
      { title: '预约人数', value: (r) => r.reservations },
      { title: '核销人数', value: (r) => r.verifications },
      { title: '入园人次', value: (r) => r.in_count },
      { title: '出园人次', value: (r) => r.out_count },
      { title: '实收(元)', value: (r) => this.yuan(r.income) },
      { title: '退款(元)', value: (r) => this.yuan(r.refund_amount) },
      { title: '支付订单数', value: (r) => r.orders_paid },
      { title: '退款订单数', value: (r) => r.orders_refund },
    ]);
  }

  // ==================== 内部 ====================

  /** 生成 CSV（含 BOM，Excel 打开不乱码） */
  private build(fileName: string, rows: Record<string, any>[], columns: Column[]): CsvFile {
    const header = columns.map((c) => this.escape(c.title)).join(',');
    const lines = rows.map((row) =>
      columns.map((c) => this.escape(c.value(row))).join(','),
    );
    const csv = [header, ...lines].join('\r\n');
    return {
      fileName: `${fileName}.csv`,
      content: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(csv, 'utf8')]),
    };
  }

  /** CSV 转义：含逗号/引号/换行时加引号 */
  private escape(value: unknown): string {
    if (value === null || value === undefined) return '';
    const s = String(value);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  /** 分 → 元（保留两位小数） */
  private yuan(cents: unknown): string {
    if (cents === null || cents === undefined) return '';
    return (Number(cents) / 100).toFixed(2);
  }

  /** 时间格式化（本地时区 yyyy-MM-dd HH:mm:ss） */
  private time(value: unknown): string {
    if (!value) return '';
    const d = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(d.getTime())) return String(value);
    const p = (n: number) => `${n}`.padStart(2, '0');
    return (
      `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
      `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    );
  }
}

const ORDER_STATUS: Record<number, string> = {
  10: '待支付',
  20: '待核销',
  30: '部分核销',
  40: '已核销',
  50: '已取消',
  60: '已退款',
  70: '已过期',
};

const ITEM_STATUS: Record<number, string> = { 10: '待核销', 20: '已核销', 30: '已退款' };
const ORDER_CHANNEL: Record<string, string> = { mini: '小程序', ota: 'OTA', window: '窗口' };
const VERIFY_CHANNEL: Record<string, string> = { gate: '闸机', pda: '扫码', manual: '手动' };
const PASSAGE_RESULT: Record<number, string> = { 1: '通过', 2: '拒绝', 3: '异常', 4: '应急放行' };
const REFUND_STATUS: Record<number, string> = {
  10: '待审核',
  20: '退款中',
  30: '已退款',
  40: '已拒绝',
  50: '退款失败',
};
