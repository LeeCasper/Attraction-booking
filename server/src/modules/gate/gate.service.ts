import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { GateCommand, GateDevice, GateLog, OfflineSyncRecord } from '../../database/entities/gate.entity';
import { Alarm, PassageRecord } from '../../database/entities/verify.entity';
import { Reservation } from '../../database/entities/order.entity';
import { Blacklist } from '../../database/entities/user.entity';
import { CredentialService } from '../verify/credential.service';
import { VerifyService } from '../verify/verify.service';
import { randomBytes } from 'crypto';
import { businessToday } from '../../common/utils/date.util';

/** 心跳超时判定（秒）：超过该时长未心跳即视为离线 */
const HEARTBEAT_TIMEOUT_SECONDS = 90;

@Injectable()
export class GateService {
  private readonly logger = new Logger(GateService.name);

  constructor(
    @InjectRepository(GateDevice) private readonly gateRepo: Repository<GateDevice>,
    @InjectRepository(GateLog) private readonly logRepo: Repository<GateLog>,
    @InjectRepository(GateCommand) private readonly commandRepo: Repository<GateCommand>,
    @InjectRepository(OfflineSyncRecord) private readonly syncRepo: Repository<OfflineSyncRecord>,
    @InjectRepository(Alarm) private readonly alarmRepo: Repository<Alarm>,
    @InjectRepository(Reservation) private readonly resRepo: Repository<Reservation>,
    @InjectRepository(Blacklist) private readonly blacklistRepo: Repository<Blacklist>,
    private readonly credential: CredentialService,
    private readonly verifyService: VerifyService,
  ) {}

  // ==================== 心跳 ====================

  /**
   * 心跳上报：更新在线状态与固件版本，返回规则版本号供闸机比对是否需重新拉取
   */
  async heartbeat(gateId: number, body: { firmwareVersion?: string; cachedRuleVersion?: number }) {
    await this.gateRepo.update(gateId, {
      status: 1,
      lastHeartbeat: new Date(),
      firmwareVersion: body.firmwareVersion ?? null,
    });

    const ruleVersion = await this.credential.getRuleVersion();
    const needSyncRules = (body.cachedRuleVersion ?? 0) < ruleVersion;

    return {
      ok: true,
      serverTime: new Date().toISOString(),
      ruleVersion,
      needSyncRules,
      heartbeatInterval: 30
    };
  }

  /**
   * 全量拉取离线核验所需规则（设计文档 §5.2）
   *
   * 闸机断网时靠这些内容本地核验：凭证签名密钥、黑名单、当日预约白名单摘要。
   */
  async getRules(gateId: number) {
    const gate = await this.gateRepo.findOne({ where: { id: gateId } });
    if (!gate) throw new NotFoundException('闸机不存在');

    const today = businessToday();
    const reservations: { id: number }[] = await this.resRepo.manager.query(
      `SELECT r.id FROM reservation r
         JOIN orders o ON o.id = r.order_id
        WHERE r.scenic_area_id = ? AND r.date = ? AND o.status IN (?, ?)`,
      [gate.scenicAreaId, today, 20, 30],
    );

    const blacklistRows: { value_hash: string }[] = await this.blacklistRepo.manager.query(
      `SELECT value_hash FROM blacklist
        WHERE status = 1 AND (expire_time IS NULL OR expire_time > NOW()) LIMIT 5000`,
    );

    await this.gateRepo.update(gateId, {
      allowedSlots: { date: today, reservationIds: reservations.map((r) => r.id) },
    });

    return {
      ruleVersion: await this.credential.getRuleVersion(),
      credential: {
        // 离线验签所需密钥（真机场景应按设备公钥加密下发，模拟器直接明文）
        version: this.credential.currentVersion,
        secret: process.env.CRED_SECRET ?? 'dev-cred-secret',
      },
      date: today,
      reservationIds: reservations.map((r) => r.id),
      blacklistHashes: blacklistRows.map((b) => b.value_hash),
      heartbeatInterval: 30,
    };
  }

  // ==================== 通行与告警 ====================

  /** 通行结果上报（开闸回执 / 出园上报） */
  async reportPassage(
    gateId: number,
    body: {
      reservationId?: number;
      direction: number;
      result: number;
      rejectReason?: string;
      credential?: string;
      passedAt?: string;
    },
  ) {
    return this.verifyService.recordPassageByGate({ gateId, ...body });
  }

  /** 告警上报（尾随 / 强闯 / 消防等） */
  async reportAlarm(
    gateId: number,
    body: { type: string; level?: number; content: string },
  ) {
    const gate = await this.gateRepo.findOne({ where: { id: gateId } });
    if (!gate) throw new NotFoundException('闸机不存在');

    await this.alarmRepo.insert({
      type: body.type,
      gateId,
      scenicAreaId: Number(gate.scenicAreaId),
      level: body.level ?? 2,
      status: 10,
      content: body.content,
      createdAt: new Date(),
    });

    this.logger.warn(`闸机告警 [${body.type}] ${gate.gateNo}：${body.content}`);
    return { ok: true };
  }

  // ==================== 离线记录同步 ====================

  /**
   * 离线记录批量上传（设计文档 §6.4.4）
   *
   * 冲突规则：**以首次核销为准**。离线记录中若该票已在线核销过，标记冲突待人工审核，
   * 绝不重复计数（在园人数与核销数保持一致）。
   */
  async syncOffline(
    gateId: number,
    body: { batchNo: string; records: OfflineRecord[] },
  ) {
    if (!Array.isArray(body.records) || body.records.length === 0) {
      throw new BadRequestException('离线记录为空');
    }

    const merged: number[] = [];
    const conflicts: { reason: string; record: OfflineRecord }[] = [];

    for (const record of body.records) {
      const payload = record.credential ? this.credential.parse(record.credential) : null;
      if (!payload) {
        conflicts.push({ reason: '凭证无法解析', record });
        continue;
      }

      const reservation = await this.resRepo.findOne({ where: { id: payload.rid } });
      if (!reservation) {
        conflicts.push({ reason: '预约不存在', record });
        continue;
      }

      const outcome = await this.verifyService.verifyByCredential(record.credential!, {
        channel: 'gate',
        gateId,
        direction: record.direction ?? 1,
      });

      if (outcome.ok) {
        merged.push(reservation.id);
      } else if (outcome.code === 'ALREADY_VERIFIED') {
        // 已被在线核销覆盖：以首次核销为准，仅记录冲突
        conflicts.push({ reason: '该票已在线核销（以首次核销为准）', record });
      } else {
        conflicts.push({ reason: `${outcome.code}:${outcome.message}`, record });
      }
    }

    const status = conflicts.length > 0 ? 30 : 20;
    await this.syncRepo.insert({
      gateId,
      batchNo: body.batchNo ?? `BATCH-${Date.now()}`,
      payload: { records: body.records } as unknown as QueryDeepPartialEntity<OfflineSyncRecord>['payload'],
      syncStatus: status,
      conflictNote: conflicts.length
        ? `${conflicts.length} 条冲突：${conflicts.map((c) => c.reason).slice(0, 3).join('；')}`
        : null,
      syncedAt: new Date(),
    });

    if (conflicts.length > 0) {
      await this.alarmRepo.insert({
        type: 'offline_conflict',
        gateId,
        level: 2,
        status: 10,
        content: `离线记录同步冲突 ${conflicts.length} 条，待人工审核`,
        createdAt: new Date(),
      });
    }

    return {
      ok: true,
      merged: merged.length,
      conflicts: conflicts.length,
      conflictDetail: conflicts.slice(0, 5).map((c) => ({ reason: c.reason })),
    };
  }

  // ==================== 设备管理（管理端） ====================

  async listDevices(areaId?: number) {
    const devices = await this.gateRepo.find({
      where: areaId ? { scenicAreaId: areaId } : {},
      order: { id: 'ASC' },
    });
    const now = Date.now();
    return devices.map((d) => ({
      ...d,
      secretKey: undefined, // 密钥不下发到前端
      online:
        d.status === 1 &&
        !!d.lastHeartbeat &&
        now - d.lastHeartbeat.getTime() < HEARTBEAT_TIMEOUT_SECONDS * 1000,
      heartbeatAgoSeconds: d.lastHeartbeat
        ? Math.floor((now - d.lastHeartbeat.getTime()) / 1000)
        : null,
    }));
  }

  /** 远程控制：开闸 / 常开 / 常闭 / 重启 */
  async sendCommand(gateId: number, type: string, operatorId: number) {
    const gate = await this.gateRepo.findOne({ where: { id: gateId } });
    if (!gate) throw new NotFoundException('闸机不存在');

    const commandNo = `CMD${Date.now()}${randomBytes(3).toString('hex')}`;
    await this.commandRepo.insert({
      gateId,
      commandNo,
      type,
      status: 10,
      issuedBy: operatorId,
      sentAt: new Date(),
    });

    // 一期为模拟器：指令直接视为已送达，等待闸机 passage 回执置为已执行
    this.logger.log(`下发指令 ${type} → ${gate.gateNo}（${commandNo}）`);
    return { commandNo, type, status: 10 };
  }

  /** 设备通信日志 */
  async listGateLogs(gateId: number, limit = 50) {
    return this.logRepo.find({ where: { gateId }, order: { id: 'DESC' }, take: limit });
  }

  /** 拉取待执行的下行指令（闸机轮询） */
  async listPendingCommands(gateId: number, limit = 10) {
    const commands = await this.commandRepo.find({
      where: { gateId, status: 10 },
      order: { id: 'ASC' },
      take: limit,
    });
    // 下发即视为已送达，避免重复下发（真机场景需等待闸机 ack）
    if (commands.length > 0) {
      await this.commandRepo.update(
        commands.map((c) => c.id),
        { status: 20, ackAt: new Date() },
      );
    }
    return commands.map((c) => ({
      commandNo: c.commandNo,
      type: c.type,
      sentAt: c.sentAt,
    }));
  }

  /** 写入通信日志（拦截器/服务可选调用） */
  async writeLog(gateId: number | null, action: string, request: unknown, response: unknown, costMs: number) {
    await this.logRepo.insert({
      gateId,
      action,
      request: request as unknown as QueryDeepPartialEntity<GateLog>['request'],
      response: response as unknown as QueryDeepPartialEntity<GateLog>['response'],
      costMs,
    });
  }

  // ==================== 心跳巡检 ====================

  /** 将超时未心跳的闸机置为离线并产生告警 */
  async checkHeartbeatTimeout(): Promise<number> {
    const threshold = new Date(Date.now() - HEARTBEAT_TIMEOUT_SECONDS * 1000);
    const rows: { id: number; gate_no: string }[] = await this.gateRepo.manager.query(
      `SELECT id, gate_no FROM gate_device
        WHERE status = 1 AND (last_heartbeat IS NULL OR last_heartbeat < ?)`,
      [threshold],
    );

    for (const row of rows) {
      await this.gateRepo.update(row.id, { status: 2 });
      await this.alarmRepo.insert({
        type: 'gate_offline',
        gateId: row.id,
        level: 3,
        status: 10,
        content: `闸机离线：${row.gate_no}`,
        createdAt: new Date(),
      });
      this.logger.warn(`闸机离线告警：${row.gate_no}`);
    }
    return rows.length;
  }

  /** 告警列表 */
  async listAlarms(params: { page: number; pageSize: number; status?: number; level?: number }) {
    const qb = this.alarmRepo
      .createQueryBuilder('a')
      .orderBy('a.id', 'DESC')
      .skip((params.page - 1) * params.pageSize)
      .take(params.pageSize);
    if (params.status) qb.andWhere('a.status = :status', { status: params.status });
    if (params.level) qb.andWhere('a.level = :level', { level: params.level });

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  /** 处理告警 */
  async handleAlarm(id: number, adminId: number, remark: string) {
    const alarm = await this.alarmRepo.findOne({ where: { id } });
    if (!alarm) throw new NotFoundException('告警不存在');
    await this.alarmRepo.update(id, {
      status: 20,
      handledBy: adminId,
      handledRemark: remark,
      handledAt: new Date(),
    });
    return null;
  }

  /** 通行记录查询 */
  async listPassages(params: {
    page: number;
    pageSize: number;
    areaId?: number;
    gateId?: number;
    direction?: number;
    result?: number;
    date?: string;
  }) {
    const qb = this.alarmRepo.manager
      .createQueryBuilder(PassageRecord, 'p')
      .orderBy('p.id', 'DESC')
      .skip((params.page - 1) * params.pageSize)
      .take(params.pageSize);

    if (params.areaId) qb.andWhere('p.scenic_area_id = :areaId', { areaId: params.areaId });
    if (params.gateId) qb.andWhere('p.gate_id = :gateId', { gateId: params.gateId });
    if (params.direction) qb.andWhere('p.direction = :direction', { direction: params.direction });
    if (params.result) qb.andWhere('p.result = :result', { result: params.result });
    if (params.date) qb.andWhere('DATE(p.passed_at) = :date', { date: params.date });

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }
}

/** 离线记录（闸机本地缓存格式） */
export interface OfflineRecord {
  credential: string;
  direction?: number;
  result?: number;
  passedAt?: string;
  localVerify?: boolean;
}
