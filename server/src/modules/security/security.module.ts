import { Global, Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CipherUtil } from '../../common/utils/cipher.util';

export const CIPHER = Symbol('CIPHER');

const cipherProvider: Provider = {
  provide: CIPHER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new CipherUtil(
      config.get<string>('security.aesKey')!,
      config.get<string>('security.idcardHashSalt')!,
    ),
};

/** 全局提供敏感字段加密工具（身份证/手机号 AES-256-GCM + 哈希比对） */
@Global()
@Module({
  providers: [cipherProvider],
  exports: [cipherProvider],
})
export class SecurityModule {}
