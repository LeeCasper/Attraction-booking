import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 核销记录：order_item_id 唯一索引 = 一人一票只能核销一次的最终防线 */
@Entity('verification')
export class Verification {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'reservation_id', type: 'bigint' })
  reservationId: number;

  @Column({ name: 'order_item_id', type: 'bigint' })
  orderItemId: number;

  /** gate / pda / manual */
  @Column({ length: 16 })
  channel: string;

  @Column({ name: 'gate_id', type: 'bigint', nullable: true })
  gateId: number | null;

  /** 手动核销时的检票员 */
  @Column({ name: 'operator_id', type: 'bigint', nullable: true })
  operatorId: number | null;

  @Column({ name: 'verify_time', type: 'datetime', precision: 3 })
  verifyTime: Date;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}

@Entity('passage_record')
export class PassageRecord {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'reservation_id', type: 'bigint', nullable: true })
  reservationId: number | null;

  @Column({ name: 'scenic_area_id', type: 'bigint' })
  scenicAreaId: number;

  @Column({ name: 'gate_id', type: 'bigint' })
  gateId: number;

  /** 凭证摘要（脱敏） */
  @Column({ type: 'varchar', length: 128, nullable: true })
  credential: string | null;

  /** 1 入园 / 2 出园 */
  @Column({ type: 'tinyint' })
  direction: number;

  /** 1 通过 / 2 拒绝 / 3 异常 / 4 应急放行 */
  @Column({ type: 'tinyint' })
  result: number;

  @Column({ name: 'reject_reason', type: 'varchar', length: 32, nullable: true })
  rejectReason: string | null;

  @Column({ name: 'passed_at', type: 'datetime', precision: 3 })
  passedAt: Date;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}

@Entity('alarm')
export class Alarm {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  /** gate_offline / tailgate / force_pass / duplicate_verify / capacity_* */
  @Column({ length: 32 })
  type: string;

  @Column({ name: 'gate_id', type: 'bigint', nullable: true })
  gateId: number | null;

  @Column({ name: 'scenic_area_id', type: 'bigint', nullable: true })
  scenicAreaId: number | null;

  /** 1 提示 / 2 警告 / 3 严重 */
  @Column({ type: 'tinyint', default: 2 })
  level: number;

  /** 10 未处理 / 20 已处理 */
  @Column({ type: 'tinyint', default: 10 })
  status: number;

  @Column({ length: 512 })
  content: string;

  @Column({ name: 'handled_by', type: 'bigint', nullable: true })
  handledBy: number | null;

  @Column({ name: 'handled_remark', type: 'varchar', length: 255, nullable: true })
  handledRemark: string | null;

  @Column({ name: 'handled_at', type: 'datetime', nullable: true })
  handledAt: Date | null;

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
