import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('admin_user')
export class AdminUser {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 32 })
  username: string;

  @Column({ length: 128 })
  password: string;

  @Column({ name: 'real_name', type: 'varchar', length: 32, nullable: true })
  realName: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @Column({ name: 'last_login_at', type: 'datetime', nullable: true })
  lastLoginAt: Date | null;

  @Column({ name: 'last_login_ip', type: 'varchar', length: 64, nullable: true })
  lastLoginIp: string | null;

  @Column({ name: 'pwd_fail_count', type: 'int', default: 0 })
  pwdFailCount: number;

  @Column({ name: 'pwd_locked_until', type: 'datetime', nullable: true })
  pwdLockedUntil: Date | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
