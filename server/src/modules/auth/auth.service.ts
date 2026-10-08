import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { AdminUser } from '../../database/entities/admin-user.entity';
import { AdminRole, Role, RolePermission } from '../../database/entities/rbac.entity';
import { OperationLog } from '../../database/entities/system.entity';
import { ChangePasswordDto } from './dto/change-password.dto';

const MAX_FAIL = 5;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AdminUser) private readonly adminRepo: Repository<AdminUser>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(AdminRole) private readonly adminRoleRepo: Repository<AdminRole>,
    @InjectRepository(RolePermission) private readonly permRepo: Repository<RolePermission>,
    @InjectRepository(OperationLog) private readonly logRepo: Repository<OperationLog>,
    private readonly jwt: JwtService,
  ) {}

  async login(username: string, password: string, ip: string) {
    const user = await this.adminRepo.findOne({ where: { username } });
    if (!user) throw new UnauthorizedException('账号或密码错误');
    if (user.status !== 1) throw new ForbiddenException('账号已禁用');
    if (user.pwdLockedUntil && user.pwdLockedUntil > new Date()) {
      throw new ForbiddenException(`密码错误次数过多，请 ${user.pwdLockedUntil.toLocaleTimeString()} 后重试`);
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      const fail = user.pwdFailCount + 1;
      await this.adminRepo.update(user.id, {
        pwdFailCount: fail,
        pwdLockedUntil: fail >= MAX_FAIL ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      });
      throw new UnauthorizedException('账号或密码错误');
    }

    await this.adminRepo.update(user.id, {
      pwdFailCount: 0,
      pwdLockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: ip,
    });
    const token = await this.jwt.signAsync({ sub: Number(user.id), username: user.username });
    const perms = await this.getPermissions(Number(user.id));
    await this.writeLog(Number(user.id), 'login', 'admin_user', Number(user.id), { ip });
    return { token, expiresIn: '8h', permissions: perms };
  }

  async getProfile(adminId: number) {
    const user = await this.adminRepo.findOne({ where: { id: adminId } });
    if (!user || user.status !== 1) throw new UnauthorizedException('账号不可用');
    const roleIds = (await this.adminRoleRepo.find({ where: { adminId } })).map((r) => Number(r.roleId));
    const roles = roleIds.length
      ? await this.roleRepo.findByIds(roleIds)
      : [] as Role[];
    const perms = await this.getPermissions(adminId);
    return {
      id: Number(user.id),
      username: user.username,
      realName: user.realName,
      roles: roles.map((r) => ({ id: Number(r.id), name: r.name, code: r.code })),
      permissions: perms,
    };
  }

  async changePassword(adminId: number, dto: ChangePasswordDto, ip: string) {
    const user = await this.adminRepo.findOne({ where: { id: adminId } });
    if (!user) throw new UnauthorizedException();
    if (!(await bcrypt.compare(dto.password, user.password))) {
      throw new BadRequestException('原密码错误');
    }
    if (dto.password === dto.newPassword) {
      throw new BadRequestException('新密码不能与原密码相同');
    }
    await this.adminRepo.update(adminId, { password: await bcrypt.hash(dto.newPassword, 10) });
    await this.writeLog(adminId, 'change_password', 'admin_user', adminId, { ip });
    return null;
  }

  async getPermissions(adminId: number): Promise<string[]> {
    const roles = await this.adminRoleRepo.find({ where: { adminId } });
    if (roles.length === 0) return [];
    const perms = await this.permRepo.find({
      where: roles.map((r) => ({ roleId: r.roleId })),
    });
    return [...new Set(perms.map((p) => p.permission))];
  }

  async writeLog(
    adminId: number,
    action: string,
    targetType?: string,
    targetId?: number | null,
    detail?: unknown,
    ip?: string,
  ) {
    await this.logRepo.save({
      adminId,
      action,
      targetType: targetType ?? null,
      targetId: targetId ?? null,
      detail: (detail ?? null) as Record<string, unknown> | null,
      ip: ip ?? null,
      createdAt: new Date(),
    });
  }
}
