declare namespace Api {
  /**
   * namespace Gate
   *
   * 闸机设备、通行记录与告警
   * （对应服务端 /api/admin/gates、/api/admin/passages、/api/admin/alarms）
   */
  namespace Gate {
    /** 闸机设备 */
    interface Device {
      id: number;
      scenicAreaId: number;
      gateNo: string;
      name: string;
      location: string | null;
      ip: string | null;
      protocol: string;
      /** 1 入 / 2 出 / 3 双向 */
      direction: number;
      /** 1 在线 / 2 离线 / 3 禁用 / 4 故障 */
      status: number;
      lastHeartbeat: string | null;
      firmwareVersion: string | null;
      /** 由服务端按心跳时间计算 */
      online: boolean;
      heartbeatAgoSeconds: number | null;
    }

    /** 新增闸机的入参 */
    interface GateCreatePayload {
      scenicAreaId: number;
      /** 闸机身份，**全局唯一**（走 `X-Gate-No` 头，HMAC 签名里没有景区）—— 多景区用前缀区分 */
      gateNo: string;
      name?: string;
      location?: string;
      ip?: string;
      /** 1 入 / 2 出 / 3 双向 */
      direction?: number;
      /** 留空由服务端生成（长度 ≥ 8 才给填） */
      secretKey?: string;
    }

    /** 编辑闸机的入参（只改传了的字段） */
    interface GateUpdatePayload {
      /** 换绑景区：景区被删/换绑后闸机会核不了单，这是唯一的救济手段 */
      scenicAreaId?: number;
      name?: string;
      location?: string;
      ip?: string;
      direction?: number;
      /** 1 启用 / 3 禁用。2 离线、4 故障由心跳巡检维护，不接受直接写 */
      status?: number;
      /** 留空则不改动密钥 */
      secretKey?: string;
    }

    /** 新增闸机的返回：密钥**只在这里给一次**，列表接口不下发 */
    interface GateCreateResult {
      id: number;
      gateNo: string;
      secretKey: string;
    }

    /** 远程控制类型 */
    type CommandType = 'open' | 'hold_open' | 'close' | 'reboot';

    /** 通行记录 */
    interface PassageRow {
      id: number;
      reservationId: number | null;
      scenicAreaId: number;
      gateId: number;
      credential: string | null;
      /** 1 入园 / 2 出园 */
      direction: number;
      /** 1 通过 / 2 拒绝 / 3 异常 / 4 应急放行 */
      result: number;
      rejectReason: string | null;
      passedAt: string;
    }

    /** 通行记录查询参数 */
    interface PassageSearchParams {
      areaId?: number | null;
      gateId?: number | null;
      direction?: number | null;
      result?: number | null;
      date?: string | null;
    }

    /** 告警 */
    interface AlarmRow {
      id: number;
      /** gate_offline / tailgate / force_pass / duplicate_verify / offline_conflict */
      type: string;
      gateId: number | null;
      scenicAreaId: number | null;
      /** 1 提示 / 2 警告 / 3 严重 */
      level: number;
      /** 10 未处理 / 20 已处理 */
      status: number;
      content: string;
      handledBy: number | null;
      handledRemark: string | null;
      handledAt: string | null;
      createdAt: string;
    }

    /** 告警查询参数 */
    interface AlarmSearchParams {
      status?: number | null;
      level?: number | null;
    }
  }
}
