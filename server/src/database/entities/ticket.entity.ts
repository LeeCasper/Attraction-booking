import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('ticket_type')
export class TicketType {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'scenic_area_id', type: 'bigint' })
  scenicAreaId: number;

  @Column({ length: 64 })
  name: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  audience: string | null;

  /** 分 */
  @Column({ name: 'base_price', type: 'int', default: 0 })
  basePrice: number;

  @Column({ name: 'refund_rule', type: 'json', nullable: true })
  refundRule: Record<string, unknown> | null;

  @Column({ name: 'need_realname', type: 'tinyint', default: 1 })
  needRealname: number;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  remark: string | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

@Entity('time_slot')
export class TimeSlot {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'scenic_area_id', type: 'bigint' })
  scenicAreaId: number;

  @Column({ length: 32 })
  name: string;

  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

@Entity('price_calendar')
export class PriceCalendar {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'ticket_type_id', type: 'bigint' })
  ticketTypeId: number;

  @Column({ type: 'date' })
  date: string;

  /** 分 */
  @Column({ type: 'int' })
  price: number;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

@Entity('ticket_stock')
export class TicketStock {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'scenic_area_id', type: 'bigint' })
  scenicAreaId: number;

  @Column({ name: 'ticket_type_id', type: 'bigint' })
  ticketTypeId: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'time_slot_id', type: 'bigint' })
  timeSlotId: number;

  @Column({ type: 'int' })
  total: number;

  @Column({ type: 'int', default: 0 })
  sold: number;

  @Column({ type: 'int', default: 0 })
  locked: number;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

@Entity('stock_change_log')
export class StockChangeLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'ticket_stock_id', type: 'bigint' })
  ticketStockId: number;

  @Column({ name: 'change_type', length: 16 })
  changeType: string;

  @Column({ name: 'change_value', type: 'int' })
  changeValue: number;

  @Column({ name: 'before_value', type: 'int' })
  beforeValue: number;

  @Column({ name: 'after_value', type: 'int' })
  afterValue: number;

  @Column({ name: 'operator_id', type: 'bigint', nullable: true })
  operatorId: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  remark: string | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
