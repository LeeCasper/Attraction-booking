import { Body, Controller, Get, Ip, Post, Put, Req, Request } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiTags('后台-认证')
@Controller('admin/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: '登录' })
  async login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.authService.login(dto.username, dto.password, ip);
  }

  @Get('profile')
  @ApiOperation({ summary: '当前管理员信息与权限' })
  async profile(@Request() req: Express.Request) {
    const admin = (req as Express.Request & { admin: { id: number } }).admin;
    return this.authService.getProfile(admin.id);
  }

  @Put('password')
  @ApiOperation({ summary: '修改密码' })
  async changePassword(@Request() req: Express.Request, @Body() dto: ChangePasswordDto, @Ip() ip: string) {
    const admin = (req as Express.Request & { admin: { id: number } }).admin;
    return this.authService.changePassword(admin.id, dto, ip);
  }
}
