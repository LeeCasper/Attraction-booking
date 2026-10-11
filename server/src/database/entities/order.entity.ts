import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('orders')
export class Orders {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  /** 业务单号，下单时生成，作为微信支付 out_trade_no */
  @Column({ name: 'order_no', length: 32 })
  orderNo: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ name: 'scenic_area_id', type: 'bigint' })
  scenicAreaId: number;

  @Column({ name: 'reservation_id', type: 'bigint', nullable: true })
  reservationId: number | null;

  /** 实付金额，单位：分 */
  @Column({ type: 'int' })
  amount: number;

  /** OrderStatus */
  @Column({ type: 'tinyint' })
  status: number;

  /** mini / ota / window */
  @Column({ length: 16, default: 'mini' })
  channel: string;

  /** 支付截止时间（下单 + 15 分钟） */
  @Column({ name: 'pay_deadline', type: 'datetime' })
  payDeadline: Date;

  @Column({ name: 'pay_time', type: 'datetime', nullable: true })
  payTime: Date | null;

  @Column({ name: 'cancel_reason', type: 'varchar', length: 255, nullable: true })
  cancelReason: string | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

@Entity('order_item')
export class OrderItem {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'order_id', type: 'bigint' })
  orderId: number;

  @Column({ name: 'visitor_id', type: 'bigint' })
  visitorId: number;

  @Column({ name: 'ticket_type_id', type: 'bigint' })
  ticketTypeId: number;

  /** 成交价快照（分），来自价格日历或票种基础价 */
  @Column({ type: 'int' })
  price: number;

  /** OrderItemStatus */
  @Column({ type: 'tinyint', default: 10 })
  status: number;

  @Column({ name: 'refund_id', type: 'bigint', nullable: true })
  refundId: number | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

@Entity('reservation')
export class Reservation {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'order_id', type: 'bigint' })
  orderId: number;

  @Column({ name: 'scenic_area_id', type: 'bigint' })
  scenicAreaId: number;

  /** yyyy-MM-dd */
  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'time_slot_id', type: 'bigint' })
  timeSlotId: number;

  /** ReservationStatus */
  @Column({ type: 'tinyint', default: 10 })
  status: number;

  /** 已核销人数 */
  @Column({ name: 'verify_count', type: 'int', default: 0 })
  verifyCount: number;

  /** 应核销人数 */
  @Column({ name: 'total_count', type: 'int' })
  totalCount: number;

  /**
   * 凭证号（**展示用**，随机、不可猜，落库带唯一索引）。
   *
   * 老数据可能为空（库是后加的列，见 `scripts/backfill-credential-no.ts`）——
   * 客户端拿不到就整行不显示，不是错误。
   */
  @Column({ name: 'credential_no', type: 'varchar', length: 24, nullable: true })
  credentialNo: string | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
