import { computed, ref } from 'vue';
import { announcementApi, type MiniAnnouncement } from '@/api';

/**
 * 公告（两种形态）—— 外壳与首页视图共享的唯一状态。
 *
 * ## 为什么是 store 而不是首页 behavior 里的 ref
 *
 * **弹窗必须由外壳渲染**：首页视图挂在 `<scroll-view>` 里，而微信的 `scroll-view` 会形成自己的
 * 包含块 —— 其中的 `position: fixed` **不再相对视口固定**，会跟着内容滚走（CLAUDE.md 第 14 条）。
 * 而外壳拿不到视图的 composable（只给视图传 `active` 一个 prop），所以状态只能放在模块里。
 * 数据仍由**首页**去拉（`areaId` 只有首页知道），拉回来塞进这里；外壳只负责渲染。
 *
 * ## 「每天最多弹一次」是客户端行为
 *
 * 服务端**不记**「谁看过」——那等于要给每个用户存一行。已读记在**本机**：
 * `mini_announcement_seen` = `{ [公告id]: 'YYYY-MM-DD' }`（手机本地日期，只保留今天的条目）。
 * 因此**换设备 / 清缓存会再弹一次**（口径写进了 docs/操作手册.md），这是刻意的取舍。
 */
const SEEN_KEY = 'mini_announcement_seen';

/** 手机本地日期（不是 UTC，也不是业务时区 —— 「今天」对用户来说是手机上的今天） */
function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function readSeen(): Record<string, string> {
  try {
    const raw = uni.getStorageSync(SEEN_KEY) as Record<string, string> | '' | null;
    if (raw && typeof raw === 'object') return raw;
  } catch {
    /* 存储读失败就当没看过 —— 顶多多弹一次，不值得为此报错 */
  }
  return {};
}

/** 只留今天的条目，避免这个对象无限长大 */
function writeSeen(seen: Record<string, string>, today: string) {
  const kept: Record<string, string> = {};
  for (const [id, date] of Object.entries(seen)) {
    if (date === today) kept[id] = date;
  }
  try {
    uni.setStorageSync(SEEN_KEY, kept);
  } catch {
    /* 同上：写不进去就下次再弹一次 */
  }
}

/** 提示公告（首页顶部那一行，多条轮播） */
export const tips = ref<MiniAnnouncement[]>([]);
/** 当前要弹的弹窗公告（null = 不弹） */
export const active = ref<MiniAnnouncement | null>(null);
/** 轮播下标 */
export const tipIndex = ref(0);

/** 手动打开的那一条不受「每天一次」限制（用户自己点的），用它区分关闭时的语义 */
let manual = false;

const popupQueue = ref<MiniAnnouncement[]>([]);

export const currentTip = computed(() => tips.value[tipIndex.value] ?? null);

/**
 * 拉当前景点的公告（全平台 + 该景点），并按 `sort` 排好队列。
 *
 * 同一景点重复调用是安全的：先清队列再重算；已在看的那条不会被替换掉
 * （否则切景点时弹窗会中途跳走）。
 */
export async function loadAnnouncements(scenicAreaId?: number | null) {
  let res: { tips: MiniAnnouncement[]; popups: MiniAnnouncement[] };
  try {
    res = await announcementApi.list(scenicAreaId ?? undefined);
  } catch {
    // 公告拉不到不该影响首页（与平台信息同一条口径：拉不到就不显示，不报错）
    tips.value = [];
    popupQueue.value = [];
    return;
  }

  tips.value = res.tips;
  if (tipIndex.value >= tips.value.length) tipIndex.value = 0;

  popupQueue.value = res.popups;
  if (!active.value) showNext();
}

/** 取下一条「今天还没弹过」的弹窗公告；没有就静默 */
function showNext() {
  const seen = readSeen();
  const today = todayLocal();
  const next = popupQueue.value.find((p) => seen[String(p.id)] !== today);
  if (!next) {
    active.value = null;
    return;
  }
  active.value = next;
  manual = false;
  // ⚠️ **展示时就记已读，而不是关闭时**：用户看完直接杀进程的话，关闭事件永远不会来，
  //    记在关闭时会导致下次进来又弹（「每天一次」就形同虚设）。
  seen[String(next.id)] = today;
  writeSeen(seen, today);
}

/** 关闭弹窗；队列里还有没弹过的就接着弹下一条（运营发两条都能看到，不叠在一屏上） */
export function closePopup() {
  active.value = null;
  if (manual) {
    manual = false;
    return;
  }
  showNext();
}

/**
 * 用户主动查看某一条（首页提示条 / 「须知」点的）。
 *
 * ⚠️ **不写已读、也不受「每天一次」限制** —— 那是他自己点的，和「自动弹」是两回事。
 */
export function openPopup(id: number) {
  const found = popupQueue.value.find((p) => p.id === id) ?? tips.value.find((t) => t.id === id);
  if (!found) return;
  active.value = found;
  manual = true;
}

/** 提示条轮播到下一条（组件里的定时器调用） */
export function nextTip() {
  if (tips.value.length <= 1) return;
  tipIndex.value = (tipIndex.value + 1) % tips.value.length;
}
