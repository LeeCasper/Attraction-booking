import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('gate_device')
export class GateDevice {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'scenic_area_id', type: 'bigint' })
  scenicAreaId: number;

  @Column({ name: 'gate_no', length: 32 })
  gateNo: string;

  @Column({ length: 64 })
  name: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  location: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  /** http / mqtt / tcp / sdk —— 一期统一走 http（模拟器） */
  @Column({ length: 16, default: 'http' })
  protocol: string;

  /** 1 入 / 2 出 / 3 双向 */
  @Column({ type: 'tinyint', default: 1 })
  direction: number;

  /** 1 在线 / 2 离线 / 3 禁用 / 4 故障 */
  @Column({ type: 'tinyint', default: 2 })
  status: number;

  @Column({ name: 'last_heartbeat', type: 'datetime', precision: 3, nullable: true })
  lastHeartbeat: Date | null;

  /** 闸机级签名密钥（HMAC） */
  @Column({ name: 'secret_key', length: 128 })
  secretKey: string;

  /** 通行规则缓存：允许时段/票种 */
  @Column({ name: 'allowed_slots', type: 'json', nullable: true })
  allowedSlots: Record<string, unknown> | null;

  @Column({ name: 'firmware_version', type: 'varchar', length: 32, nullable: true })
  firmwareVersion: string | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

@Entity('gate_log')
export class GateLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'gate_id', type: 'bigint', nullable: true })
  gateId: number | null;

  /** verify / heartbeat / passage / command / alarm */
  @Column({ length: 32 })
  action: string;

  @Column({ type: 'json', nullable: true })
  request: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true })
  response: Record<string, unknown> | null;

  @Column({ name: 'cost_ms', type: 'int', nullable: true })
  costMs: number | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}

@Entity('gate_command')
export class GateCommand {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'gate_id', type: 'bigint' })
  gateId: number;

  /** 幂等键：同一指令号重复到达只执行一次 */
  @Column({ name: 'command_no', length: 64 })
  commandNo: string;

  /** open / hold_open / close / reboot */
  @Column({ length: 16 })
  type: string;

  /** 10 已下发 / 20 已执行 / 30 超时失败 */
  @Column({ type: 'tinyint', default: 10 })
  status: number;

  @Column({ name: 'issued_by', type: 'bigint', nullable: true })
  issuedBy: number | null;

  @Column({ name: 'sent_at', type: 'datetime', precision: 3 })
  sentAt: Date;

  @Column({ name: 'ack_at', type: 'datetime', precision: 3, nullable: true })
  ackAt: Date | null;
}

@Entity('offline_sync_record')
export class OfflineSyncRecord {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'gate_id', type: 'bigint' })
  gateId: number;

  @Column({ name: 'batch_no', length: 64 })
  batchNo: string;

  @Column({ type: 'json' })
  payload: Record<string, unknown>;

  /** 10 待处理 / 20 已合并 / 30 冲突待审核 */
  @Column({ name: 'sync_status', type: 'tinyint', default: 10 })
  syncStatus: number;

  @Column({ name: 'conflict_note', type: 'varchar', length: 255, nullable: true })
  conflictNote: string | null;

  @Column({ name: 'synced_at', type: 'datetime' })
  syncedAt: Date;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
