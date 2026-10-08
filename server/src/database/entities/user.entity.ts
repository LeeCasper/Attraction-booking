import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('user')
export class User {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 64 })
  openid: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  unionid: string | null;

  /** 手机号 AES-256-GCM 密文 */
  @Column({ name: 'phone_enc', type: 'varchar', length: 255, nullable: true })
  phoneEnc: string | null;

  /** 手机号哈希（查重/登录用，不还原明文） */
  @Column({ name: 'phone_hash', type: 'varchar', length: 64, nullable: true })
  phoneHash: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  nickname: string | null;

  /** 1 正常 / 2 禁用 */
  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

@Entity('visitor')
export class Visitor {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ length: 64 })
  name: string;

  /** 身份证 AES-256-GCM 密文 */
  @Column({ name: 'id_card_enc', type: 'varchar', length: 255 })
  idCardEnc: string;

  /** 身份证哈希（限购、黑名单、核验比对） */
  @Column({ name: 'id_card_hash', type: 'varchar', length: 64 })
  idCardHash: string;

  /** 脱敏展示，如 110***********1234 */
  @Column({ name: 'id_card_mask', type: 'varchar', length: 32, nullable: true })
  idCardMask: string | null;

  @Column({ name: 'phone_enc', type: 'varchar', length: 255, nullable: true })
  phoneEnc: string | null;

  @Column({ name: 'is_default', type: 'tinyint', default: 0 })
  isDefault: number;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

@Entity('blacklist')
export class Blacklist {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  /** 1 身份证 / 2 手机号 / 3 用户 */
  @Column({ type: 'tinyint', default: 1 })
  type: number;

  @Column({ name: 'value_hash', length: 64 })
  valueHash: string;

  @Column({ name: 'value_mask', type: 'varchar', length: 64, nullable: true })
  valueMask: string | null;

  @Column({ length: 255 })
  reason: string;

  @Column({ name: 'expire_time', type: 'datetime', nullable: true })
  expireTime: Date | null;

  /** 1 生效 / 2 解除 */
  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: number | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
