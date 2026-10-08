import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { SignOptions } from 'jsonwebtoken';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AdminUser } from '../../database/entities/admin-user.entity';
import { AdminRole, Role, RolePermission } from '../../database/entities/rbac.entity';
import { OperationLog } from '../../database/entities/system.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminUser, Role, AdminRole, RolePermission, OperationLog]),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: { expiresIn: config.get<string>('jwt.expiresIn') as SignOptions['expiresIn'] },
      }),
    }),
    ConfigModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
