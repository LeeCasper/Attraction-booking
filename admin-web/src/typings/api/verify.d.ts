declare namespace Api {
  /**
   * namespace Verify
   *
   * 核销（对应服务端 /api/admin/verify、/api/admin/verifications）
   */
  namespace Verify {
    /** 核销结果码：与服务端 VerifyCode 一致 */
    type Code =
      | 'OK'
      | 'INVALID_CREDENTIAL'
      | 'EXPIRED'
      | 'NOT_PAID'
      | 'WRONG_DATE'
      | 'WRONG_SLOT'
      | 'ALREADY_VERIFIED'
      | 'BLACKLIST'
      | 'GATE_NO_PERMISSION';

    /** 核销请求（三者其一） */
    interface VerifyPayload {
      /** 二维码 token（扫码核销） */
      credential?: string;
      /** 订单号（手动核销） */
      orderNo?: string;
      /** 身份证哈希（刷证核销） */
      idCardHash?: string;
      /** 证件后四位，用于精确到人 */
      idCardSuffix?: string;
      /** 1 入园 / 2 出园 */
      direction?: number;
    }

    /** 核销结果 */
    interface VerifyOutcome {
      ok: boolean;
      code: Code;
      message: string;
      /** 开闸指令号 */
      cmdId?: string;
      reservationId?: number;
      orderNo?: string;
      visitorName?: string;
      /** 剩余可入园人数 */
      remaining?: number;
    }

    /** 核销记录行 */
    interface VerificationRow {
      id: number;
      reservationId: number;
      orderItemId: number;
      /** gate / pda / manual */
      channel: string;
      gateId: number | null;
      operatorId: number | null;
      verifyTime: string;
      createdAt: string;
    }

    /** 核销记录查询参数 */
    interface VerificationSearchParams {
      channel?: string;
      /** yyyy-MM-dd */
      date?: string | null;
    }
  }
}
