import { request } from '../request';

// ============ 景区 ============

/**
 * 上传景区封面。
 *
 * 走同一个 request 实例：鉴权头、baseURL/代理、`{code,msg,data}` 拆包都由它处理，
 * 只是 body 换成 FormData（axios 会自己带 multipart 边界）。返回的是**相对路径**，
 * 存进 `coverUrl`，展示时再拼前缀。
 */
export function fetchUploadImage(file: File) {
  const form = new FormData();
  form.append('file', file);
  return request<Api.Scenic.UploadResult>({
    url: '/admin/upload',
    method: 'post',
    data: form
  });
}

/** 景区列表 */
export function fetchGetScenicAreas() {
  return request<Api.Scenic.Area[]>({
    url: '/admin/scenic/areas',
    method: 'get'
  });
}

/** 新建景区（payload 里带 generateDefaults 时会一并生成默认时段/票种/库存） */
export function fetchCreateScenicArea(data: Api.Scenic.AreaPayload) {
  return request<Api.Scenic.CreateAreaResult>({
    url: '/admin/scenic/areas',
    method: 'post',
    data
  });
}

/** 给已存在的景区补默认时段/票种/库存（幂等，可重复调用） */
export function fetchGenerateScenicAreaDefaults(
  id: number,
  data?: { defaultStockDays?: number; defaultSlotStock?: number }
) {
  return request<Api.Scenic.AreaDefaultsResult>({
    url: `/admin/scenic/areas/${id}/defaults`,
    method: 'post',
    data
  });
}

/** 修改景区 */
export function fetchUpdateScenicArea(id: number, data: Api.Scenic.AreaPayload) {
  return request<Api.Scenic.Area>({
    url: `/admin/scenic/areas/${id}`,
    method: 'put',
    data
  });
}

/** 删除景区 */
export function fetchDeleteScenicArea(id: number) {
  return request<null>({
    url: `/admin/scenic/areas/${id}`,
    method: 'delete'
  });
}

// ============ 公告 ============

/** 公告列表 */
export function fetchGetAnnouncements(areaId: number) {
  return request<Api.Scenic.Announcement[]>({
    url: `/admin/scenic/areas/${areaId}/announcements`,
    method: 'get'
  });
}

/** 发布公告 */
export function fetchCreateAnnouncement(areaId: number, data: Api.Scenic.AnnouncementPayload) {
  return request<{ id: number }>({
    url: `/admin/scenic/areas/${areaId}/announcements`,
    method: 'post',
    data
  });
}

/** 修改/上下架公告 */
export function fetchUpdateAnnouncement(id: number, data: Api.Scenic.AnnouncementPayload) {
  return request<null>({
    url: `/admin/scenic/announcements/${id}`,
    method: 'put',
    data
  });
}

/** 删除公告 */
export function fetchDeleteAnnouncement(id: number) {
  return request<null>({
    url: `/admin/scenic/announcements/${id}`,
    method: 'delete'
  });
}
