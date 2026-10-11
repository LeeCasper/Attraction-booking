import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { GateCommand, GateDevice, GateLog, OfflineSyncRecord } from '../../database/entities/gate.entity';
import { Alarm, PassageRecord } from '../../database/entities/verify.entity';
import { Reservation } from '../../database/entities/order.entity';
import { Blacklist } from '../../database/entities/user.entity';
import { ScenicArea } from '../../database/entities/scenic.entity';
import { TicketType, TimeSlot } from '../../database/entities/ticket.entity';
import { CredentialService } from '../verify/credential.service';
import { VerifyService } from '../verify/verify.service';
import { randomBytes } from 'crypto';
import { businessToday } from '../../common/utils/date.util';

/** 心跳超时判定（秒）：超过该时长未心跳即视为离线 */
const HEARTBEAT_TIMEOUT_SECONDS = 90;

/** 新建/编辑闸机时允许提交的字段（其余由心跳与协议流程自己维护） */
export interface GateDeviceInput {
  scenicAreaId?: number;
  gateNo?: string;
  name?: string;
  location?: string;
  ip?: string;
  direction?: number;
  /** 只在编辑时出现：1 启用 / 3 禁用。2 离线 / 4 故障 是心跳巡检的运行时状态，不接受直接写 */
  status?: number;
  secretKey?: string;
  /**
   * 通行规则（A-044）：只放行这些时段 / 这些票种。
   * **空数组 = 不限**（与「没配」同义），存进库里是 `null`。
   */
  allowedSlotIds?: number[];
  allowedTicketTypeIds?: number[];
}

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
    @InjectRepository(ScenicArea) private readonly areaRepo: Repository<ScenicArea>,
    // 通行规则（A-044）要校验时段/票种属于本景区
    @InjectRepository(TimeSlot) private readonly slotRepo: Repository<TimeSlot>,
    @InjectRepository(TicketType) private readonly typeRepo: Repository<TicketType>,
    private readonly credential: CredentialService,
    private readonly verifyService: VerifyService,
  ) {}

  // ==================== 闸机设备的新增 / 编辑 ====================

  /** 心跳是否新鲜 —— 决定「启用」到底落成 1 在线还是 2 离线 */
  private isHeartbeatFresh(gate: GateDevice) {
    return !!gate.lastHeartbeat && Date.now() - gate.lastHeartbeat.getTime() < HEARTBEAT_TIMEOUT_SECONDS * 1000;
  }

  private async assertAreaExists(scenicAreaId: number) {
    const area = await this.areaRepo.findOne({ where: { id: scenicAreaId } });
    if (!area) throw new BadRequestException(`景区不存在（id=${scenicAreaId}）`);
    return area;
  }

  /**
   * 把通行规则里的 id 归一化：**去重 + 必须是本景区的时段/票种**。
   *
   * 不校验的话，跨景区的 id 会稳稳存进去、然后在核验时**静默地把所有人都拦下** ——
   * 现场看着就是「这台闸机坏了」。空数组统一存 `null`（= 不限），
   * 这样界面上把多选清空就是「恢复不限」，而不是「什么都不让过」。
   */
  private async normalizeRuleIds(
    ids: number[] | undefined,
    areaId: number,
    kind: 'slot' | 'type',
  ): Promise<number[] | null | undefined> {
    if (ids === undefined) return undefined;

    const clean = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (clean.length === 0) return null;

    const repo = kind === 'slot' ? this.slotRepo : this.typeRepo;
    const label = kind === 'slot' ? '时段' : '票种';
    const rows = await repo.find({ where: { id: In(clean), scenicAreaId: areaId } });
    const found = new Set(rows.map((r) => Number(r.id)));
    const missing = clean.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(`${label}不属于本景区（id=${missing.join('、')}）—— 跨景区的通行规则只会把所有人都拦下`);
    }
    return clean;
  }

  /**
   * 新建闸机。
   *
   * ⚠️ **`gate_no` 全局唯一**（`uk_gate_no`）—— 它是闸机的身份，走 `X-Gate-No` 头，
   * HMAC 签名里没有景区；多景区请用前缀区分（`A-北门` / `B-北门`）。所以重名要在这里拦住，
   * 否则会冒一个 `ER_DUP_ENTRY` 出去变成 500。
   *
   * 新闸机的 `status` 落 **2 离线**：1 是「在线」，含义是「心跳新鲜」，而它还没心跳过 ——
   * 让设备打上第一次心跳，或者由离线巡检去纠正，都比一建出来就谎报在线好。
   *
   * **密钥只在返回值里给一次**，列表接口永远不下发（`listDevices` 里 `secretKey: undefined`）。
   */
  async createDevice(dto: GateDeviceInput) {
    if (!dto.scenicAreaId) throw new BadRequestException('请选择所属景区');
    await this.assertAreaExists(dto.scenicAreaId);

    const gateNo = (dto.gateNo ?? '').trim();
    if (!gateNo) throw new BadRequestException('请填写闸机编号');
    const dup = await this.gateRepo.findOne({ where: { gateNo } });
    if (dup) {
      throw new ConflictException(
        `闸机编号「${gateNo}」已被占用（编号全局唯一，多景区请用前缀区分，如 A-北门 / B-北门）`,
      );
    }

    const secretKey = dto.secretKey?.trim() || randomBytes(24).toString('hex');
    const gate = await this.gateRepo.save(
      this.gateRepo.create({
        scenicAreaId: dto.scenicAreaId,
        gateNo,
        name: (dto.name ?? '').trim() || gateNo,
        location: dto.location?.trim() || null,
        ip: dto.ip?.trim() || null,
        direction: dto.direction ?? 1,
        status: 2,
        protocol: 'http',
        secretKey,
        allowedSlotIds: (await this.normalizeRuleIds(dto.allowedSlotIds, dto.scenicAreaId, 'slot')) ?? null,
        allowedTicketTypeIds:
          (await this.normalizeRuleIds(dto.allowedTicketTypeIds, dto.scenicAreaId, 'type')) ?? null,
      }),
    );

    return { id: Number(gate.id), gateNo: gate.gateNo, secretKey };
  }

  /**
   * 编辑闸机：名称/位置/IP/方向/所属景区/启用禁用/密钥，都是可选字段（只改传了的）。
   *
   * 「所属景区」可改是**必需的**：景区被删（或换绑）之后闸机会指向不存在的景区，
   * 那台闸机就核不了任何单（`GATE_NO_PERMISSION`）—— 在界面做出来之前，只能改库。
   */
  async updateDevice(id: number, dto: GateDeviceInput) {
    const gate = await this.gateRepo.findOne({ where: { id } });
    if (!gate) throw new NotFoundException('闸机不存在');

    const patch: QueryDeepPartialEntity<GateDevice> = {};
    const changingArea = dto.scenicAreaId !== undefined && dto.scenicAreaId !== gate.scenicAreaId;
    if (changingArea) {
      await this.assertAreaExists(dto.scenicAreaId!);
      patch.scenicAreaId = dto.scenicAreaId;

      // ⚠️ 换景区之后，原有的通行规则（时段/票种）**几乎必然不属于新景区** ——
      // 直接留着就是「静默把所有人都拦下」，现场只会看到「这台闸机坏了」。
      // 所以要么这次一并给新规则，要么显式清空（传空数组），否则拒掉。
      const hasRules = (gate.allowedSlotIds?.length ?? 0) > 0 || (gate.allowedTicketTypeIds?.length ?? 0) > 0;
      const redefines = dto.allowedSlotIds !== undefined || dto.allowedTicketTypeIds !== undefined;
      if (hasRules && !redefines) {
        throw new BadRequestException(
          '换绑景区时原通行规则里的时段/票种都不属于新景区了 —— 请连同通行规则一起提交（清空传空数组即恢复「不限」）',
        );
      }
    }
    if (dto.name !== undefined) patch.name = dto.name.trim() || gate.gateNo;
    if (dto.location !== undefined) patch.location = dto.location.trim() || null;
    if (dto.ip !== undefined) patch.ip = dto.ip.trim() || null;
    if (dto.direction !== undefined) patch.direction = dto.direction;
    if (dto.secretKey?.trim()) patch.secretKey = dto.secretKey.trim();

    // 通行规则按**改完之后**的景区校验（两者可以在同一次请求里一起改）
    const ruleAreaId = dto.scenicAreaId ?? gate.scenicAreaId;
    const slotIds = await this.normalizeRuleIds(dto.allowedSlotIds, ruleAreaId, 'slot');
    if (slotIds !== undefined) patch.allowedSlotIds = slotIds;
    const typeIds = await this.normalizeRuleIds(dto.allowedTicketTypeIds, ruleAreaId, 'type');
    if (typeIds !== undefined) patch.allowedTicketTypeIds = typeIds;

    if (dto.status !== undefined) {
      if (dto.status === 3) {
        patch.status = 3; // 禁用：离线巡检只扫 status=1 的行，禁用态不会被它改掉
      } else if (dto.status === 1) {
        // 「启用」落成在线还是离线，取决于最近有没有心跳 —— 别让界面替心跳撒谎
        patch.status = this.isHeartbeatFresh(gate) ? 1 : 2;
      } else {
        throw new BadRequestException('状态只能是 1 启用 / 3 禁用（2 离线、4 故障由闸机心跳自己维护）');
      }
    }

    if (Object.keys(patch).length === 0) return { id, changed: 0 };
    await this.gateRepo.update(id, patch);
    return { id, changed: Object.keys(patch).length };
  }

  /**
   * 删除闸机。**有通信/通行记录时拒绝**（409），并提示改用「禁用」。
   *
   * 与删除景区同一个道理（见 `ScenicService.removeArea`）：`init.sql` 一条外键都没有，
   * 删掉设备行之后，`passage_record` / `gate_log` / `gate_command` / `offline_sync_record` /
   * `alarm` 里那些 `gate_id` 就成了查不到设备的孤儿行 ——「这台闸机昨天放了多少人」再也答不上来。
   *
   * 只有**刚建错、还没跑过**的闸机才允许删（这已经够清理误操作了）。
   */
  async removeDevice(id: number) {
    const gate = await this.gateRepo.findOne({ where: { id } });
    if (!gate) throw new NotFoundException('闸机不存在');

    const [refs] = (await this.gateRepo.manager.query(
      `SELECT
         (SELECT COUNT(*) FROM passage_record     WHERE gate_id = ?) AS passages,
         (SELECT COUNT(*) FROM gate_log           WHERE gate_id = ?) AS logs,
         (SELECT COUNT(*) FROM gate_command       WHERE gate_id = ?) AS commands,
         (SELECT COUNT(*) FROM offline_sync_record WHERE gate_id = ?) AS syncs,
         (SELECT COUNT(*) FROM alarm              WHERE gate_id = ?) AS alarms`,
      [id, id, id, id, id],
    )) as Array<{ passages: number; logs: number; commands: number; syncs: number; alarms: number }>;

    const used = [
      refs.passages > 0 ? `${refs.passages} 条通行记录` : '',
      refs.alarms > 0 ? `${refs.alarms} 条告警` : '',
      refs.commands > 0 ? `${refs.commands} 条指令` : '',
      refs.logs > 0 ? `${refs.logs} 条通信日志` : '',
      refs.syncs > 0 ? `${refs.syncs} 条离线同步` : '',
    ].filter(Boolean);

    if (used.length > 0) {
      throw new ConflictException(
        `该闸机已有 ${used.join('、')}，不能删除 —— 删了这些记录就再也说不清是哪台设备了。` +
          `不再使用请改成「禁用」（禁用后核验会拒：闸机已禁用）。`,
      );
    }

    await this.gateRepo.delete(id);
    return null;
  }


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
    const reservations: { id: number; time_slot_id: number; order_id: number }[] =
      await this.resRepo.manager.query(
        `SELECT r.id, r.time_slot_id, r.order_id FROM reservation r
           JOIN orders o ON o.id = r.order_id
          WHERE r.scenic_area_id = ? AND r.date = ? AND o.status IN (?, ?)`,
        [gate.scenicAreaId, today, 20, 30],
      );

    // 离线白名单也要按**本机的通行规则**过滤：不然闸机断网时会把不该走这条通道的人放进去
    const reservationIds = await this.filterByPassageRules(gate, reservations);

    const blacklistRows: { value_hash: string }[] = await this.blacklistRepo.manager.query(
      `SELECT value_hash FROM blacklist
        WHERE status = 1 AND (expire_time IS NULL OR expire_time > NOW()) LIMIT 5000`,
    );

    await this.gateRepo.update(gateId, {
      allowedSlots: { date: today, reservationIds },
    });

    return {
      ruleVersion: await this.credential.getRuleVersion(),
      credential: {
        // 离线验签所需密钥（真机场景应按设备公钥加密下发，模拟器直接明文）
        version: this.credential.currentVersion,
        secret: process.env.CRED_SECRET ?? 'dev-cred-secret',
      },
      date: today,
      reservationIds,
      // 通行规则（A-044）：真机离线时也要按同一套规则拦，所以一并下发
      passageRules: {
        slotIds: (gate.allowedSlotIds ?? []).map(Number),
        ticketTypeIds: (gate.allowedTicketTypeIds ?? []).map(Number),
      },
      blacklistHashes: blacklistRows.map((b) => b.value_hash),
      heartbeatInterval: 30,
    };
  }

  /**
   * 按通行规则过滤当天的预约白名单（离线核验用）。
   *
   * 没配规则时原样返回（绝大多数闸机如此）—— 别为默认路径多查一次库。
   * 票种维度要回查 `order_item`（预约表上没有票种），所以放在需要时才查。
   */
  private async filterByPassageRules(
    gate: GateDevice,
    rows: { id: number; time_slot_id: number; order_id: number }[],
  ): Promise<number[]> {
    const slotIds = (gate.allowedSlotIds ?? []).map(Number);
    const typeIds = (gate.allowedTicketTypeIds ?? []).map(Number);
    if (slotIds.length === 0 && typeIds.length === 0) return rows.map((r) => r.id);

    const bySlot =
      slotIds.length === 0 ? rows : rows.filter((r) => slotIds.includes(Number(r.time_slot_id)));
    if (typeIds.length === 0) return bySlot.map((r) => r.id);

    const orderIds = [...new Set(bySlot.map((r) => Number(r.order_id)))];
    if (orderIds.length === 0) return [];
    // 原生 SQL 不会展开数组，占位符得自己拼（都是数字，没有注入面）
    const placeholders = orderIds.map(() => '?').join(',');
    const items: { order_id: number; ticket_type_id: number }[] = await this.resRepo.manager.query(
      `SELECT DISTINCT order_id, ticket_type_id FROM order_item WHERE order_id IN (${placeholders})`,
      orderIds,
    );
    const okOrders = new Set(
      items.filter((i) => typeIds.includes(Number(i.ticket_type_id))).map((i) => Number(i.order_id)),
    );
    return bySlot.filter((r) => okOrders.has(Number(r.order_id))).map((r) => r.id);
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
