import { getServiceBaseURL } from '@/utils/service';
import { getAuthorization } from '@/service/request/shared';

/**
 * 文件下载
 *
 * 模板的 request 封装统一按 JSON 解析，无法处理二进制流，
 * 因此这里直接用 fetch 拉取后交给浏览器下载，并复用同一套 baseURL 与鉴权头。
 *
 * @param path 接口路径，如 /admin/export/orders
 * @param fileName 下载后的文件名
 * @param params 查询参数
 */
export async function downloadFile(
  path: string,
  fileName: string,
  params?: Record<string, string | number | undefined | null>
) {
  const isHttpProxy = import.meta.env.DEV && import.meta.env.VITE_HTTP_PROXY === 'Y';
  const { baseURL } = getServiceBaseURL(import.meta.env, isHttpProxy);

  const query = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, String(value));
    }
  });

  const url = `${baseURL}${path}${query.size > 0 ? `?${query.toString()}` : ''}`;
  const Authorization = getAuthorization();

  const res = await fetch(url, {
    headers: Authorization ? { Authorization } : {}
  });

  if (!res.ok) {
    // 后端错误体是 JSON，尽量把 msg 透出来
    let message = `下载失败（HTTP ${res.status}）`;
    try {
      const body = await res.json();
      if (body?.msg) message = body.msg;
    } catch {
      /* 非 JSON 响应，保留默认提示 */
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}
