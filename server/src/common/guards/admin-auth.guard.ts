import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { Request } from 'express';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { REDIS_CLIENT, RedisClient } from '../../modules/redis/redis.constants';

/** 登录等免认证路径（相对 /api/admin） */
const WHITELIST = ['/admin/auth/login'];

/**
 * 全局守卫：
 * - /api/admin/** 需 JWT + RBAC（白名单除外）
 * - /api/mini、/api/gate、/pay 由各自模块自行处理（M2/M3 接入）
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly dataSource: DataSource,
    private readonly reflector: Reflector,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { admin?: { id: number; username: string } }>();
    if (!req.path.startsWith('/api/admin')) return true;

    const relative = req.path.replace('/api', '');
    if (WHITELIST.includes(relative)) return true;

    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('未登录');
    let payload: { sub: number; username: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('登录已失效');
    }
    req.admin = { id: payload.sub, username: payload.username };

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]) ?? [];
    if (required.length === 0) return true;

    const perms = await this.getPermissions(payload.sub);
    if (perms.includes('*')) return true;
    if (!required.every((p) => perms.includes(p))) {
      throw new ForbiddenException('无操作权限');
    }
    return true;
  }

  private async getPermissions(adminId: number): Promise<string[]> {
    const cacheKey = `perm:admin:${adminId}`;
    const cached = await this.redis.smembers(cacheKey);
    if (cached.length > 0) return cached;

    const rows: { permission: string }[] = await this.dataSource.query(
      `SELECT DISTINCT rp.permission
         FROM role_permission rp
         JOIN admin_role ar ON ar.role_id = rp.role_id
        WHERE ar.admin_id = ?`,
      [adminId],
    );
    const perms = rows.map((r) => r.permission);
    if (perms.length > 0) {
      await this.redis.sadd(cacheKey, perms);
      await this.redis.expire(cacheKey, 60);
    }
    return perms;
  }
}
