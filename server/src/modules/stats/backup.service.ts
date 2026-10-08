import { createGzip } from 'zlib';
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { pipeline } from 'stream/promises';
import { spawn } from 'child_process';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataBackup } from '../../database/entities/m4.entity';

/** 备份保留天数 */
const KEEP_DAYS = 30;

/**
 * 数据备份（PRD A-075）
 *
 * 用 mysqldump 导出全库并 gzip 压缩，备份记录落 data_backup 表。
 * 保留最近 30 天，过期文件自动清理。
 *
 * 恢复不提供 API —— 覆盖生产库是高危操作，应由人工执行：
 *   gunzip -c <备份文件> | mysql -u<user> -p <database>
 * 详见 docs/部署与运维.md 的恢复演练步骤。
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private running = false;

  constructor(
    @InjectRepository(DataBackup) private readonly repo: Repository<DataBackup>,
    private readonly config: ConfigService,
  ) {}

  /** 备份目录（默认项目根下的 backups/） */
  private get backupDir(): string {
    const dir = this.config.get<string>('backup.dir') ?? './backups';
    const abs = resolve(dir);
    if (!existsSync(abs)) mkdirSync(abs, { recursive: true });
    return abs;
  }

  /**
   * 执行备份
   *
   * @param type auto（定时）/ manual（管理端手动）
   */
  async run(type: 'auto' | 'manual', operatorId?: number) {
    if (this.running) {
      return { skipped: true, reason: '已有备份任务在执行' };
    }
    this.running = true;

    const stamp = this.timestamp();
    const fileName = `attraction_booking_${stamp}.sql.gz`;
    const filePath = join(this.backupDir, fileName);

    const record = await this.repo.save(
      this.repo.create({
        fileName,
        filePath,
        type,
        status: 10,
        createdBy: operatorId ?? null,
        startedAt: new Date(),
      }),
    );

    try {
      await this.dump(filePath);
      const size = statSync(filePath).size;

      await this.repo.update(record.id, {
        status: 20,
        fileSize: size,
        finishedAt: new Date(),
        remark: `备份成功（${(size / 1024 / 1024).toFixed(2)} MB）`,
      });
      this.logger.log(`数据库备份完成：${fileName}（${(size / 1024 / 1024).toFixed(2)} MB）`);

      const cleaned = await this.cleanup();
      if (cleaned > 0) this.logger.log(`已清理 ${cleaned} 个过期备份文件`);

      return { id: Number(record.id), fileName, fileSize: size, status: 20 };
    } catch (err) {
      await this.repo.update(record.id, {
        status: 30,
        finishedAt: new Date(),
        remark: `备份失败：${(err as Error).message}`,
      });
      this.logger.error(`数据库备份失败：${(err as Error).message}`);
      throw err;
    } finally {
      this.running = false;
    }
  }

  /** 备份记录列表 */
  async list(page: number, pageSize: number) {
    const [items, total] = await this.repo.findAndCount({
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items, total };
  }

  /** 下载备份文件（管理端导出到本地） */
  async fileOf(id: number): Promise<{ fileName: string; path: string }> {
    const record = await this.repo.findOne({ where: { id } });
    if (!record) throw new NotFoundException('备份记录不存在');
    if (!existsSync(record.filePath)) throw new NotFoundException('备份文件已不存在（可能已被清理）');
    return { fileName: record.fileName, path: record.filePath };
  }

  // ==================== 内部 ====================

  /** 调 mysqldump 并 gzip 落盘 */
  private async dump(targetPath: string): Promise<void> {
    const dumpBin = this.resolveDumpBin();
    const args = [
      `-h${this.config.get<string>('db.host')}`,
      `-P${this.config.get<number>('db.port')}`,
      `-u${this.config.get<string>('db.user')}`,
      `-p${this.config.get<string>('db.password')}`,
      '--single-transaction', // 一致性快照，不锁表
      '--routines',
      '--triggers',
      '--default-character-set=utf8mb4',
      this.config.get<string>('db.database')!,
    ];

    const child = spawn(dumpBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    const done = new Promise<void>((resolvePromise, reject) => {
      child.on('error', (err) => reject(new Error(`启动 mysqldump 失败：${err.message}`)));
      child.on('close', (code) => {
        // mysqldump 会把密码警告写到 stderr，只看退出码
        if (code === 0) resolvePromise();
        else reject(new Error(`mysqldump 退出码 ${code}：${stderr.trim().slice(0, 300)}`));
      });
    });

    await pipeline(child.stdout!, createGzip({ level: 6 }), createWriteStream(targetPath));
    await done;
  }

  /** 解析 mysqldump 可执行文件路径（容器部署时可指向 docker exec 包装脚本） */
  private resolveDumpBin(): string {
    const configured = this.config.get<string>('backup.dumpBin');
    if (configured) return configured;
    return existsSync('/opt/mysql/bin/mysqldump') ? '/opt/mysql/bin/mysqldump' : 'mysqldump';
  }

  /** 清理超过保留期的备份文件 */
  private async cleanup(): Promise<number> {
    const dir = this.backupDir;
    const cutoff = Date.now() - KEEP_DAYS * 86400 * 1000;
    let removed = 0;

    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.sql.gz')) continue;
      const full = join(dir, name);
      if (statSync(full).mtimeMs < cutoff) {
        unlinkSync(full);
        removed++;
      }
    }
    return removed;
  }

  private timestamp(): string {
    const d = new Date();
    const p = (n: number) => `${n}`.padStart(2, '0');
    return (
      `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_` +
      `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
    );
  }
}
