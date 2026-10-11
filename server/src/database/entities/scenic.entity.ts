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

  /** 封面（相对路径）：景点列表卡 / 首页「推荐景点」卡用 */
  @Column({ name: 'cover_url', type: 'varchar', length: 512, nullable: true })
  coverUrl: string | null;

  /** 缩略图（相对路径，建议方图）：购票页头卡用；空则回落到 `coverUrl` */
  @Column({ name: 'thumbnail_url', type: 'varchar', length: 512, nullable: true })
  thumbnailUrl: string | null;

  @Column({ name: 'open_time', type: 'varchar', length: 64, nullable: true })
  openTime: string | null;

  @Column({ name: 'max_capacity', type: 'int', default: 10000 })
  maxCapacity: number;

  /**
   * 景点分类：`main` 主景区 / `nature` 自然风光 / `culture` 历史人文 /
   * `cable` 索道缆车 / `night` 夜游演艺；NULL = 未分类（小程序端只在「全部景点」里出现）。
   * 联合类型必须显式写 `type`，否则 TypeORM 推断成 Object 会报 DataTypeNotSupportedError。
   */
  @Column({ name: 'category', type: 'varchar', length: 16, nullable: true })
  category: string | null;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

/**
 * 首页轮播图。
 *
 * **与景点解耦**：后台「内容管理 → 首页轮播图」单独维护一组（增删/排序/启停），
 * 每张可选跳转到某个景点 —— 有跳转时，小程序那屏显示该景点的名字与在园率、点了进它的购票页；
 * 没有跳转时显示这张图自己的标题/副标题，且**不可点**（它只是一张公告图）。
 */
@Entity('banner')
export class Banner {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  subtitle: string | null;

  /** 轮播图（相对路径 `/uploads/x.jpg`） */
  @Column({ name: 'image_url', type: 'varchar', length: 512 })
  imageUrl: string;

  /** 跳转景点；NULL = 不跳转 */
  @Column({ name: 'scenic_area_id', type: 'bigint', nullable: true })
  scenicAreaId: number | null;

  /** 排序：小的在前 */
  @Column({ type: 'int', default: 0 })
  sort: number;

  /** 1 启用 / 2 停用 */
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
