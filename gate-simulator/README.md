# 闸机模拟器（Gate Simulator）

一期用于在无真实闸机硬件时联调门禁联动接口（设计文档 §5.4 / §6.4）。
零依赖（仅 Node.js 内置模块），无需 npm install。

## 用法

```bash
# 心跳（每 30s 上报，模拟闸机在线）
node gate.js heartbeat --loop

# 核验凭证（模拟扫码头读取二维码）
node gate.js verify --token "<二维码Token>" --direction 1

# 上报通行结果
node gate.js passage --reservation-id 1 --direction 1 --result 1

# 告警（尾随 / 强行通过）
node gate.js alarm --type tailgate --level 2

# 离线记录批量上传（断网恢复后）
node gate.js offline-sync --file ./offline-batch.example.json
```

## 配置

复制 `config.example.json` 为 `config.json` 并按实际环境修改：

| 字段 | 说明 |
| ---- | ---- |
| `serverUrl` | 服务端地址，如 `http://localhost:3000` |
| `gateNo` | 闸机编号（需与 `gate_device.gate_no` 一致） |
| `secretKey` | 闸机密钥（与 `gate_device.secret_key` 一致），用于 HMAC 签名 |
| `direction` | 1 入园 / 2 出园 / 3 双向 |

## 联调命令

```bash
node gate.js heartbeat            # 上报心跳（服务端更新在线状态并返回规则版本）
node gate.js heartbeat --loop     # 持续心跳，模拟在线闸机
node gate.js verify --token "<凭证>"   # 扫码核验 → 返回 open/cmdId/剩余人数
node gate.js passage --reservation-id N --direction 1 --result 1   # 通行回执（计入在园人数）
node gate.js alarm --type tailgate --level 3   # 告警上报
node gate.js offline-sync --file ./offline-batch.example.json      # 离线记录批量上传
```

`verify` 返回 `open: true` 即开闸，`cmdId` 为幂等指令号（同一指令号闸机只需开闸一次），
失败时用 `code`（如 `ALREADY_VERIFIED` / `WRONG_DATE` / `EXPIRED`）驱动语音与屏幕提示。

## 签名算法（与服务端一致）

请求头携带：

```
X-Gate-No:    GATE001
X-Timestamp:  1728360000000        # 毫秒，服务端容差 ±60s
X-Nonce:      <16字节随机hex>
X-Signature:  HMAC-SHA256(secretKey, method + path + timestamp + nonce + body)
```

服务端 `gate` 模块（M3）按同样规则验签并对 nonce 做 Redis 去重（防重放）。
