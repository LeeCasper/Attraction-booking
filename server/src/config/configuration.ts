export default () => ({
  port: Number(process.env.PORT ?? 3000),
  env: process.env.NODE_ENV ?? 'development',
  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_DATABASE ?? 'attraction_booking',
  },
  redis: {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 6379),
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  },
  cred: {
    secret: process.env.CRED_SECRET ?? 'dev-cred-secret',
    version: Number(process.env.CRED_SECRET_VERSION ?? 1),
  },
  security: {
    idcardHashSalt: process.env.IDCARD_HASH_SALT ?? 'dev-salt',
    aesKey: process.env.AES_KEY ?? 'dev-aes-key-32-bytes-0123456789ab',
  },
  wx: {
    appid: process.env.WX_APPID ?? '',
    secret: process.env.WX_APP_SECRET ?? '',
  },
  wxpay: {
    mchid: process.env.WXPAY_MCHID ?? '',
    appid: process.env.WXPAY_APPID ?? '',
    serialNo: process.env.WXPAY_SERIAL_NO ?? '',
    privateKeyPath: process.env.WXPAY_PRIVATE_KEY_PATH ?? '',
    notifyUrl: process.env.WXPAY_NOTIFY_URL ?? '',
    refundNotifyUrl: process.env.WXPAY_REFUND_NOTIFY_URL ?? '',
  },
});
