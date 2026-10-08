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

## 签名算法（与服务端一致）

请求头携带：

```
X-Gate-No:    GATE001
X-Timestamp:  1728360000000        # 毫秒，服务端容差 ±60s
X-Nonce:      <16字节随机hex>
X-Signature:  HMAC-SHA256(secretKey, method + path + timestamp + nonce + body)
```

服务端 `gate` 模块（M3）按同样规则验签并对 nonce 做 Redis 去重（防重放）。
