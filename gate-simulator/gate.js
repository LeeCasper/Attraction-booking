#!/usr/bin/env node
/**
 * 闸机模拟器：按设计文档 §5.4 的 HMAC 签名规则调用服务端 /api/gate/* 接口。
 * 零依赖，仅使用 Node.js 内置模块。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CONFIG_PATH = path.join(__dirname, 'config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`缺少配置文件：${CONFIG_PATH}\n请先从 config.example.json 复制并修改。`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

/** 与服务端一致的签名：HMAC-SHA256(secret, method + path + timestamp + nonce + body) */
function sign(secret, method, reqPath, timestamp, nonce, body) {
  const payload = `${method}${reqPath}${timestamp}${nonce}${body}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

async function callApi(config, method, reqPath, body) {
  const url = new URL(reqPath, config.serverUrl).toString();
  const raw = body ? JSON.stringify(body) : '';
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(8).toString('hex');
  const signature = sign(config.secretKey, method, new URL(reqPath, config.serverUrl).pathname, timestamp, nonce, raw);

  const started = Date.now();
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Gate-No': config.gateNo,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Signature': signature,
    },
    body: raw || undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, cost: Date.now() - started, json };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  const config = loadConfig();

  switch (command) {
    case 'heartbeat': {
      const beat = async () => {
        const r = await callApi(config, 'POST', '/api/gate/heartbeat', {
          gateNo: config.gateNo,
          firmwareVersion: 'sim-1.0.0',
          cachedRuleVersion: args['rule-version'] ?? 0,
        });
        console.log(`[${new Date().toLocaleTimeString()}] 心跳 ${r.status} (${r.cost}ms)`, JSON.stringify(r.json));
      };
      await beat();
      if (args.loop) {
        setInterval(() => beat().catch((e) => console.error('心跳失败：', e.message)), config.heartbeatIntervalMs);
        console.log(`已进入心跳循环（每 ${config.heartbeatIntervalMs}ms），Ctrl+C 退出`);
      }
      break;
    }

    case 'verify': {
      if (!args.token) {
        console.error('用法：node gate.js verify --token "<凭证Token>" [--direction 1]');
        process.exit(1);
      }
      const r = await callApi(config, 'POST', '/api/gate/verify', {
        gateNo: config.gateNo,
        credential: args.token,
        direction: Number(args.direction ?? config.direction),
      });
      console.log(r.status, `(${r.cost}ms)`, JSON.stringify(r.json, null, 2));
      const d = r.json?.data ?? {};
      // 服务端契约：open=true 即开闸；ok 为同义字段（管理端核销接口不含 open）
      if (d.open === true || d.ok === true) console.log(`>>> 开闸（指令号 ${d.cmdId}，剩余可入园 ${d.remaining}）`);
      else console.log(`>>> 拒绝通行 [${d.code}] ${d.message ?? r.json?.msg ?? ''}`);
      break;
    }

    case 'passage': {
      const r = await callApi(config, 'POST', '/api/gate/passage', {
        gateNo: config.gateNo,
        reservationId: args['reservation-id'] ? Number(args['reservation-id']) : null,
        direction: Number(args.direction ?? config.direction),
        result: Number(args.result ?? 1),
        passedAt: new Date().toISOString(),
      });
      console.log(r.status, `(${r.cost}ms)`, JSON.stringify(r.json));
      break;
    }

    case 'alarm': {
      const r = await callApi(config, 'POST', '/api/gate/alarm', {
        gateNo: config.gateNo,
        type: args.type ?? 'tailgate',
        level: Number(args.level ?? 2),
        content: args.content ?? '模拟告警：检测到尾随',
      });
      console.log(r.status, `(${r.cost}ms)`, JSON.stringify(r.json));
      break;
    }

    case 'offline-sync': {
      const file = args.file ?? path.join(__dirname, 'offline-batch.example.json');
      const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
      const r = await callApi(config, 'POST', '/api/gate/offline/sync', {
        gateNo: config.gateNo,
        batchNo: `SIM-${Date.now()}`,
        records: payload.records ?? payload,
      });
      console.log(r.status, `(${r.cost}ms)`, JSON.stringify(r.json, null, 2));
      break;
    }

    default:
      console.log(`闸机模拟器
用法：
  node gate.js heartbeat [--loop] [--rule-version N]   心跳上报
  node gate.js verify --token "<token>" [--direction 1]  凭证核验并开闸
  node gate.js passage --reservation-id N --direction 1 --result 1
  node gate.js alarm --type tailgate --level 2
  node gate.js offline-sync --file ./batch.json        离线记录批量上传
`);
  }
}

main().catch((err) => {
  console.error('执行失败：', err.message);
  process.exit(1);
});
