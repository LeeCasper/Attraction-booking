import { BadGatewayException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { User } from '../../database/entities/user.entity';

/** 微信 code2session 响应 */
interface Code2SessionResult {
  openid?: string;
  unionid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
}

@Injectable()
export class MiniAuthService implements OnModuleInit {
  private readonly logger = new Logger(MiniAuthService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** 启动自检：小程序登录配置（与微信支付同理，避免上线才发现漏配） */
  onModuleInit() {
    if (this.mock) {
      this.logger.warn('小程序登录处于【模拟模式】(WX_MOCK=true)：任意 code 均可登录，上线前请置为 false');
      return;
    }

    const problems: string[] = [];
    if (!this.config.get<string>('wx.appid')) problems.push('WX_APPID 未配置');
    if (!this.config.get<string>('wx.secret')) problems.push('WX_APP_SECRET 未配置');

    if (problems.length > 0) {
      this.logger.error(`小程序登录配置不完整（WX_MOCK=false）：\n  - ${problems.join('\n  - ')}`);
    } else {
      this.logger.log(`小程序登录配置自检通过（AppID=${this.config.get<string>('wx.appid')}）`);
    }
  }

  /** 是否走模拟登录（WX_MOCK 显式控制，未配置 AppID 时默认开启） */
  private get mock(): boolean {
    return this.config.get<boolean>('wx.mock') ?? true;
  }

  /**
   * 小程序登录：code2session 换 openid → 建档 → 签发 JWT
   */
  async login(code: string) {
    const { openid, unionid } = await this.code2session(code);

    let user = await this.userRepo.findOne({ where: { openid } });
    if (!user) {
      user = await this.userRepo.save(this.userRepo.create({ openid, unionid: unionid ?? null }));
    }
    if (user.status !== 1) {
      throw new BadGatewayException('账号已被禁用');
    }

    const token = await this.jwt.signAsync(
      { sub: Number(user.id), openid: user.openid, typ: 'mini' },
      {
        secret: this.config.get<string>('jwt.miniSecret'),
        expiresIn: this.config.get<string>('jwt.miniExpiresIn') as SignOptions['expiresIn'],
      },
    );

    return {
      token,
      expiresIn: this.config.get<string>('jwt.miniExpiresIn'),
      userId: Number(user.id),
      openid: user.openid,
    };
  }

  private async code2session(code: string): Promise<{ openid: string; unionid?: string }> {
    if (this.mock) {
      // 本地联调：无小程序凭证时用 code 直接派生 openid，保持登录流程可跑通
      this.logger.warn(`未配置 WX_APPID，使用模拟登录：code=${code}`);
      return { openid: `mock_openid_${code}` };
    }

    const appid = this.config.get<string>('wx.appid')!;
    const secret = this.config.get<string>('wx.secret')!;
    const url =
      `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}` +
      `&secret=${secret}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;

    const res = await fetch(url);
    const data = (await res.json()) as Code2SessionResult;

    if (!data.openid) {
      this.logger.error(`code2session 失败：${JSON.stringify(data)}`);
      throw new BadGatewayException(`微信登录失败：${data.errmsg ?? '未知错误'}`);
    }
    return { openid: data.openid, unionid: data.unionid };
  }
}
