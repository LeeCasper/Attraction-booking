<script setup lang="ts">
/**
 * 常用出行人管理页。
 *
 * ⚠️ **这一页设计稿里没有** —— 设计稿只在个人中心画了个「管理」入口，没画目的页。
 * 所以版式是自拟的，但用的是同一套设计 token 与工具类，观感与其余页面一致。
 * 它是本工程**唯一一个手写页面**（其余四个视图都由 `scripts/gen-pages.mjs` 从设计稿生成）。
 *
 * 对应接口（上一轮补齐的）：`GET/POST/PUT/DELETE /api/mini/visitors`
 */
import { onMounted, reactive, ref } from 'vue';
import { visitorApi, type MiniVisitor, type VisitorPayload } from '@/api';
import { errorText } from '@/api/request';

const list = ref<MiniVisitor[]>([]);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
/** 正在编辑的 id；null = 新增 */
const editingId = ref<number | null>(null);
const formVisible = ref(false);

const form = reactive<VisitorPayload & { isDefault: boolean }>({
  name: '',
  idCard: '',
  phone: '',
  isDefault: false,
});

/**
 * 状态栏高度 —— 用**真实 px**（不是 rpx）：这是设备物理量，不该随屏宽缩放。
 *
 * 本页是二级页、自绘标题栏（`navigationStyle: custom`），不走 `PageHeader`，
 * 所以得自己让位。原先只给了 `pt-3`（12px），真机状态栏有 ~37px，
 * 标题「常用出行人」和右上角都被压进状态栏里（H5 上看不出来，状态栏为 0）。
 */
const statusBarHeight = ref(0);
/** 胶囊左侧到屏幕右边的距离，作为标题栏的右内边距，避免被真胶囊盖住 */
const capsuleInset = ref(0);

// getSystemInfoSync 自基础库 2.20.1 起废弃，会往控制台打弃用告警。
// 优先用拆分后的 getWindowInfo，旧基础库上回退（`?.` 对不存在的方法返回 undefined）。
type WindowMetrics = { statusBarHeight?: number; windowWidth: number };
const win: WindowMetrics =
  (uni as unknown as { getWindowInfo?: () => WindowMetrics }).getWindowInfo?.() ?? uni.getSystemInfoSync();

statusBarHeight.value = win.statusBarHeight ?? 0;

// #ifdef MP-WEIXIN
const rect = uni.getMenuButtonBoundingClientRect();
if (rect && rect.width > 0) {
  capsuleInset.value = win.windowWidth - rect.left + 8;
}
// #endif

const closeForm = () => (formVisible.value = false);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    list.value = await visitorApi.list();
  } catch (err) {
    error.value = errorText(err);
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  form.name = '';
  form.idCard = '';
  form.phone = '';
  form.isDefault = list.value.length === 0; // 第一位自动设为默认（后端也会这么做）
  formVisible.value = true;
}

function openEdit(v: MiniVisitor) {
  editingId.value = v.id;
  form.name = v.name;
  // 证件号只拿得到脱敏值，无法回填明文 —— 留空表示「不改证件」
  form.idCard = '';
  form.phone = '';
  form.isDefault = v.isDefault;
  formVisible.value = true;
}

async function save() {
  if (saving.value) return;
  if (!form.name.trim()) {
    uni.showToast({ title: '请填姓名', icon: 'none' });
    return;
  }
  if (editingId.value === null && !form.idCard.trim()) {
    uni.showToast({ title: '请填身份证号', icon: 'none' });
    return;
  }

  saving.value = true;
  try {
    const payload: Partial<VisitorPayload> = {
      name: form.name.trim(),
      isDefault: form.isDefault,
      phone: form.phone?.trim() ?? '',
    };
    // 编辑时证件留空 = 不动它（脱敏值没法回填明文，所以不要求重填）
    if (form.idCard.trim()) payload.idCard = form.idCard.trim();

    if (editingId.value === null) {
      await visitorApi.create(payload as VisitorPayload);
      uni.showToast({ title: '已添加', icon: 'success' });
    } else {
      await visitorApi.update(editingId.value, payload);
      uni.showToast({ title: '已保存', icon: 'success' });
    }
    formVisible.value = false;
    await load();
  } catch (err) {
    // 校验位不通过、证件重复、超出上限等等都在这里如实展示服务端的原话
    uni.showToast({ title: errorText(err), icon: 'none', duration: 2500 });
  } finally {
    saving.value = false;
  }
}

function confirmRemove(v: MiniVisitor) {
  uni.showModal({
    title: '删除出行人',
    content: `确定删除「${v.name}」吗？已被订单使用过的出行人不能删除。`,
    success: async (res) => {
      if (!res.confirm) return;
      try {
        await visitorApi.remove(v.id);
        uni.showToast({ title: '已删除', icon: 'success' });
        await load();
      } catch (err) {
        uni.showToast({ title: errorText(err), icon: 'none', duration: 2500 });
      }
    },
  });
}

/** 模板里拿不到 `uni` 这个全局（`<script setup>` 只暴露本文件声明的东西），所以包一层 */
const goBack = () => uni.navigateBack();

const setDefault = async (v: MiniVisitor) => {
  try {
    await visitorApi.update(v.id, { isDefault: true });
    await load();
  } catch (err) {
    uni.showToast({ title: errorText(err), icon: 'none' });
  }
};

onMounted(load);
</script>

<template>
  <view class="flex flex-col w-full min-h-screen bg-surface">
    <!-- 让出**真实状态栏**高度：H5 上为 0（与自拟版式一致），真机自动下移 -->
    <view :style="{ height: statusBarHeight + 'px' }" />

    <!-- 标题栏 -->
    <view class="flex items-center gap-2 px-4 py-3" :style="{ paddingRight: capsuleInset + 'px' }">
      <view
        class="msi icon-arrow_back text-20px text-ink-charcoal-text p-1"
        hover-class="pg-hover"
        @tap="goBack"
      />
      <text class="font-headline-md text-17px font-bold text-ink-charcoal-text">常用出行人</text>
    </view>

    <view class="flex flex-col gap-3 px-4 pb-24">
      <view v-if="error" class="rounded-xl bg-surface-container-low text-cinnabar-red text-13px px-3 py-2">{{ error }}</view>

      <!-- 计数放在标题栏之外：那儿要避开微信胶囊，塞不下别的东西 -->
      <text class="font-caption-sm text-11px text-ink-light-gray">共 {{ list.length }} 位 · 最多 10 位</text>

      <!-- 列表 -->
      <view
        v-for="v in list"
        :key="v.id"
        class="flex flex-col bg-paper-surface rounded-2xl border border-silk-border px-4 py-3"
      >
        <view class="flex items-center gap-2">
          <text class="text-15px font-bold text-ink-charcoal-text truncate">{{ v.name }}</text>
          <text
            class="text-10px px-1_5 py-0_5 rounded-full border border-primary_20 bg-mist-cyan-50 text-primary shrink-0"
          >{{ v.badge }}</text>
        </view>

        <view class="flex flex-col gap-0_5 mt-1_5">
          <text class="font-caption-sm text-12px text-ink-light-gray font-mono">身份证 {{ v.idCardMask }}</text>
          <text v-if="v.phoneMask" class="font-caption-sm text-12px text-ink-light-gray font-mono">手机 {{ v.phoneMask }}</text>
        </view>

        <!-- 操作行：原先三个 11px 按钮挤在卡片右侧，窄屏上会互相压；
             改成整行、每个按钮至少 44px 高（拇指可点的最小尺寸） -->
        <view class="flex gap-2 mt-3 pt-3 border-t border-silk-border">
          <view
            v-if="!v.isDefault"
            class="flex-1 min-h-44px flex items-center justify-center rounded-lg border border-primary_20 text-13px text-primary"
            hover-class="pg-hover"
            @tap="setDefault(v)"
          >设为默认</view>
          <view
            class="flex-1 min-h-44px flex items-center justify-center rounded-lg border border-silk-border text-13px text-ink-charcoal-text"
            hover-class="pg-hover"
            @tap="openEdit(v)"
          >编辑</view>
          <view
            class="flex-1 min-h-44px flex items-center justify-center rounded-lg border border-silk-border text-13px text-cinnabar-red"
            hover-class="pg-hover"
            @tap="confirmRemove(v)"
          >删除</view>
        </view>
      </view>

      <view v-if="!loading && list.length === 0" class="text-center text-13px text-ink-light-gray py-3">
        还没有常用出行人，点下面添加
      </view>

      <!-- 新增 -->
      <view
        class="py-3 rounded-xl border border-dashed border-primary_60 text-primary text-13px font-medium text-center"
        hover-class="pg-hover"
        @tap="openCreate"
      >+ 新增出行人</view>
    </view>

    <!-- 表单（新增 / 编辑共用；设计稿没有这一块，自拟） -->
    <view
      v-if="formVisible"
      class="fixed inset-0 z-50 flex items-end"
      style="background-color: rgba(0, 0, 0, 0.5)"
      @tap="closeForm"
    >
      <view
        class="w-full bg-paper-surface flex flex-col px-4"
        style="
          border-radius: 24px 24px 0 0;
          padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
        "
        @tap.stop
      >
        <!-- 抓手：告诉用户这是可下拉/可关闭的浮层 -->
        <view class="flex justify-center pt-3">
          <view style="width: 36px; height: 4px; border-radius: 2px; background-color: #d8ded9" />
        </view>

        <text class="font-headline-md text-17px font-bold text-ink-charcoal-text pt-3">
          {{ editingId === null ? '新增出行人' : '编辑出行人' }}
        </text>
        <text class="font-caption-sm text-12px text-ink-light-gray mt-1_5">
          {{ editingId === null ? '请填写真实姓名与证件号，检票时需人证一致' : '证件号留空表示不改动' }}
        </text>

        <!-- 带标签的输入框：原先只有 placeholder，输入后就没有任何提示了 -->
        <view class="flex flex-col gap-1 mt-3">
          <text class="text-12px font-medium text-ink-charcoal-text">姓名</text>
          <input
            v-model="form.name"
            class="bg-surface-container-lowest border border-silk-border rounded-xl px-3 h-14 text-15px text-ink-charcoal-text"
            placeholder="请输入真实姓名"
            placeholder-style="color: #6b7280"
          />
        </view>

        <view class="flex flex-col gap-1 mt-3">
          <text class="text-12px font-medium text-ink-charcoal-text">身份证号</text>
          <input
            v-model="form.idCard"
            class="bg-surface-container-lowest border border-silk-border rounded-xl px-3 h-14 text-15px text-ink-charcoal-text"
            placeholder="请输入 18 位身份证号"
            placeholder-style="color: #6b7280"
            :disabled="editingId !== null"
          />
          <text v-if="editingId !== null" class="font-caption-sm text-11px text-ink-light-gray">
            接口只返回脱敏值，无法回填原件 —— 留空即不改
          </text>
        </view>

        <view class="flex flex-col gap-1 mt-3">
          <text class="text-12px font-medium text-ink-charcoal-text">手机号（选填）</text>
          <input
            v-model="form.phone"
            class="bg-surface-container-lowest border border-silk-border rounded-xl px-3 h-14 text-15px text-ink-charcoal-text"
            placeholder="用于接收入园提醒"
            placeholder-style="color: #6b7280"
          />
        </view>

        <view class="flex items-center gap-2 min-h-44px mt-1" @tap="form.isDefault = !form.isDefault">
          <view
            class="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
            :class="form.isDefault ? 'border-primary bg-primary_10' : 'border-silk-border'"
          >
            <text v-if="form.isDefault" class="w-2_5 h-2_5 rounded-full bg-primary" />
          </view>
          <text class="text-13px text-ink-charcoal-text">设为默认出行人</text>
        </view>

        <!-- 操作行：不再贴着屏幕底 —— 上方那圈 padding-bottom 已经让出了
             iOS 底部小白条（home indicator），原先它正压在这两个按钮上 -->
        <view class="flex gap-3 mt-3">
          <view
            class="flex-1 min-h-44px flex items-center justify-center rounded-xl border border-silk-border text-15px text-ink-charcoal-text"
            hover-class="pg-hover"
            @tap="closeForm"
          >取消</view>
          <view
            class="flex-1 min-h-44px flex items-center justify-center rounded-xl bg-gradient-to-r from-primary to-deep-teal-800 text-on-primary text-15px font-semibold"
            hover-class="pg-hover"
            @tap="save"
          >{{ saving ? '保存中…' : '保存' }}</view>
        </view>
      </view>
    </view>
  </view>
</template>
