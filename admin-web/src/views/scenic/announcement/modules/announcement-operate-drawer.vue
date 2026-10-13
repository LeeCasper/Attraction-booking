<script setup lang="ts">
/**
 * 公告的新增 / 编辑抽屉。
 *
 * 两种形态共用一套字段：**提示公告**只用「标题 + 内容」；**弹窗公告**还会用到
 * 「配图 / 跳转目标」（所以这两项按类型 `v-if` 显示，避免运营填了不生效的字段）。
 * 「归属景点」留空 = **全平台投放**（任何景点的小程序都能看到）。
 *
 * ⚠️ 两个后端口径必须在这里落实：
 * ① 清空类字段要传 **`null`**（`repo.update` 忽略 `undefined`，省略 = 保持原值）；
 * ② 生效区间用 `ElDatePicker` 的 `value-format="YYYY-MM-DD HH:mm:ss"` 原样提交
 *    （服务端原样入库，不做 `new Date()` 转换，避免按服务器时区平移）。
 */
import { computed, ref, watch } from 'vue';
import { announcementLinkOptions, announcementTypeOptions } from '@/constants/business';
import { fetchCreateAnnouncement, fetchUpdateAnnouncement } from '@/service/api';
import { useForm, useFormRules } from '@/hooks/common/form';
import ImageField from '@/components/business/image-field.vue';

defineOptions({ name: 'ScenicAnnouncementOperateDrawer' });

interface Props {
  /** 操作类型 */
  operateType: UI.TableOperateType;
  /** 编辑时的行数据 */
  rowData?: Api.Scenic.Announcement | null;
  /** 景点候选项（「归属景点」下拉用；不选 = 全平台） */
  areas: Api.Scenic.Area[];
}

const props = defineProps<Props>();

interface Emits {
  (e: 'submitted'): void;
}

const emit = defineEmits<Emits>();

const visible = defineModel<boolean>('visible', { default: false });

const { formRef, validate, restoreValidation } = useForm();
const { defaultRequiredRule } = useFormRules();

const title = computed(() => (props.operateType === 'add' ? '发布公告' : '编辑公告'));
const isEdit = computed(() => props.operateType === 'edit');
const submitting = ref(false);

interface Model {
  /** 归属景点；**0 = 全平台**（提交时转成 null） */
  scenicAreaId: number;
  /** 1 提示公告 / 2 弹窗公告 */
  type: number;
  title: string;
  content: string;
  imageUrl: string;
  linkType: number;
  sort: number;
}

function createDefaultModel(): Model {
  return {
    scenicAreaId: 0,
    type: 1,
    title: '',
    content: '',
    imageUrl: '',
    linkType: 0,
    sort: 0
  };
}

const model = ref(createDefaultModel());
/** 生效区间（`ElDatePicker` 的 datetimerange 值；null/空数组 = 不限） */
const dateRange = ref<[string, string] | null>(null);

const rules: Record<'title', App.Global.FormRule> = {
  title: defaultRequiredRule
};

function handleInitModel() {
  model.value = createDefaultModel();
  dateRange.value = null;

  if (props.operateType !== 'edit' || !props.rowData) {
    return;
  }

  Object.assign(model.value, {
    scenicAreaId: props.rowData.scenicAreaId ?? 0,
    type: props.rowData.type,
    title: props.rowData.title,
    content: props.rowData.content ?? '',
    imageUrl: props.rowData.imageUrl ?? '',
    linkType: props.rowData.linkType,
    sort: props.rowData.sort
  });

  if (props.rowData.startAt && props.rowData.endAt) {
    dateRange.value = [props.rowData.startAt, props.rowData.endAt];
  } else if (props.rowData.startAt) {
    dateRange.value = [props.rowData.startAt, props.rowData.startAt];
  } else if (props.rowData.endAt) {
    dateRange.value = [props.rowData.endAt, props.rowData.endAt];
  }
}

function closeDrawer() {
  visible.value = false;
}

/** 表单 → 提交体：清空类字段一律 `null`（见文件头 ①） */
function buildPayload(): Api.Scenic.AnnouncementPayload {
  const [startAt, endAt] = dateRange.value ?? [null, null];

  return {
    scenicAreaId: model.value.scenicAreaId || null,
    type: model.value.type,
    title: model.value.title,
    content: model.value.content || null,
    // 提示公告用不上配图与跳转 —— 切回提示时清掉，免得留下看不见的脏数据
    imageUrl: model.value.type === 2 ? model.value.imageUrl || null : null,
    linkType: model.value.type === 2 ? model.value.linkType : 0,
    sort: model.value.sort,
    startAt: startAt || null,
    endAt: endAt || null
  };
}

async function handleSubmit() {
  await validate();

  submitting.value = true;
  try {
    if (isEdit.value && props.rowData) {
      const { error } = await fetchUpdateAnnouncement(props.rowData.id, buildPayload());
      if (error) return;
    } else {
      const { error } = await fetchCreateAnnouncement(buildPayload());
      if (error) return;
    }

    window.$message?.success(isEdit.value ? '修改成功' : '发布成功');
    closeDrawer();
    emit('submitted');
  } finally {
    submitting.value = false;
  }
}

watch(visible, () => {
  if (visible.value) {
    restoreValidation();
    handleInitModel();
  }
});
</script>

<template>
  <ElDrawer v-model="visible" :title="title" :size="480">
    <ElForm ref="formRef" :model="model" :rules="rules" label-position="top">
      <ElFormItem label="公告类型">
        <ElRadioGroup v-model="model.type">
          <ElRadio v-for="opt in announcementTypeOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </ElRadio>
        </ElRadioGroup>
        <div class="mt-4px text-12px text-gray-400">
          提示公告在首页顶部一行显示（多条轮播）；弹窗公告进首页弹一次，**同一条每天最多弹一次**。
        </div>
      </ElFormItem>

      <ElFormItem label="归属景点">
        <ElSelect v-model="model.scenicAreaId" class="w-full" placeholder="全平台（所有景点都能看到）">
          <ElOption label="全平台（所有景点都能看到）" :value="0" />
          <ElOption v-for="area in props.areas" :key="area.id" :label="area.name" :value="area.id" />
        </ElSelect>
        <div class="mt-4px text-12px text-gray-400">
          选「全平台」= 不挂任何景点，例如「系统维护」「全场活动」这类通知。
        </div>
      </ElFormItem>

      <ElFormItem label="公告标题" prop="title">
        <ElInput v-model="model.title" placeholder="请输入公告标题" maxlength="128" show-word-limit />
      </ElFormItem>

      <ElFormItem label="公告内容">
        <ElInput v-model="model.content" type="textarea" :rows="5" placeholder="请输入公告内容（纯文本，可换行）" />
      </ElFormItem>

      <template v-if="model.type === 2">
        <ImageField
          v-model="model.imageUrl"
          label="弹窗配图"
          hint="可留空（纯文字弹窗）。建议 16:9 或 4:3，5MB 内，支持 jpeg / png / webp"
          ratio-hint="建议 16:9（弹窗宽度 430px 内自适应）"
          preview-class="h-60px w-100px"
        />

        <ElFormItem label="点击跳转">
          <ElSelect v-model="model.linkType" class="w-full">
            <ElOption v-for="opt in announcementLinkOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </ElSelect>
          <div class="mt-4px text-12px text-gray-400">
            弹窗底部会出现一个按钮跳到所选页面；选「不跳转」则只有「我知道了」。
          </div>
        </ElFormItem>
      </template>

      <ElFormItem label="生效时间">
        <ElDatePicker
          v-model="dateRange"
          type="datetimerange"
          range-separator="至"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          format="YYYY-MM-DD HH:mm:ss"
          value-format="YYYY-MM-DD HH:mm:ss"
          class="w-full"
        />
        <div class="mt-4px text-12px text-gray-400">
          留空 = 长期有效。到点自动生效/失效（由查询按时间过滤，**不是**定时任务改状态 ——
          所以「已发布」只表示你没手动下架它）。
        </div>
      </ElFormItem>

      <ElFormItem label="排序">
        <ElInputNumber v-model="model.sort" :min="0" :max="9999" :step="10" class="w-full" />
        <div class="mt-4px text-12px text-gray-400">小的在前。同类型的多条按它排（列表里也可以用「上移/下移」）。</div>
      </ElFormItem>
    </ElForm>

    <template #footer>
      <ElSpace :size="16">
        <ElButton @click="closeDrawer">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="handleSubmit">确认</ElButton>
      </ElSpace>
    </template>
  </ElDrawer>
</template>

<style scoped></style>
