import { request } from '../request';

/** 核销（扫码 / 刷证 / 订单号+证件后四位） */
export function fetchVerify(data: Api.Verify.VerifyPayload) {
  return request<Api.Verify.VerifyOutcome>({
    url: '/admin/verify',
    method: 'post',
    data
  });
}

/** 核销记录 */
export function fetchGetVerifications(
  params: Api.Common.BackendPageParams & Api.Verify.VerificationSearchParams
) {
  return request<Api.Common.BackendPageRecord<Api.Verify.VerificationRow>>({
    url: '/admin/verifications',
    method: 'get',
    params
  });
}
