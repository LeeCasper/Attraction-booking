import { ref } from 'vue';
import { platformApi, type PlatformSettings } from '@/api';

/**
 * 平台信息（顶栏品牌、版本号…），来源是后台「参数配置」页的 `platform` 项。
 *
 * 与 `store/shell.ts` / `store/order.ts` 同一套写法：模块级 ref + `uni.*Storage*` 落盘，
 * 组件直接 import 用，不走 props。
 *
 * **为什么要落盘 + 内置默认值**：顶栏是**同步渲染**的，首屏一定早于接口返回。
 * 不先给一个值，每次冷启动都会先闪一下空白/默认品牌再跳成真实值；
 * 落盘之后第二次起直接是上次的值，连闪都没有。
 *
 * ⚠️ 落盘的值只是**缓存**，不是权威 —— 后台改了名字后，缓存会在下次启动刷新时被覆盖。
 */
const KEY = 'mini_platform_settings';

/** 与后端 `platform-defaults.ts` 保持一致；也是「接口挂了」时的兜底 */
const DEFAULT: PlatformSettings = {
  name: '枫林谷景区',
  nameEn: 'Fenglingu',
  subtitle: '国家生态自然公园 · 智慧文旅',
  productName: '智慧文旅',
  version: 'V1.2.0',
};

function readCache(): PlatformSettings {
  try {
    const stored = uni.getStorageSync(KEY) as PlatformSettings | '' | null;
    if (stored && typeof stored === 'object') return { ...DEFAULT, ...stored };
  } catch {
    /* 存储读失败就用默认值，不值得为此报错 */
  }
  return DEFAULT;
}

export const platformSettings = ref<PlatformSettings>(readCache());

/** 启动时刷新一次；**失败静默**，沿用缓存/默认值（顶栏不该因为接口挂了就变空） */
export async function loadPlatformSettings() {
  try {
    const s = await platformApi.settings();
    platformSettings.value = { ...DEFAULT, ...s };
    uni.setStorageSync(KEY, platformSettings.value);
  } catch (err) {
    console.warn('[mini] 平台信息加载失败，沿用本地缓存：', (err as Error)?.message ?? err);
  }
}
