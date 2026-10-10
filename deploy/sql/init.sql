-- ============================================================
-- 景区预约管理及门禁联动系统 数据库初始化
-- 依据《技术方案设计》§2，MySQL 8.0，utf8mb4
-- 约定：主键 id BIGINT UNSIGNED AUTO_INCREMENT；金额单位分；
--      身份证/手机号 AES-256-GCM 加密存储；核验比对哈希不还原明文
-- ============================================================

CREATE DATABASE IF NOT EXISTS attraction_booking
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE attraction_booking;

-- ------------------------------------------------------------
-- 用户与游客
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `user` (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  openid     VARCHAR(64)  NOT NULL COMMENT '微信 openid',
  unionid    VARCHAR(64)  NULL,
  phone_enc  VARCHAR(255) NULL COMMENT '手机号(AES-256-GCM 密文)',
  phone_hash CHAR(64)     NULL COMMENT '手机号哈希(登录/查重)',
  nickname   VARCHAR(64)  NULL,
  status     TINYINT      NOT NULL DEFAULT 1 COMMENT '1正常 2禁用',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_openid (openid),
  KEY idx_phone_hash (phone_hash)
) ENGINE=InnoDB COMMENT='小程序用户';

CREATE TABLE IF NOT EXISTS `visitor` (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NOT NULL COMMENT '归属用户',
  name        VARCHAR(64)  NOT NULL COMMENT '姓名',
  id_card_enc VARCHAR(255) NOT NULL COMMENT '身份证(AES-256-GCM 密文)',
  id_card_hash CHAR(64)    NOT NULL COMMENT '身份证哈希(限购/核验比对)',
  id_card_mask VARCHAR(32) NULL COMMENT '脱敏展示用',
  phone_enc   VARCHAR(255) NULL,
  is_default  TINYINT     NOT NULL DEFAULT 0 COMMENT '默认出行人',
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_user (user_id),
  UNIQUE KEY uk_user_idcard (user_id, id_card_hash)
) ENGINE=InnoDB COMMENT='游客/同行人';

-- ------------------------------------------------------------
-- 景区
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS scenic_area (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(128) NOT NULL,
  address      VARCHAR(255) NULL,
  intro        TEXT         NULL COMMENT '简介',
  cover_url    VARCHAR(512) NULL,
  open_time    VARCHAR(64)  NULL COMMENT '开放时间描述 08:00-17:00',
  max_capacity INT          NOT NULL DEFAULT 10000 COMMENT '最大瞬时承载量',
  category     VARCHAR(16)  NULL COMMENT '景点分类 main主景区/nature自然风光/culture历史人文/cable索道缆车/night夜游演艺，NULL=未分类',
  status       TINYINT      NOT NULL DEFAULT 1 COMMENT '1开放 2关闭',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='景区';

CREATE TABLE IF NOT EXISTS announcement (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  scenic_area_id BIGINT UNSIGNED NOT NULL,
  title         VARCHAR(128) NOT NULL,
  content       TEXT         NULL,
  status        TINYINT      NOT NULL DEFAULT 1 COMMENT '1已发布 2下架',
  published_at  DATETIME     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_area_status (scenic_area_id, status)
) ENGINE=InnoDB COMMENT='公告';

-- ------------------------------------------------------------
-- 票种 / 时段 / 价格日历 / 库存
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ticket_type (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  scenic_area_id BIGINT UNSIGNED NOT NULL,
  name          VARCHAR(64)  NOT NULL COMMENT '成人票/儿童票…',
  audience      VARCHAR(64)  NULL COMMENT '适用人群',
  base_price    INT          NOT NULL DEFAULT 0 COMMENT '基础价(分)',
  -- 计价单位：person=按人卖（下单金额 = 单价 × 人数），ticket=按张卖。
  -- ⚠️ 目前**只有 person 实现了计价** —— order.service.ts 是硬编码的
  --    `金额 = 单价 × 人数`，每张票对应一位游客。ticket 目前仅用于在客户端
  --    标记「该票种暂不支持在线预约」，避免把它按人数算成错金额。
  sale_unit     VARCHAR(16)  NOT NULL DEFAULT 'person' COMMENT '计价单位 person|ticket',
  refund_rule   JSON         NULL COMMENT '退改规则 {before_day:1,fee_rate:0.2…}',
  need_realname TINYINT      NOT NULL DEFAULT 1 COMMENT '是否实名',
  status        TINYINT      NOT NULL DEFAULT 1 COMMENT '1上架 2下架',
  remark        VARCHAR(255) NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_area (scenic_area_id)
) ENGINE=InnoDB COMMENT='票种';

CREATE TABLE IF NOT EXISTS time_slot (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  scenic_area_id BIGINT UNSIGNED NOT NULL,
  name          VARCHAR(32)  NOT NULL COMMENT '上午场',
  start_time    TIME         NOT NULL COMMENT '08:00',
  end_time      TIME         NOT NULL COMMENT '10:00',
  sort_order    INT          NOT NULL DEFAULT 0,
  status        TINYINT      NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_area (scenic_area_id)
) ENGINE=InnoDB COMMENT='时段定义';

CREATE TABLE IF NOT EXISTS price_calendar (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_type_id BIGINT UNSIGNED NOT NULL,
  date           DATE NOT NULL,
  price          INT  NOT NULL COMMENT '当日价(分)',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_type_date (ticket_type_id, date)
) ENGINE=InnoDB COMMENT='价格日历(无记录日取票种基础价)';

CREATE TABLE IF NOT EXISTS ticket_stock (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  scenic_area_id BIGINT UNSIGNED NOT NULL,
  ticket_type_id BIGINT UNSIGNED NOT NULL,
  date           DATE NOT NULL,
  time_slot_id   BIGINT UNSIGNED NOT NULL,
  total          INT NOT NULL COMMENT '总库存',
  sold           INT NOT NULL DEFAULT 0 COMMENT '已售',
  locked         INT NOT NULL DEFAULT 0 COMMENT '下单锁定',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_type_date_slot (ticket_type_id, date, time_slot_id)
) ENGINE=InnoDB COMMENT='分时库存';

CREATE TABLE IF NOT EXISTS stock_change_log (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_stock_id BIGINT UNSIGNED NOT NULL,
  change_type    VARCHAR(16) NOT NULL COMMENT 'manual_add/manual_sub/generate/refund_back',
  change_value   INT NOT NULL COMMENT '变化量(±)',
  before_value   INT NOT NULL COMMENT '调整前 total',
  after_value    INT NOT NULL,
  operator_id    BIGINT UNSIGNED NULL,
  remark         VARCHAR(255) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_stock (ticket_stock_id)
) ENGINE=InnoDB COMMENT='库存调整日志';

CREATE TABLE IF NOT EXISTS purchase_rule (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_type_id BIGINT UNSIGNED NOT NULL,
  per_user_per_order INT NOT NULL DEFAULT 4 COMMENT '单笔限购',
  per_user_per_day  INT NOT NULL DEFAULT 5 COMMENT '每人每日限购',
  per_idcard_per_day INT NOT NULL DEFAULT 1 COMMENT '每证每日限购',
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_type (ticket_type_id)
) ENGINE=InnoDB COMMENT='限购规则';

-- ------------------------------------------------------------
-- 订单 / 支付 / 退款 / 改签
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS orders (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_no       VARCHAR(32) NOT NULL COMMENT '业务单号',
  user_id        BIGINT UNSIGNED NOT NULL,
  scenic_area_id BIGINT UNSIGNED NOT NULL,
  reservation_id BIGINT UNSIGNED NULL,
  amount         INT NOT NULL COMMENT '实付(分)',
  status         TINYINT NOT NULL COMMENT '10待支付 20已支付待核销 30部分核销 40已核销 50已取消 60已退款 70已过期',
  channel        VARCHAR(16) NOT NULL DEFAULT 'mini' COMMENT 'mini/ota/window',
  pay_deadline   DATETIME NOT NULL,
  pay_time       DATETIME NULL,
  cancel_reason  VARCHAR(255) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_order_no (order_no),
  KEY idx_user_status (user_id, status),
  KEY idx_area_created (scenic_area_id, created_at),
  KEY idx_status_deadline (status, pay_deadline)
) ENGINE=InnoDB COMMENT='订单';

CREATE TABLE IF NOT EXISTS order_item (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id       BIGINT UNSIGNED NOT NULL,
  visitor_id     BIGINT UNSIGNED NOT NULL,
  ticket_type_id BIGINT UNSIGNED NOT NULL,
  price          INT NOT NULL COMMENT '成交价快照(分)',
  status         TINYINT NOT NULL DEFAULT 10 COMMENT '10待核销 20已核销 30已退款',
  refund_id      BIGINT UNSIGNED NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_order_visitor (order_id, visitor_id),
  KEY idx_visitor (visitor_id)
) ENGINE=InnoDB COMMENT='订单明细(每游客一行,支撑部分核销)';

CREATE TABLE IF NOT EXISTS payment (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id       BIGINT UNSIGNED NOT NULL,
  transaction_id VARCHAR(64) NULL COMMENT '微信支付单号',
  amount         INT NOT NULL,
  status         TINYINT NOT NULL DEFAULT 1 COMMENT '1支付中 2成功 3失败 4已关闭',
  raw_callback   JSON NULL,
  callback_time  DATETIME NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_order (order_id),
  UNIQUE KEY uk_transaction (transaction_id)
) ENGINE=InnoDB COMMENT='支付流水';

CREATE TABLE IF NOT EXISTS refund (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  refund_no      VARCHAR(32) NOT NULL,
  order_id       BIGINT UNSIGNED NOT NULL,
  order_item_id  BIGINT UNSIGNED NULL COMMENT '按人退款;空=整单',
  user_id        BIGINT UNSIGNED NOT NULL,
  amount         INT NOT NULL COMMENT '申请退款额(分)',
  actual_amount  INT NULL COMMENT '实退(扣手续费)',
  fee            INT NOT NULL DEFAULT 0,
  reason         VARCHAR(255) NOT NULL,
  status         TINYINT NOT NULL DEFAULT 10 COMMENT '10待审核 20退款中 30已退款 40已拒绝 50退款失败',
  audit_by       BIGINT UNSIGNED NULL,
  audit_remark   VARCHAR(255) NULL,
  wx_refund_id   VARCHAR(64) NULL COMMENT '微信退款单号',
  audited_at     DATETIME NULL,
  refunded_at    DATETIME NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_refund_no (refund_no),
  KEY idx_order (order_id),
  KEY idx_status (status)
) ENGINE=InnoDB COMMENT='退款单';

CREATE TABLE IF NOT EXISTS reschedule (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reservation_id BIGINT UNSIGNED NOT NULL,
  old_date       DATE NOT NULL,
  old_time_slot_id BIGINT UNSIGNED NOT NULL,
  new_date       DATE NOT NULL,
  new_time_slot_id BIGINT UNSIGNED NOT NULL,
  status         TINYINT NOT NULL DEFAULT 10 COMMENT '10待审核 20已通过 30已拒绝',
  audit_by       BIGINT UNSIGNED NULL,
  audit_remark   VARCHAR(255) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_res (reservation_id),
  KEY idx_status (status)
) ENGINE=InnoDB COMMENT='改签记录';

-- ------------------------------------------------------------
-- 预约 / 核销 / 通行
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reservation (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id       BIGINT UNSIGNED NOT NULL,
  scenic_area_id BIGINT UNSIGNED NOT NULL,
  date           DATE NOT NULL,
  time_slot_id   BIGINT UNSIGNED NOT NULL,
  status         TINYINT NOT NULL DEFAULT 10 COMMENT '10待使用 20已使用 30已取消 40已过期 50已改签',
  verify_count   INT NOT NULL DEFAULT 0,
  total_count    INT NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_order (order_id),
  KEY idx_area_date_slot (scenic_area_id, date, time_slot_id),
  KEY idx_date_status (date, status)
) ENGINE=InnoDB COMMENT='预约(凭证 Token 动态签发,不落静态码)';

CREATE TABLE IF NOT EXISTS verification (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reservation_id BIGINT UNSIGNED NOT NULL,
  order_item_id  BIGINT UNSIGNED NOT NULL,
  channel        VARCHAR(16) NOT NULL COMMENT 'gate/pda/manual',
  gate_id        BIGINT UNSIGNED NULL,
  operator_id    BIGINT UNSIGNED NULL,
  verify_time     DATETIME(3) NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_item_once (order_item_id),
  KEY idx_res (reservation_id)
) ENGINE=InnoDB COMMENT='核销记录(唯一索引=幂等防线)';

CREATE TABLE IF NOT EXISTS passage_record (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reservation_id BIGINT UNSIGNED NULL COMMENT '应急放行等可为空',
  scenic_area_id BIGINT UNSIGNED NOT NULL,
  gate_id        BIGINT UNSIGNED NOT NULL,
  credential     VARCHAR(128) NULL COMMENT '凭证摘要(脱敏)',
  direction      TINYINT NOT NULL COMMENT '1入园 2出园',
  result         TINYINT NOT NULL COMMENT '1通过 2拒绝 3异常 4应急放行',
  reject_reason  VARCHAR(32) NULL,
  passed_at      DATETIME(3) NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_gate_time (gate_id, passed_at),
  KEY idx_area_dir_time (scenic_area_id, direction, passed_at),
  KEY idx_res (reservation_id)
) ENGINE=InnoDB COMMENT='通行记录';

-- ------------------------------------------------------------
-- 闸机设备
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gate_device (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  scenic_area_id BIGINT UNSIGNED NOT NULL,
  gate_no        VARCHAR(32) NOT NULL,
  name           VARCHAR(64) NOT NULL,
  location       VARCHAR(128) NULL,
  ip             VARCHAR(64) NULL,
  protocol       VARCHAR(16) NOT NULL DEFAULT 'http' COMMENT 'http/mqtt/tcp/sdk',
  direction      TINYINT NOT NULL DEFAULT 1 COMMENT '1入 2出 3双向',
  status         TINYINT NOT NULL DEFAULT 2 COMMENT '1在线 2离线 3禁用 4故障',
  last_heartbeat DATETIME(3) NULL,
  secret_key     VARCHAR(128) NOT NULL,
  allowed_slots  JSON NULL COMMENT '通行规则缓存(时段/票种)',
  firmware_version VARCHAR(32) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_gate_no (gate_no),
  KEY idx_area (scenic_area_id)
) ENGINE=InnoDB COMMENT='闸机设备';

CREATE TABLE IF NOT EXISTS gate_log (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  gate_id    BIGINT UNSIGNED NULL,
  action     VARCHAR(32) NOT NULL COMMENT 'verify/heartbeat/passage/command/alarm',
  request    JSON NULL,
  response   JSON NULL,
  cost_ms    INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_gate_time (gate_id, created_at)
) ENGINE=InnoDB COMMENT='闸机通信日志';

CREATE TABLE IF NOT EXISTS gate_command (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  gate_id    BIGINT UNSIGNED NOT NULL,
  command_no VARCHAR(64) NOT NULL COMMENT '幂等键',
  type       VARCHAR(16) NOT NULL COMMENT 'open/hold_open/close/reboot',
  status     TINYINT NOT NULL DEFAULT 10 COMMENT '10已下发 20已执行 30超时失败',
  issued_by  BIGINT UNSIGNED NULL,
  sent_at    DATETIME(3) NOT NULL,
  ack_at     DATETIME(3) NULL,
  UNIQUE KEY uk_command_no (command_no),
  KEY idx_gate (gate_id)
) ENGINE=InnoDB COMMENT='下行指令';

CREATE TABLE IF NOT EXISTS offline_sync_record (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  gate_id       BIGINT UNSIGNED NOT NULL,
  batch_no      VARCHAR(64) NOT NULL,
  payload       JSON NOT NULL,
  sync_status   TINYINT NOT NULL DEFAULT 10 COMMENT '10待处理 20已合并 30冲突待审核',
  conflict_note VARCHAR(255) NULL,
  synced_at     DATETIME NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_status (sync_status),
  KEY idx_gate_batch (gate_id, batch_no)
) ENGINE=InnoDB COMMENT='离线记录同步';

-- ------------------------------------------------------------
-- 风控 / 黑名单
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blacklist (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type        TINYINT NOT NULL DEFAULT 1 COMMENT '1身份证 2手机号 3用户',
  value_hash  CHAR(64) NOT NULL COMMENT '命中值哈希',
  value_mask  VARCHAR(64) NULL,
  reason      VARCHAR(255) NOT NULL,
  expire_time DATETIME NULL COMMENT '空=永久',
  status      TINYINT NOT NULL DEFAULT 1 COMMENT '1生效 2解除',
  created_by  BIGINT UNSIGNED NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_type_value (type, value_hash),
  KEY idx_status_expire (status, expire_time)
) ENGINE=InnoDB COMMENT='黑名单';

-- ------------------------------------------------------------
-- 管理端 RBAC / 日志 / 配置
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS admin_user (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username    VARCHAR(32) NOT NULL,
  password    VARCHAR(128) NOT NULL COMMENT 'bcrypt',
  real_name   VARCHAR(32) NULL,
  phone       VARCHAR(20) NULL,
  status      TINYINT NOT NULL DEFAULT 1 COMMENT '1正常 2禁用',
  last_login_at DATETIME NULL,
  last_login_ip VARCHAR(64) NULL,
  pwd_fail_count INT NOT NULL DEFAULT 0 COMMENT '连续失败次数',
  pwd_locked_until DATETIME NULL COMMENT '锁定截止',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_username (username)
) ENGINE=InnoDB COMMENT='管理员';

CREATE TABLE IF NOT EXISTS role (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(32) NOT NULL,
  code       VARCHAR(32) NOT NULL COMMENT 'super/admin/checker/finance/ops/leader',
  remark     VARCHAR(128) NULL,
  status     TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_code (code)
) ENGINE=InnoDB COMMENT='角色';

CREATE TABLE IF NOT EXISTS admin_role (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id   BIGINT UNSIGNED NOT NULL,
  role_id    BIGINT UNSIGNED NOT NULL,
  UNIQUE KEY uk_admin_role (admin_id, role_id)
) ENGINE=InnoDB COMMENT='管理员-角色';

CREATE TABLE IF NOT EXISTS role_permission (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_id    BIGINT UNSIGNED NOT NULL,
  permission VARCHAR(64) NOT NULL COMMENT '如 ticket:create, *',
  UNIQUE KEY uk_role_perm (role_id, permission),
  KEY idx_role (role_id)
) ENGINE=InnoDB COMMENT='角色-权限';

CREATE TABLE IF NOT EXISTS operation_log (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id    BIGINT UNSIGNED NOT NULL,
  action      VARCHAR(64) NOT NULL COMMENT 'login/ticket:create/stock:update…',
  target_type VARCHAR(32) NULL,
  target_id   BIGINT UNSIGNED NULL,
  detail      JSON NULL,
  ip          VARCHAR(64) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_admin_time (admin_id, created_at),
  KEY idx_action_time (action, created_at)
) ENGINE=InnoDB COMMENT='操作日志(append-only)';

CREATE TABLE IF NOT EXISTS sys_config (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  config_key VARCHAR(64) NOT NULL,
  config_value JSON NOT NULL,
  remark     VARCHAR(255) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_key (config_key)
) ENGINE=InnoDB COMMENT='参数配置';

-- ------------------------------------------------------------
-- 告警 / 统计
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS alarm (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type           VARCHAR(32) NOT NULL COMMENT 'gate_offline/tailgate/force_pass/duplicate_verify/capacity_80…',
  gate_id        BIGINT UNSIGNED NULL,
  scenic_area_id BIGINT UNSIGNED NULL,
  level          TINYINT NOT NULL DEFAULT 2 COMMENT '1提示 2警告 3严重',
  status         TINYINT NOT NULL DEFAULT 10 COMMENT '10未处理 20已处理',
  content        VARCHAR(512) NOT NULL,
  handled_by     BIGINT UNSIGNED NULL,
  handled_remark  VARCHAR(255) NULL,
  handled_at     DATETIME NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_status_level (status, level),
  KEY idx_type_time (type, created_at)
) ENGINE=InnoDB COMMENT='告警';

CREATE TABLE IF NOT EXISTS daily_stats (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  date           DATE NOT NULL,
  scenic_area_id BIGINT UNSIGNED NOT NULL,
  reservations   INT NOT NULL DEFAULT 0,
  verifications  INT NOT NULL DEFAULT 0,
  in_count       INT NOT NULL DEFAULT 0,
  out_count      INT NOT NULL DEFAULT 0,
  income         BIGINT NOT NULL DEFAULT 0 COMMENT '实收(分)',
  refund_amount  BIGINT NOT NULL DEFAULT 0,
  orders_paid    INT NOT NULL DEFAULT 0,
  orders_refund  INT NOT NULL DEFAULT 0,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_area_date (scenic_area_id, date)
) ENGINE=InnoDB COMMENT='日统计';

CREATE TABLE IF NOT EXISTS hourly_stats (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  date           DATE NOT NULL,
  hour           TINYINT NOT NULL,
  scenic_area_id BIGINT UNSIGNED NOT NULL,
  in_count       INT NOT NULL DEFAULT 0,
  out_count      INT NOT NULL DEFAULT 0,
  verifications  INT NOT NULL DEFAULT 0,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_area_date_hour (scenic_area_id, date, hour)
) ENGINE=InnoDB COMMENT='分时统计';

-- ------------------------------------------------------------
-- M4：对账与备份
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reconciliation (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  date            DATE NOT NULL COMMENT '对账日期',
  scenic_area_id  BIGINT UNSIGNED NOT NULL COMMENT '所属景区（对账是**按景区**跑的，缺了这列多景区会互相覆盖）',
  channel         VARCHAR(16) NOT NULL DEFAULT 'wxpay' COMMENT 'wxpay/alipay/ota',
  order_count     INT NOT NULL DEFAULT 0 COMMENT '订单侧笔数',
  order_amount    BIGINT NOT NULL DEFAULT 0 COMMENT '订单侧金额(分)',
  payment_count   INT NOT NULL DEFAULT 0 COMMENT '支付流水侧笔数',
  payment_amount  BIGINT NOT NULL DEFAULT 0,
  refund_count    INT NOT NULL DEFAULT 0 COMMENT '退款侧笔数',
  refund_amount   BIGINT NOT NULL DEFAULT 0,
  diff_count      INT NOT NULL DEFAULT 0 COMMENT '差异笔数',
  diff_detail     JSON NULL COMMENT '差异明细',
  status          TINYINT NOT NULL DEFAULT 10 COMMENT '10 已核对无差异 20 存在差异 30 核对失败',
  remark          VARCHAR(255) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_date_channel_area (date, channel, scenic_area_id),
  KEY idx_status (status)
) ENGINE=InnoDB COMMENT='对账记录（订单/支付/退款三方核对）';

CREATE TABLE IF NOT EXISTS data_backup (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  file_name     VARCHAR(128) NOT NULL,
  file_path     VARCHAR(512) NOT NULL,
  file_size     BIGINT NOT NULL DEFAULT 0 COMMENT '字节',
  type          VARCHAR(16) NOT NULL DEFAULT 'auto' COMMENT 'auto/manual',
  status        TINYINT NOT NULL DEFAULT 10 COMMENT '10 进行中 20 成功 30 失败',
  remark        VARCHAR(255) NULL,
  created_by    BIGINT UNSIGNED NULL COMMENT '手动备份的操作人',
  started_at    DATETIME NOT NULL,
  finished_at   DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_created (created_at),
  KEY idx_status (status)
) ENGINE=InnoDB COMMENT='数据备份记录';
