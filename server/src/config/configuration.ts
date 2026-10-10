export default () => ({
  port: Number(process.env.PORT ?? 3000),
  env: process.env.NODE_ENV ?? 'development',
  /**
   * 业务时区（IANA 名）。
   *
   * 「今天/昨天」这类**日历日**必须按它算，不能按 `toISOString()`（那是 UTC，见
   * `common/utils/date.util.ts` 的说明）。必须与 MySQL 的
   * `--default-time-zone`（当前 `+08:00`）和部署主机的时区一致。
   */
  businessTz: process.env.BUSINESS_TZ ?? 'Asia/Shanghai',
  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_DATABASE ?? 'attraction_booking',
    // 连接池大小。mysql2 默认只有 10 —— 下单/核验这类事务会持有连接直到提交，
    // 高并发下请求全堵在连接池上排队（压测实测：1000 并发时 P50 达 3.7s）。
    // 需要满足「单实例 1000+ 并发」，调大可显著降低排队时间，
    // 上限受 MySQL max_connections（默认 151）与实例数约束：实例数 × poolSize < 151。
    poolSize: Number(process.env.DB_POOL_SIZE ?? 20),
  },
  redis: {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 6379),
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
    /** 小程序端独立密钥（与设计文档「双 JWT 体系」一致） */
    miniSecret: process.env.JWT_MINI_SECRET ?? `${process.env.JWT_SECRET ?? 'dev-secret'}:mini`,
    miniExpiresIn: process.env.JWT_MINI_EXPIRES_IN ?? '7d',
  },
  cred: {
    secret: process.env.CRED_SECRET ?? 'dev-cred-secret',
    version: Number(process.env.CRED_SECRET_VERSION ?? 1),
    /** 密钥轮换期：旧版本密钥在有效期内继续可验签 */
    prevSecret: process.env.CRED_SECRET_PREV ?? '',
    prevVersion: process.env.CRED_SECRET_PREV_VERSION ? Number(process.env.CRED_SECRET_PREV_VERSION) : 0,
  },
  security: {
    idcardHashSalt: process.env.IDCARD_HASH_SALT ?? 'dev-salt',
    aesKey: process.env.AES_KEY ?? 'dev-aes-key-32-bytes-0123456789ab',
  },
  backup: {
    /** 备份目录（相对路径按服务端运行目录解析） */
    dir: process.env.BACKUP_DIR ?? './backups',
    /** mysqldump 可执行文件；容器化部署时可指向包装脚本 */
    dumpBin: process.env.BACKUP_DUMP_BIN ?? '',
  },
  wx: {
    appid: process.env.WX_APPID ?? '',
    secret: process.env.WX_APP_SECRET ?? '',
    /**
     * 小程序登录模拟开关
     *
     * 显式由 WX_MOCK 控制；未设置时「未配置 AppID」才走模拟。
     * 之所以独立于 AppID 是否存在，是因为本地开发即使配了真实 AppID
     * 也拿不到合法 wx.login code，仍需要模拟登录来跑通链路。
     */
    mock:
      process.env.WX_MOCK !== undefined
        ? process.env.WX_MOCK === 'true'
        : !(process.env.WX_APPID ?? ''),
  },
  wxpay: {
    mchid: process.env.WXPAY_MCHID ?? '',
    appid: process.env.WXPAY_APPID ?? '',
    serialNo: process.env.WXPAY_SERIAL_NO ?? '',
    privateKeyPath: process.env.WXPAY_PRIVATE_KEY_PATH ?? '',
    /** APIv3 密钥，用于回调报文 AES-256-GCM 解密 */
    apiV3Key: process.env.WXPAY_API_V3_KEY ?? '',
    notifyUrl: process.env.WXPAY_NOTIFY_URL ?? '',
    refundNotifyUrl: process.env.WXPAY_REFUND_NOTIFY_URL ?? '',
    /**
     * 本地联调模式：本机无商户证书时置 true，
     * 用模拟的 prepay_id / 回调驱动全链路，上线前务必设为 false
     */
    mock: (process.env.WXPAY_MOCK ?? 'true') === 'true',
    /** 支付超时（分钟），与 order 模块一致 */
    payTimeoutMinutes: Number(process.env.PAY_TIMEOUT_MINUTES ?? 15),
  },
});
