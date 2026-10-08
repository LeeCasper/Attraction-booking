import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** append-only：禁止任何更新路径 */
@Entity('operation_log')
export class OperationLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'admin_id', type: 'bigint' })
  adminId: number;

  @Column({ length: 64 })
  action: string;

  @Column({ name: 'target_type', type: 'varchar', length: 32, nullable: true })
  targetType: string | null;

  @Column({ name: 'target_id', type: 'bigint', nullable: true })
  targetId: number | null;

  @Column({ type: 'json', nullable: true })
  detail: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ name: 'created_at', type: 'datetime', precision: 3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;
}

@Entity('sys_config')
export class SysConfig {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'config_key', length: 64 })
  configKey: string;

  @Column({ name: 'config_value', type: 'json' })
  configValue: Record<string, unknown>;

  @Column({ type: 'varchar', length: 255, nullable: true })
  remark: string | null;

  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
