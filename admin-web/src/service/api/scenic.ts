import { request } from '../request';

// ============ 景区 ============

/**
 * 上传景区封面。
 *
 * 走同一个 request 实例：鉴权头、baseURL/代理、`{code,msg,data}` 拆包都由它处理，
 * 只是 body 换成 FormData。返回的是**相对路径**，存进 `coverUrl`，展示时再拼前缀。
 *
 * ⚠️ **`Content-Type: undefined` 这一行不能删，也不能改成 `'multipart/form-data'`。**
 *
 * 请求实例的默认头是 `application/json`（`@sa/axios` 的 `createAxiosConfig` 里写死），
 * 而 axios 的 `transformRequest` 有这么一段：
 *
 * ```js
 * if (isFormData(data)) return hasJSONContentType ? JSON.stringify(formDataToJSON(data)) : data;
 * ```
 *
 * 于是**带上 json 头的 FormData 会被转成 JSON 字符串发出去**（实测 body 是 `{"file":{}}`），
 * 服务端 multer 收不到任何 multipart 字段 ⇒ `POST /api/admin/upload` 回
 * 400「没有收到文件（字段名应为 file）」，后台表现就是「上传封面没反应」。
 * 置成 `undefined` 才会走 `return data` 分支，由 **axios/浏览器自己补上带 boundary 的
 * `multipart/form-data`**（浏览器端是浏览器补，Node 端是 axios 的 http 适配器自己算边界）。
 *
 * 也不能写成 `'multipart/form-data'`：浏览器**不会**给已经显式设好的类型补 boundary，
 * 服务端同样解不出来（⚠️ 这条在 Node 里测不出来 —— axios 的 http 适配器会自己算边界，
 * 所以本地脚本无论怎么写都是 201，只有浏览器才暴露）。
 */
export function fetchUploadImage(file: File) {
  const form = new FormData();
  form.append('file', file);
  return request<Api.Scenic.UploadResult>({
    url: '/admin/upload',
    method: 'post',
    data: form,
    headers: { 'Content-Type': undefined }
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

// ============ 首页轮播图 ============
//
// 与景区**解耦**的一组图（见 `typings/api/scenic.d.ts` 的 Banner 注释）：
// 后台单独维护、可排序可启停，每张可选跳转到某个景点。

/** 轮播图列表（含停用，按 sort 升序） */
export function fetchGetBanners() {
  return request<Api.Scenic.Banner[]>({
    url: '/admin/scenic/banners',
    method: 'get'
  });
}

/** 新增轮播图 */
export function fetchCreateBanner(data: Api.Scenic.BannerPayload) {
  return request<{ id: number }>({
    url: '/admin/scenic/banners',
    method: 'post',
    data
  });
}

/** 修改/启停轮播图 */
export function fetchUpdateBanner(id: number, data: Api.Scenic.BannerPayload) {
  return request<null>({
    url: `/admin/scenic/banners/${id}`,
    method: 'put',
    data
  });
}

/** 删除轮播图 */
export function fetchDeleteBanner(id: number) {
  return request<null>({
    url: `/admin/scenic/banners/${id}`,
    method: 'delete'
  });
}
