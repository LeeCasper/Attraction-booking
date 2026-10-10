import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 对账记录：订单 / 支付流水 / 退款 三方核对结果 */
@Entity('reconciliation')
export class Reconciliation {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'date' })
  date: string;

  /**
   * 所属景区。对账是**按景区**跑的，这一列是唯一键的一部分 ——
   * 少了它，定时任务遍历所有景区时后一个景区会**覆盖**前一个的记录。
   */
  @Column({ name: 'scenic_area_id', type: 'bigint' })
  scenicAreaId: number;

  /** wxpay / alipay / ota */
  @Column({ length: 16, default: 'wxpay' })
  channel: string;

  @Column({ name: 'order_count', type: 'int', default: 0 })
  orderCount: number;

  /** 订单侧金额（分） */
  @Column({ name: 'order_amount', type: 'bigint', default: 0 })
  orderAmount: number;

  @Column({ name: 'payment_count', type: 'int', default: 0 })
  paymentCount: number;

  @Column({ name: 'payment_amount', type: 'bigint', default: 0 })
  paymentAmount: number;

  @Column({ name: 'refund_count', type: 'int', default: 0 })
  refundCount: number;

  @Column({ name: 'refund_amount', type: 'bigint', default: 0 })
  refundAmount: number;

  @Column({ name: 'diff_count', type: 'int', default: 0 })
  diffCount: number;

  @Column({ name: 'diff_detail', type: 'json', nullable: true })
  diffDetail: Record<string, unknown> | null;

  /** 10 无差异 / 20 存在差异 / 30 核对失败 */
  @Column({ type: 'tinyint', default: 10 })
  status: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  remark: string | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}

/** 数据备份记录 */
@Entity('data_backup')
export class DataBackup {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'file_name', length: 128 })
  fileName: string;

  @Column({ name: 'file_path', length: 512 })
  filePath: string;

  /** 字节 */
  @Column({ name: 'file_size', type: 'bigint', default: 0 })
  fileSize: number;

  /** auto / manual */
  @Column({ length: 16, default: 'auto' })
  type: string;

  /** 10 进行中 / 20 成功 / 30 失败 */
  @Column({ type: 'tinyint', default: 10 })
  status: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  remark: string | null;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: number | null;

  @Column({ name: 'started_at', type: 'datetime' })
  startedAt: Date;

  @Column({ name: 'finished_at', type: 'datetime', nullable: true })
  finishedAt: Date | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
