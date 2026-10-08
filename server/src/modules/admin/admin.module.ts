import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUser } from '../../database/entities/admin-user.entity';
import { AdminRole, Role, RolePermission } from '../../database/entities/rbac.entity';
import { OperationLog, SysConfig } from '../../database/entities/system.entity';
import { AuthModule } from '../auth/auth.module';
import { RoleController } from './role.controller';
import { RoleService } from './role.service';
import { AdminUserController } from './admin-user.controller';
import { AdminUserService } from './admin-user.service';
import { LogController, LogService } from './log.controller';
import { ConfigController } from './config.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminUser, Role, AdminRole, RolePermission, OperationLog, SysConfig]),
    AuthModule, // 复用 AuthService.writeLog
  ],
  controllers: [RoleController, AdminUserController, LogController, ConfigController],
  providers: [RoleService, AdminUserService, LogService],
  exports: [AdminUserService],
})
export class AdminModule {}
