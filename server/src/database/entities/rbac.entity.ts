import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('role')
export class Role {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 32 })
  name: string;

  @Column({ length: 32 })
  code: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  remark: string | null;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

@Entity('admin_role')
export class AdminRole {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'admin_id', type: 'bigint' })
  adminId: number;

  @Column({ name: 'role_id', type: 'bigint' })
  roleId: number;
}

@Entity('role_permission')
export class RolePermission {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'role_id', type: 'bigint' })
  roleId: number;

  @Column({ length: 64 })
  permission: string;
}
