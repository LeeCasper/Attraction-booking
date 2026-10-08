import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('scenic_area')
export class ScenicArea {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 128 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ type: 'text', nullable: true })
  intro: string | null;

  @Column({ name: 'cover_url', type: 'varchar', length: 512, nullable: true })
  coverUrl: string | null;

  @Column({ name: 'open_time', type: 'varchar', length: 64, nullable: true })
  openTime: string | null;

  @Column({ name: 'max_capacity', type: 'int', default: 10000 })
  maxCapacity: number;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

@Entity('announcement')
export class Announcement {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'scenic_area_id', type: 'bigint' })
  scenicAreaId: number;

  @Column({ length: 128 })
  title: string;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @Column({ name: 'published_at', type: 'datetime', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
