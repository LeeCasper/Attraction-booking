import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('payment')
export class Payment {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'order_id', type: 'bigint' })
  orderId: number;

  /** 微信支付单号 */
  @Column({ name: 'transaction_id', type: 'varchar', length: 64, nullable: true })
  transactionId: string | null;

  /** 支付金额（分） */
  @Column({ type: 'int' })
  amount: number;

  /** PaymentStatus：1支付中 2成功 3失败 4已关闭 */
  @Column({ type: 'tinyint', default: 1 })
  status: number;

  /** 微信回调原始报文（对账与纠纷追溯依据） */
  @Column({ name: 'raw_callback', type: 'json', nullable: true })
  rawCallback: Record<string, unknown> | null;

  @Column({ name: 'callback_time', type: 'datetime', nullable: true })
  callbackTime: Date | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

@Entity('refund')
export class Refund {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  /** 退款单号，作为微信支付 out_refund_no */
  @Column({ name: 'refund_no', length: 32 })
  refundNo: string;

  @Column({ name: 'order_id', type: 'bigint' })
  orderId: number;

  /** 按人退款时非空；为空表示整单退款 */
  @Column({ name: 'order_item_id', type: 'bigint', nullable: true })
  orderItemId: number | null;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  /** 申请退款金额（分） */
  @Column({ type: 'int' })
  amount: number;

  /** 实退金额（扣手续费后，分） */
  @Column({ name: 'actual_amount', type: 'int', nullable: true })
  actualAmount: number | null;

  /** 手续费（分） */
  @Column({ type: 'int', default: 0 })
  fee: number;

  @Column({ length: 255 })
  reason: string;

  /** RefundStatus */
  @Column({ type: 'tinyint', default: 10 })
  status: number;

  @Column({ name: 'audit_by', type: 'bigint', nullable: true })
  auditBy: number | null;

  @Column({ name: 'audit_remark', type: 'varchar', length: 255, nullable: true })
  auditRemark: string | null;

  /** 微信退款单号 */
  @Column({ name: 'wx_refund_id', type: 'varchar', length: 64, nullable: true })
  wxRefundId: string | null;

  @Column({ name: 'audited_at', type: 'datetime', nullable: true })
  auditedAt: Date | null;

  @Column({ name: 'refunded_at', type: 'datetime', nullable: true })
  refundedAt: Date | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
