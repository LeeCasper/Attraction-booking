import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { CredentialService } from './credential.service';
import { PresenceService } from './presence.service';
import { OrderItem, Orders, Reservation } from '../../database/entities/order.entity';
import { Blacklist, Visitor } from '../../database/entities/user.entity';
import { Alarm, PassageRecord, Verification } from '../../database/entities/verify.entity';
import { GateCommand, GateDevice } from '../../database/entities/gate.entity';
import { TicketType, TimeSlot } from '../../database/entities/ticket.entity';
import {
  OrderItemStatus,
  OrderStatus,
  RefundStatus,
  ReservationStatus,
} from '../../common/enums/status.enum';
import { Refund } from '../../database/entities/pay.entity';
import { businessToday } from '../../common/utils/date.util';

/** 核销结果码（闸机据此播报语音/屏幕提示） */
export enum VerifyCode {
  OK = 'OK',
  /** 凭证格式或签名错误 */
  INVALID_CREDENTIAL = 'INVALID_CREDENTIAL',
  /** 凭证已过期（超过 60 秒未刷新） */
  EXPIRED = 'EXPIRED',
  /** 订单未支付 */
  NOT_PAID = 'NOT_PAID',
  /** 非预约日期 */
  WRONG_DATE = 'WRONG_DATE',
  /** 不在预约时段内 */
  WRONG_SLOT = 'WRONG_SLOT',
  /** 已核销（重复核销） */
  ALREADY_VERIFIED = 'ALREADY_VERIFIED',
  /** 黑名单 */
  BLACKLIST = 'BLACKLIST',
  /** 闸机方向/景区权限不符 */
  GATE_NO_PERMISSION = 'GATE_NO_PERMISSION',
  /**
   * 退款审核中/退款处理中。
   *
   * 单独一个码（而不是并进 INVALID_CREDENTIAL）是因为现场要能一眼看出**为什么**过不去：
   * 这单是用户自己申请了退款，不是票坏了。
   */
  REFUND_PENDING = 'REFUND_PENDING'
}

export interface VerifyContext {
  /** gate / pda / manual */
  channel: string;
  gateId?: number;
  operatorId?: number;
  direction?: number;
}

export interface VerifyOutcome {
  ok: boolean;
  code: VerifyCode;
  message: string;
  /** 开闸指令号（幂等键） */
  cmdId?: string;
  reservationId?: number;
  orderNo?: string;
  visitorName?: string;
  /** 剩余待核销人数 */
  remaining?: number;
  /** 核销后实时在园人数 */
  presence?: number;
}

/** 时段容差：允许提前 60 分钟到、晚 60 分钟入园 */
const SLOT_EARLY_MINUTES = 60;
const SLOT_LATE_MINUTES = 60;

/**
 * 核销与通行（设计文档 §6.4.2 / §6.4.4）
 *
 * 幂等三重防线：
 * 1. 请求层：闸机 HMAC nonce 去重（GateAuthGuard）
 * 2. 指令层：返回 cmdId，闸机按 cmdId 去重，重复请求不二次开闸
 * 3. 数据层：verification.order_item_id 唯一索引，事务内插入冲突即判定重复核销
 */
@Injectable()
export class VerifyService {
  private readonly logger = new Logger(VerifyService.name);

  constructor(
    @InjectRepository(Orders) private readonly ordersRepo: Repository<Orders>,
    @InjectRepository(OrderItem) private readonly itemRepo: Repository<OrderItem>,
    @InjectRepository(Reservation) private readonly resRepo: Repository<Reservation>,
    @InjectRepository(Visitor) private readonly visitorRepo: Repository<Visitor>,
    @InjectRepository(Blacklist) private readonly blacklistRepo: Repository<Blacklist>,
    @InjectRepository(GateDevice) private readonly gateRepo: Repository<GateDevice>,
    @InjectRepository(TimeSlot) private readonly slotRepo: Repository<TimeSlot>,
    // 通行规则（A-044）拒绝时要报票种名，现场才看得懂
    @InjectRepository(TicketType) private readonly typeRepo: Repository<TicketType>,
    // 退款审核中/退款处理中的订单不可通行（见 doVerify）
    @InjectRepository(Refund) private readonly refundRepo: Repository<Refund>,
    private readonly credential: CredentialService,
    private readonly presence: PresenceService,
    private readonly dataSource: DataSource,
  ) {}

  /** 二维码核销（小程序动态凭证） */
  async verifyByCredential(token: string, ctx: VerifyContext): Promise<VerifyOutcome> {
    const check = this.credential.verify(token);
    if (!check.valid || !check.payload) {
      const code = check.reason === 'EXPIRED' ? VerifyCode.EXPIRED : VerifyCode.INVALID_CREDENTIAL;
      return this.reject(code, code === VerifyCode.EXPIRED ? '凭证已过期，请刷新二维码' : '凭证无效', ctx);
    }

    const reservation = await this.resRepo.findOne({ where: { id: check.payload.rid } });
    if (!reservation) return this.reject(VerifyCode.INVALID_CREDENTIAL, '凭证无效', ctx);

    return this.doVerify(reservation, ctx, this.credential.fingerprint(token));
  }

  /**
   * 身份证核验（刷证通行）：按证件哈希匹配同预约下的游客。
   *
   * `areaId` **可选**：闸机侧会传自己所属的景点做限定；
   * 后台核销台不传 —— 它的语义是「查这个人今天在哪个景点有有效预约」，本就不绑定景点。
   *
   * ⚠️ 这里以前被后台调用时传的是字面量 `0`（见 `verify.controller.ts`），
   * 而条件里有 `r.scenic_area_id = ?` —— `0` 永远匹配不到任何预约，
   * **后台那条手工刷证核销路径一直是坏的**（永远返回「今日无有效预约」）。
   */
  async verifyByIdCard(idCardHash: string, areaId: number | undefined, ctx: VerifyContext): Promise<VerifyOutcome> {
    const today = businessToday();
    const visitor = await this.visitorRepo.findOne({ where: { idCardHash } });
    if (!visitor) return this.reject(VerifyCode.INVALID_CREDENTIAL, '未找到该证件的预约', ctx);

    const areaCond = areaId ? ' AND r.scenic_area_id = ?' : '';
    const params: unknown[] = [visitor.id, today];
    if (areaId) params.push(areaId);
    params.push(OrderStatus.PAID, OrderStatus.PARTIAL_VERIFIED, OrderStatus.VERIFIED);

    const rows = await this.dataSource.query(
      `SELECT r.id FROM reservation r
         JOIN order_item oi ON oi.order_id = r.order_id
         JOIN orders o ON o.id = r.order_id
        WHERE oi.visitor_id = ? AND r.date = ?${areaCond}
          AND o.status IN (?, ?, ?)
        ORDER BY r.id DESC LIMIT 1`,
      params,
    );
    if (!rows.length) return this.reject(VerifyCode.INVALID_CREDENTIAL, '今日无有效预约', ctx);

    const reservation = await this.resRepo.findOne({ where: { id: rows[0].id } });
    if (!reservation) return this.reject(VerifyCode.INVALID_CREDENTIAL, '预约不存在', ctx);

    return this.doVerify(reservation, ctx, `idcard:${idCardHash.slice(0, 12)}`, visitor.id);
  }

  /** 手动核销（订单号 + 证件后四位），供检票员在 PDA/后台使用 */
  async verifyManual(orderNo: string, idCardSuffix: string, ctx: VerifyContext): Promise<VerifyOutcome> {
    const order = await this.ordersRepo.findOne({ where: { orderNo } });
    if (!order) return this.reject(VerifyCode.INVALID_CREDENTIAL, '订单不存在', ctx);

    const reservation = order.reservationId
      ? await this.resRepo.findOne({ where: { id: order.reservationId } })
      : null;
    if (!reservation) return this.reject(VerifyCode.INVALID_CREDENTIAL, '订单无预约信息', ctx);

    if (!idCardSuffix) {
      return this.doVerify(reservation, ctx, `manual:${orderNo}`);
    }

    // 校验证件后四位匹配则精确核销该游客，否则核销第一张未核销票
    const items = await this.itemRepo.find({ where: { orderId: order.id } });
    const visitors = await this.visitorRepo.find({
      where: items.map((i) => ({ id: i.visitorId })),
    });
    const matched = visitors.find((v) => (v.idCardMask ?? '').endsWith(idCardSuffix));
    if (!matched) return this.reject(VerifyCode.INVALID_CREDENTIAL, '证件后四位不匹配', ctx);

    return this.doVerify(reservation, ctx, `manual:${orderNo}`, matched.id);
  }

  /**
   * 核销主流程
   *
   * @param visitorId 指定游客（刷证/精确核销）；不传则核销该预约下第一张未核销票
   */
  private async doVerify(
    reservation: Reservation,
    ctx: VerifyContext,
    credentialDigest: string,
    visitorId?: number,
  ): Promise<VerifyOutcome> {
    const order = await this.ordersRepo.findOne({ where: { id: reservation.orderId } });
    if (!order) return this.reject(VerifyCode.INVALID_CREDENTIAL, '订单不存在', ctx, reservation.id);

    // 未支付不可通行
    if (order.status === OrderStatus.PENDING_PAY) {
      return this.reject(VerifyCode.NOT_PAID, '订单未支付', ctx, reservation.id);
    }
    if ([OrderStatus.CANCELLED, OrderStatus.EXPIRED, OrderStatus.REFUNDED].includes(order.status)) {
      return this.reject(VerifyCode.INVALID_CREDENTIAL, '订单已失效', ctx, reservation.id);
    }

    // 退款审核中/退款处理中：**不能放行**。
    // 申请退款不改订单状态（仍是 20/30），只多一条待审的退款单 —— 只看 `order.status`
    // 的话，用户能一边过闸入园、一边等退款到账（小程序端也会把凭证置灰，但那只是提示，
    // 刷身份证/人脸这两条路走不到小程序，必须在这里拦）。
    // 只在 10 待审核 / 20 退款中拦；40 已拒绝、50 退款失败都是**没退成**，凭证照常可用。
    const pendingRefund = await this.refundRepo.findOne({
      where: { orderId: order.id, status: In([RefundStatus.PENDING_AUDIT, RefundStatus.REFUNDING]) },
    });
    if (pendingRefund) {
      return this.reject(
        VerifyCode.REFUND_PENDING,
        '该订单正在退款审核中，暂不可通行',
        ctx,
        reservation.id,
      );
    }

    // 日期校验（当天有效）
    const today = businessToday();
    if (reservation.date !== today) {
      return this.reject(
        VerifyCode.WRONG_DATE,
        reservation.date > today ? `未到预约日期（${reservation.date}）` : '预约已过期',
        ctx,
        reservation.id,
      );
    }

    // 时段校验（含容差）
    const slotCheck = await this.checkSlot(reservation.timeSlotId);
    if (slotCheck !== true) {
      return this.reject(VerifyCode.WRONG_SLOT, slotCheck, ctx, reservation.id);
    }

    // 闸机权限（方向/景区）
    if (ctx.gateId) {
      const gateCheck = await this.checkGate(ctx.gateId, reservation.scenicAreaId, ctx.direction);
      if (gateCheck !== true) {
        return this.reject(VerifyCode.GATE_NO_PERMISSION, gateCheck, ctx, reservation.id);
      }

      // 通行规则（A-044：时段 / 票种）—— 没配就是「全放行」
      const ruleCheck = await this.checkGatePassageRules(ctx.gateId, reservation);
      if (ruleCheck !== true) {
        return this.reject(VerifyCode.GATE_NO_PERMISSION, ruleCheck, ctx, reservation.id);
      }
    }

    // 选取待核销明细
    const items = await this.itemRepo.find({ where: { orderId: order.id } });
    const pending = visitorId
      ? items.filter((i) => i.visitorId === visitorId && i.status === OrderItemStatus.PENDING)
      : items.filter((i) => i.status === OrderItemStatus.PENDING);

    if (pending.length === 0) {
      const target = visitorId ? items.find((i) => i.visitorId === visitorId) : items[0];
      if (target && target.status === OrderItemStatus.VERIFIED) {
        // 重复核销：记录并告警（设计文档 A-033）
        return this.duplicated(reservation, target.id, ctx, credentialDigest);
      }
      return this.reject(VerifyCode.ALREADY_VERIFIED, '没有可核销的票', ctx, reservation.id);
    }

    const item = pending[0];

    // 黑名单兜底校验
    const visitor = await this.visitorRepo.findOne({ where: { id: item.visitorId } });
    if (visitor) {
      const blocked = await this.blacklistRepo.findOne({
        where: { type: 1, valueHash: visitor.idCardHash, status: 1 },
      });
      if (blocked && (!blocked.expireTime || blocked.expireTime > new Date())) {
        return this.reject(VerifyCode.BLACKLIST, '该证件已被限制通行', ctx, reservation.id);
      }
    }

    // 事务：核销落库 + 状态迁移 + 通行记录
    const cmdId = `CMD${Date.now()}${randomBytes(3).toString('hex')}`;
    try {
      await this.dataSource.transaction(async (em) => {
        // 唯一索引冲突 → 重复核销（并发下另一路已核销）
        await em.insert(Verification, {
          reservationId: reservation.id,
          orderItemId: item.id,
          channel: ctx.channel,
          gateId: ctx.gateId ?? null,
          operatorId: ctx.operatorId ?? null,
          verifyTime: new Date(),
        });

        const upd: { affectedRows: number } = await em.query(
          'UPDATE order_item SET status = ? WHERE id = ? AND status = ?',
          [OrderItemStatus.VERIFIED, item.id, OrderItemStatus.PENDING],
        );
        if (upd.affectedRows !== 1) {
          throw new DuplicateVerifyError();
        }

        const verifyCount = reservation.verifyCount + 1;
        await em.update(Reservation, reservation.id, {
          verifyCount,
          status:
            verifyCount >= reservation.totalCount ? ReservationStatus.USED : ReservationStatus.PENDING,
        });

        // 订单状态：全部核销 → 已核销，否则部分核销
        await em.update(
          Orders,
          order.id,
          { status: verifyCount >= reservation.totalCount ? OrderStatus.VERIFIED : OrderStatus.PARTIAL_VERIFIED },
        );

        await em.insert(PassageRecord, {
          reservationId: reservation.id,
          scenicAreaId: reservation.scenicAreaId,
          gateId: ctx.gateId ?? 0,
          credential: credentialDigest,
          direction: ctx.direction ?? 1,
          result: 1,
          passedAt: new Date(),
        });

        // 开闸指令落库（幂等键），闸机按 cmdId 去重
        if (ctx.gateId) {
          await em.insert(GateCommand, {
            gateId: ctx.gateId,
            commandNo: cmdId,
            type: 'open',
            status: 10,
            issuedBy: ctx.operatorId ?? null,
            sentAt: new Date(),
          });
        }
      });
    } catch (err) {
      // 并发下另一个通道先落库：条件 UPDATE 未命中
      if (err instanceof DuplicateVerifyError) {
        return this.duplicated(reservation, item.id, ctx, credentialDigest);
      }
      // 兜底：同一张票被同刻核销时，先到的 INSERT 会占住唯一索引，
      // 后到的在这里撞 ER_DUP_ENTRY。必须转成可解释的「重复核销」，
      // 否则并发刷同一张码会得到 500（设计文档 §5.3 幂等三重防线）。
      if (this.isDuplicateKeyError(err, 'uk_item_once')) {
        return this.duplicated(reservation, item.id, ctx, credentialDigest);
      }
      throw err;
    }

    // 注意：在园人数不在核验环节计数，而以闸机「通行回执」为准
    // （核验通过但游客未实际通行、或尾随未过的情形不应计入在园）
    const remaining = reservation.totalCount - (reservation.verifyCount + 1);
    this.logger.log(
      `核销成功 order=${order.orderNo} 游客=${visitor?.name ?? ''} 剩余=${remaining} 渠道=${ctx.channel}`,
    );

    return {
      ok: true,
      code: VerifyCode.OK,
      message: '核销成功，请通行',
      cmdId,
      reservationId: reservation.id,
      orderNo: order.orderNo,
      visitorName: visitor?.name ?? '',
      remaining,
    };
  }

  /**
   * 通行结果上报（闸机开闸后回执 / 出园上报 / 应急放行）
   *
   * 在园人数在此计数（result=1 通过 或 4 应急放行），与 passage_record 一一对应；
   * 定时任务会用 passage_record 校准 Redis 计数，保证长期一致。
   */
  async recordPassageByGate(params: {
    gateId: number;
    reservationId?: number;
    direction: number;
    result: number;
    rejectReason?: string;
    credential?: string;
    passedAt?: string;
  }) {
    const gate = await this.gateRepo.findOne({ where: { id: params.gateId } });
    if (!gate) throw new Error(`闸机不存在：${params.gateId}`);

    let scenicAreaId = gate.scenicAreaId;
    if (params.reservationId) {
      const res = await this.resRepo.findOne({ where: { id: params.reservationId } });
      if (res) scenicAreaId = res.scenicAreaId;
    }

    await this.dataSource.getRepository(PassageRecord).insert({
      reservationId: params.reservationId ?? null,
      scenicAreaId,
      gateId: params.gateId,
      credential: params.credential ?? null,
      direction: params.direction,
      result: params.result,
      rejectReason: params.rejectReason ?? null,
      passedAt: params.passedAt ? new Date(params.passedAt) : new Date(),
    });

    // 指令回执：标记已执行
    if (params.result === 1) {
      await this.dataSource
        .createQueryBuilder()
        .update(GateCommand)
        .set({ status: 20, ackAt: new Date() })
        .where('gate_id = :gateId AND status = 10', { gateId: params.gateId })
        .execute();
    }

    // 实际通行才计入在园人数（拒绝通行不计）
    let presence: number | undefined;
    if (params.result === 1 || params.result === 4) {
      presence =
        params.direction === 1
          ? await this.presence.onEnter(scenicAreaId)
          : await this.presence.onExit(scenicAreaId);
    }

    return { ok: true, presence };
  }

  /**
   * 重复核销的统一出口（设计文档 A-033）
   *
   * 只在这里写通行记录：早期实现是「先 recordPassage 再 reject(...)」，
   * 而 reject() 内部又会按 ctx.gateId 写一条，导致一次重复刷码在
   * passage_record 里留下两条拒绝记录，看板的「拒绝通行」计数翻倍。
   */
  private async duplicated(
    reservation: Reservation,
    orderItemId: number | undefined,
    ctx: VerifyContext,
    credentialDigest: string,
  ): Promise<VerifyOutcome> {
    await this.recordPassage(
      reservation.scenicAreaId,
      ctx,
      2,
      VerifyCode.ALREADY_VERIFIED,
      credentialDigest,
      reservation.id,
    );
    if (orderItemId !== undefined) {
      await this.raiseDuplicateAlarm(reservation, orderItemId, ctx);
    }
    this.logger.warn(
      `重复核销 reservation=${reservation.id} item=${orderItemId ?? '-'} 渠道=${ctx.channel}`,
    );
    return {
      ok: false,
      code: VerifyCode.ALREADY_VERIFIED,
      message: '该票已核销',
      reservationId: reservation.id,
    };
  }

  /** MySQL 唯一键冲突判定（TypeORM 把驱动错误包在 QueryFailedError.driverError 里） */
  private isDuplicateKeyError(err: unknown, indexName?: string): boolean {
    const e = err as {
      code?: string;
      message?: string;
      driverError?: { code?: string; message?: string; sqlMessage?: string };
    };
    const code = e?.driverError?.code ?? e?.code;
    if (code !== 'ER_DUP_ENTRY') return false;
    if (!indexName) return true;
    const msg = e?.driverError?.sqlMessage ?? e?.driverError?.message ?? e?.message ?? '';
    return msg.includes(indexName);
  }

  /** 拒绝通行：记录通行记录（result=2）便于分析与告警 */
  private async reject(
    code: VerifyCode,
    message: string,
    ctx: VerifyContext,
    reservationId?: number,
  ): Promise<VerifyOutcome> {
    if (ctx.gateId && reservationId !== undefined) {
      const res = await this.resRepo.findOne({ where: { id: reservationId } });
      await this.recordPassage(
        res?.scenicAreaId ?? 0,
        ctx,
        2,
        code,
        undefined,
        reservationId,
      );
    }
    this.logger.warn(`核销失败[${code}] ${message} 渠道=${ctx.channel}`);
    return { ok: false, code, message, reservationId };
  }

  /** 写通行记录（拒绝时也会留痕） */
  private async recordPassage(
    areaId: number,
    ctx: VerifyContext,
    result: number,
    reason?: string,
    credential?: string,
    reservationId?: number,
  ) {
    if (!ctx.gateId) return;

    await this.dataSource.getRepository(PassageRecord).insert({
      reservationId: reservationId ?? null,
      scenicAreaId: areaId,
      gateId: ctx.gateId,
      credential: credential ?? null,
      direction: ctx.direction ?? 1,
      result,
      rejectReason: reason ?? null,
      passedAt: new Date(),
    });
  }

  /** 重复核销告警（设计文档 A-033） */
  private async raiseDuplicateAlarm(reservation: Reservation, orderItemId: number, ctx: VerifyContext) {
    await this.dataSource.getRepository(Alarm).insert({
      type: 'duplicate_verify',
      gateId: ctx.gateId ?? null,
      scenicAreaId: reservation.scenicAreaId,
      level: 2,
      status: 10,
      content: `重复核销尝试：预约 ${reservation.id}，明细 ${orderItemId}`,
      createdAt: new Date(),
    });
  }

  /** 时段校验：返回 true 或拒绝原因 */
  private async checkSlot(timeSlotId: number): Promise<true | string> {
    const slot = await this.slotRepo.findOne({ where: { id: timeSlotId } });
    if (!slot) return '预约时段不存在';

    const now = new Date();
    const [sh, sm] = slot.startTime.split(':').map(Number);
    const [eh, em] = slot.endTime.split(':').map(Number);
    const start = new Date(now);
    start.setHours(sh, sm, 0, 0);
    const end = new Date(now);
    end.setHours(eh, em, 0, 0);

    const early = new Date(start.getTime() - SLOT_EARLY_MINUTES * 60_000);
    const late = new Date(end.getTime() + SLOT_LATE_MINUTES * 60_000);

    if (now < early) return `未到入园时段（${slot.name}）`;
    if (now > late) return `已超过入园时段（${slot.name}）`;
    return true;
  }

  /** 闸机权限：方向与景区匹配 */
  private async checkGate(gateId: number, scenicAreaId: number, direction?: number): Promise<true | string> {
    const gate = await this.gateRepo.findOne({ where: { id: gateId } });
    if (!gate) return '闸机不存在';
    if (gate.status === 3) return '闸机已禁用';
    if (gate.scenicAreaId !== scenicAreaId) return '该闸机不服务于本景区';

    const dir = direction ?? 1;
    if (gate.direction !== 3 && gate.direction !== dir) {
      return dir === 1 ? '该闸机为出园通道' : '该闸机为入园通道';
    }
    return true;
  }

  /**
   * 通行规则（PRD A-044）：这台闸机**只**放行哪些时段 / 哪些票种。
   *
   * 两个维度各自独立，**空数组 = 不限**（与「没配」同义，见 `GateDevice.allowedSlotIds`）——
   * 这条口径很重要：界面上把多选清空，语义必须是「恢复不限」而不是「什么都不让过」。
   *
   * 票种维度看的是**这一单的明细**：一张订单只有一个票种（下单时单选 `ticketTypeId`），
   * 所以「明细里有任意一个被允许的票种」就是精确的。真要出现混合票种的单，这里会偏宽，
   * 但那需要先改下单逻辑。
   *
   * 拒绝理由带上**时段名**（现场要能一眼看出是哪条规则挡的），所以这里多查一次时段。
   */
  private async checkGatePassageRules(
    gateId: number,
    reservation: Reservation,
  ): Promise<true | string> {
    const gate = await this.gateRepo.findOne({ where: { id: gateId } });
    if (!gate) return '闸机不存在';

    const allowedSlots = gate.allowedSlotIds ?? [];
    if (allowedSlots.length > 0 && !allowedSlots.map(Number).includes(Number(reservation.timeSlotId))) {
      const slot = await this.slotRepo.findOne({ where: { id: reservation.timeSlotId } });
      return `该闸机不放行此时段（${slot?.name ?? `时段 ${reservation.timeSlotId}`}），请走其他通道`;
    }

    const allowedTypes = gate.allowedTicketTypeIds ?? [];
    if (allowedTypes.length > 0) {
      const items = await this.itemRepo.find({ where: { orderId: reservation.orderId } });
      const ok = items.some((i) => allowedTypes.map(Number).includes(Number(i.ticketTypeId)));
      if (!ok) {
        const ids = [...new Set(items.map((i) => i.ticketTypeId))];
        const types = ids.length
          ? await this.typeRepo.find({ where: { id: In(ids) } })
          : [];
        const names = types.map((t) => t.name).join('、');
        return `该闸机不放行此票种（${names || `票种 ${ids.join('、')}`}），请走其他通道`;
      }
    }

    return true;
  }
}

/** 并发下唯一索引冲突的内部信号 */
class DuplicateVerifyError extends Error {
  constructor() {
    super('duplicate verify');
  }
}
