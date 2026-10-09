import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Blacklist, Visitor } from '../../database/entities/user.entity';
import { OrderItem } from '../../database/entities/order.entity';
import { CIPHER } from '../security/security.module';
import { CipherUtil, maskIdCard, maskPhone } from '../../common/utils/cipher.util';
import { CreateVisitorDto, UpdateVisitorDto } from './dto/visitor.dto';

/**
 * 常用出行人上限。与「单笔订单最多 10 位游客」对齐（`CreateOrderDto` 的 `@ArrayMaxSize(10)`），
 * 即通讯录至少要装得下一单的全部游客。要改就改这一处。
 */
export const MAX_VISITORS_PER_USER = 10;

/** 对外视图：**只有脱敏信息，没有密文也没有明文证件** */
export interface VisitorView {
  id: number;
  name: string;
  idCardMask: string;
  phoneMask: string;
  isDefault: boolean;
  /** 设计稿个人中心那两个徽章（主出行人 / 同行）由默认标记推导，不需要额外字段 */
  badge: string;
}

/**
 * 常用出行人（PRD U-031 / 技术方案 §3.2 的 `GET|POST /api/mini/visitors`）。
 *
 * 落库口径与 `order.service.ts` 下单时那段完全一致：身份证存
 * AES-256-GCM 密文 + sha256 哈希（唯一键与比对）+ 脱敏串，先过黑名单。
 * 区别只在于这里提供了查询与增删改的入口 —— 在此之前，`visitor` 表只在下单时被隐式写入，
 * 用户看不到也改不了自己的常用出行人。
 */
@Injectable()
export class MiniVisitorService {
  constructor(
    @InjectRepository(Visitor) private readonly visitorRepo: Repository<Visitor>,
    @InjectRepository(Blacklist) private readonly blacklistRepo: Repository<Blacklist>,
    @InjectRepository(OrderItem) private readonly orderItemRepo: Repository<OrderItem>,
    @Inject(CIPHER) private readonly cipher: CipherUtil,
    private readonly dataSource: DataSource,
  ) {}

  async list(userId: number): Promise<VisitorView[]> {
    const rows = await this.visitorRepo.find({
      where: { userId },
      order: { isDefault: 'DESC', id: 'ASC' },
    });
    return rows.map((v) => this.toView(v));
  }

  async create(userId: number, dto: CreateVisitorDto): Promise<VisitorView> {
    const idCardHash = this.cipher.hash(dto.idCard);
    await this.assertNotBlacklisted(dto.idCard, idCardHash);

    // 幂等：同一证件重复添加不报错、也不产生第二条（uk_user_idcard 保证唯一）
    const existing = await this.visitorRepo.findOne({ where: { userId, idCardHash } });
    if (existing) return this.toView(existing);

    const count = await this.visitorRepo.count({ where: { userId } });
    if (count >= MAX_VISITORS_PER_USER) {
      throw new BadRequestException(`常用出行人最多 ${MAX_VISITORS_PER_USER} 位`);
    }

    // 「默认出行人只能有一个」+ 新增，放在同一事务里，避免中途失败留下两个默认
    // 第一个出行人自动设为默认，否则用户加完人却没有默认项
    const isDefault = dto.isDefault === true || count === 0;
    const id = await this.dataSource.transaction(async (em) => {
      if (isDefault) await em.update(Visitor, { userId }, { isDefault: 0 });
      const saved = await em.save(
        em.create(Visitor, {
          userId,
          name: dto.name,
          idCardEnc: this.cipher.encrypt(dto.idCard),
          idCardHash,
          idCardMask: maskIdCard(dto.idCard),
          phoneEnc: dto.phone ? this.cipher.encrypt(dto.phone) : null,
          isDefault: isDefault ? 1 : 0,
        }),
      );
      return Number(saved.id);
    });

    const created = await this.visitorRepo.findOne({ where: { id, userId } });
    return this.toView(created!);
  }

  async update(userId: number, id: number, dto: UpdateVisitorDto): Promise<VisitorView> {
    const visitor = await this.visitorRepo.findOne({ where: { id, userId } });
    // 用 404 而不是 403：不向调用方泄露「这个 id 存在、只是不属于你」
    if (!visitor) throw new NotFoundException('出行人不存在');

    const patch: Partial<Visitor> = {};
    if (dto.name !== undefined) patch.name = dto.name;

    if (dto.idCard !== undefined) {
      const nextHash = this.cipher.hash(dto.idCard);
      if (nextHash !== visitor.idCardHash) {
        await this.assertNotBlacklisted(dto.idCard, nextHash);
        const dup = await this.visitorRepo.findOne({ where: { userId, idCardHash: nextHash } });
        if (dup) throw new BadRequestException('该证件已在你的常用出行人中');
        patch.idCardEnc = this.cipher.encrypt(dto.idCard);
        patch.idCardHash = nextHash;
        patch.idCardMask = maskIdCard(dto.idCard);
      }
    }

    // 传空字符串 = 清空手机号
    if (dto.phone !== undefined) patch.phoneEnc = dto.phone ? this.cipher.encrypt(dto.phone) : null;

    await this.dataSource.transaction(async (em) => {
      if (dto.isDefault === true) {
        await em.update(Visitor, { userId }, { isDefault: 0 });
        patch.isDefault = 1;
      } else if (dto.isDefault === false) {
        patch.isDefault = 0;
      }
      if (Object.keys(patch).length) await em.update(Visitor, { id, userId }, patch);
    });

    const fresh = await this.visitorRepo.findOne({ where: { id, userId } });
    return this.toView(fresh!);
  }

  async remove(userId: number, id: number): Promise<null> {
    const visitor = await this.visitorRepo.findOne({ where: { id, userId } });
    if (!visitor) throw new NotFoundException('出行人不存在');

    // ⚠️ 这里是最容易做错的一处：`order_item` 只存 `visitor_id`，**不快照姓名与证件**，
    // 而且全库没有任何外键约束（`grep FOREIGN KEY deploy/sql/init.sql` = 0）。
    // 硬删一个被订单引用过的出行人，会让历史订单详情**丢掉持票人**
    //（`order.service.ts` 的 detail 是 join visitor 取 `visitorName` / `visitorIdCard` 的）。
    // 所以对这类记录拒绝删除，而不是放任产生悬空引用。
    // 备选是加 `deleted_at` 做软删，但那要动表结构，本轮不做。
    const used = await this.orderItemRepo.count({ where: { visitorId: id } });
    if (used > 0) {
      throw new BadRequestException('该出行人已用于历史订单，不能删除（否则订单记录会缺持票人）');
    }

    await this.visitorRepo.delete({ id, userId });
    return null;
  }

  /** 黑名单拦截：口径与下单时一致，证件的 sha256 命中且未过期就不许加/改 */
  private async assertNotBlacklisted(idCard: string, idCardHash: string): Promise<void> {
    const blocked = await this.blacklistRepo.findOne({
      where: { type: 1, valueHash: idCardHash, status: 1 },
    });
    if (blocked && (!blocked.expireTime || blocked.expireTime > new Date())) {
      throw new ForbiddenException(`证件 ${maskIdCard(idCard)} 已被限制预约`);
    }
  }

  private toView(v: Visitor): VisitorView {
    return {
      id: Number(v.id),
      name: v.name,
      idCardMask: v.idCardMask ?? '',
      phoneMask: this.maskStoredPhone(v.phoneEnc),
      isDefault: v.isDefault === 1,
      badge: v.isDefault === 1 ? '主出行人' : '同行',
    };
  }

  /**
   * 手机号要先解密再脱敏。**任何情况下都不返回原文** ——
   * `maskPhone` 对非 11 位输入会原样返回，所以这里对长度异常的记录直接给 `***`，
   * 否则一条脏数据就会把完整手机号漏出去。
   */
  private maskStoredPhone(phoneEnc: string | null): string {
    if (!phoneEnc) return '';
    try {
      const raw = this.cipher.decrypt(phoneEnc);
      return raw.length === 11 ? maskPhone(raw) : '***';
    } catch {
      return '';
    }
  }
}
