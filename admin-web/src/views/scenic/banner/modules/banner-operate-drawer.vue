<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fetchCreateBanner, fetchGetScenicAreas, fetchUpdateBanner } from '@/service/api';
import { useForm, useFormRules } from '@/hooks/common/form';
import ImageField from '../../components/image-field.vue';

defineOptions({ name: 'BannerOperateDrawer' });

interface Props {
  /** 操作类型 */
  operateType: UI.TableOperateType;
  /** 编辑时的行数据 */
  rowData?: Api.Scenic.Banner | null;
}

const props = defineProps<Props>();

interface Emits {
  (e: 'submitted'): void;
}

const emit = defineEmits<Emits>();

const visible = defineModel<boolean>('visible', { default: false });

const { formRef, validate, restoreValidation } = useForm();
const { defaultRequiredRule } = useFormRules();

const title = computed(() => (props.operateType === 'add' ? '新增轮播图' : '编辑轮播图'));
const isEdit = computed(() => props.operateType === 'edit');
const submitting = ref(false);

interface Model {
  /** 相对路径（`/uploads/x.jpg`） */
  imageUrl: string;
  /** 没有跳转景点时显示在图上 */
  title: string;
  subtitle: string;
  /** 0 = 不跳转（提交时按 null 提交，见 buildPayload） */
  scenicAreaId: number;
  /** 排序：小的在前 */
  sort: number;
  /** 1 启用 / 2 停用 */
  status: number;
}

function createDefaultModel(): Model {
  return { imageUrl: '', title: '', subtitle: '', scenicAreaId: 0, sort: 0, status: 1 };
}

const model = ref(createDefaultModel());

/** 跳转景点候选项 —— 「哪个景点上首页」是运营常调的事，所以这里直接选，不用去改景区档案 */
const areas = ref<Api.Scenic.Area[]>([]);

const rules: Record<'imageUrl', App.Global.FormRule> = {
  imageUrl: defaultRequiredRule
};

function handleInitModel() {
  model.value = createDefaultModel();

  if (props.operateType !== 'edit' || !props.rowData) {
    return;
  }

  const { imageUrl, title: t, subtitle, scenicAreaId, sort, status } = props.rowData;

  Object.assign(model.value, {
    imageUrl,
    title: t ?? '',
    subtitle: subtitle ?? '',
    scenicAreaId: scenicAreaId ?? 0,
    sort: sort ?? 0,
    status
  });
}

function closeDrawer() {
  visible.value = false;
}

/**
 * 表单 → 提交体。
 *
 * ⚠️ `scenicAreaId` 的「不跳转」要传 **null**（不是 0、也不是省略）——
 * `repo.update(id, body)` 会忽略 undefined 的字段（省略 = 保持原值），
 * 传 0 则会写进一个不存在的景点 id。
 */
function buildPayload(): Api.Scenic.BannerPayload {
  return {
    imageUrl: model.value.imageUrl,
    title: model.value.title || undefined,
    subtitle: model.value.subtitle || undefined,
    scenicAreaId: model.value.scenicAreaId || null,
    sort: model.value.sort,
    status: model.value.status
  };
}

async function handleSubmit() {
  await validate();

  const payload = buildPayload();

  submitting.value = true;
  try {
    const { error } =
      isEdit.value && props.rowData
        ? await fetchUpdateBanner(props.rowData.id, payload)
        : await fetchCreateBanner(payload);

    if (error) return;

    window.$message?.success(isEdit.value ? '修改成功' : '新增成功');
    closeDrawer();
    emit('submitted');
  } finally {
    submitting.value = false;
  }
}

watch(visible, async val => {
  if (!val) return;
  restoreValidation();
  handleInitModel();
  if (areas.value.length === 0) {
    const { data, error } = await fetchGetScenicAreas();
    if (!error) areas.value = data;
  }
});
</script>

<template>
  <ElDrawer v-model="visible" :title="title" :size="420" destroy-on-close>
    <ElForm ref="formRef" :model="model" :rules="rules" label-position="top">
      <ImageField
        v-model="model.imageUrl"
        label="轮播图"
        hint="首页顶部轮播就展示这一组图（按排序）"
        ratio-hint="建议 21:9 宽图；5MB 内，支持 jpeg / png / webp"
      />
      <ElFormItem label="跳转景点">
        <ElSelect v-model="model.scenicAreaId" class="w-full" placeholder="不跳转（只展示图）">
          <ElOption label="不跳转（只展示图）" :value="0" />
          <ElOption v-for="area in areas" :key="area.id" :label="area.name" :value="area.id" />
        </ElSelect>
        <div class="mt-4px text-12px text-gray-400">
          选了景点：小程序那屏显示该景点的名字与实时在园率，点了进它的购票页；不选：显示下面填的标题/副标题，且不可点。
        </div>
      </ElFormItem>
      <ElFormItem label="标题">
        <ElInput v-model="model.title" placeholder="不跳转景点时显示在图上，如 双节免票周" />
      </ElFormItem>
      <ElFormItem label="副标题">
        <ElInput v-model="model.subtitle" placeholder="选填，如 10.1-10.7 全省游客免票" />
      </ElFormItem>
      <ElFormItem label="排序">
        <ElInputNumber v-model="model.sort" :min="0" :max="9999" class="w-full" />
        <div class="mt-4px text-12px text-gray-400">小的在前，也可以直接在列表里上移 / 下移</div>
      </ElFormItem>
      <ElFormItem label="状态">
        <ElRadioGroup v-model="model.status">
          <ElRadio :value="1">启用</ElRadio>
          <ElRadio :value="2">停用</ElRadio>
        </ElRadioGroup>
      </ElFormItem>
    </ElForm>

    <template #footer>
      <ElSpace>
        <ElButton @click="closeDrawer">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="handleSubmit">确认</ElButton>
      </ElSpace>
    </template>
  </ElDrawer>
</template>

<style scoped></style>
