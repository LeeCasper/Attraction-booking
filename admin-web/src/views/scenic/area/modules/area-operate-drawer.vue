<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fetchCreateScenicArea, fetchUpdateScenicArea } from '@/service/api';
import { useForm, useFormRules } from '@/hooks/common/form';

defineOptions({ name: 'ScenicAreaOperateDrawer' });

interface Props {
  /** 操作类型 */
  operateType: UI.TableOperateType;
  /** 编辑时的行数据 */
  rowData?: Api.Scenic.Area | null;
}

const props = defineProps<Props>();

interface Emits {
  (e: 'submitted'): void;
}

const emit = defineEmits<Emits>();

const visible = defineModel<boolean>('visible', { default: false });

const { formRef, validate, restoreValidation } = useForm();
const { defaultRequiredRule } = useFormRules();

const title = computed(() => (props.operateType === 'add' ? '新增景区' : '编辑景区'));
const isEdit = computed(() => props.operateType === 'edit');
const submitting = ref(false);

interface Model {
  name: string;
  address: string;
  openTime: string;
  maxCapacity: number;
  intro: string;
  /** 空串 = 未分类（提交时不带这个字段） */
  category: Api.Scenic.AreaCategory | '';
  /** 1 开放 / 2 关闭 */
  status: number;
  /** —— 以下三项仅新增时生效 —— */
  /** 一键生成默认时段与票种 */
  generateDefaults: boolean;
  /** 生成库存的天数（含今天） */
  defaultStockDays: number;
  /** 每个时段的库存张数 */
  defaultSlotStock: number;
}

/**
 * 分类选项。**必须与后端 `AREA_CATEGORIES` 和小程序端 `CATEGORIES` 逐字一致** ——
 * 三处对不上，用户就会在某个 tab 下看不到任何景点。
 */
const CATEGORY_OPTIONS: { value: Api.Scenic.AreaCategory; label: string }[] = [
  { value: 'main', label: '主景区' },
  { value: 'nature', label: '自然风光' },
  { value: 'culture', label: '历史人文' },
  { value: 'cable', label: '索道缆车' },
  { value: 'night', label: '夜游演艺' }
];

function createDefaultModel(): Model {
  return {
    name: '',
    address: '',
    openTime: '',
    maxCapacity: 1000,
    intro: '',
    category: '',
    status: 1,
    generateDefaults: true,
    defaultStockDays: 7,
    defaultSlotStock: 100
  };
}

const model = ref(createDefaultModel());

const rules: Record<'name' | 'maxCapacity', App.Global.FormRule> = {
  name: defaultRequiredRule,
  maxCapacity: defaultRequiredRule
};

function handleInitModel() {
  model.value = createDefaultModel();

  if (props.operateType !== 'edit' || !props.rowData) {
    return;
  }

  const { name, address, openTime, maxCapacity, intro, category, status } = props.rowData;

  Object.assign(model.value, {
    name,
    address: address ?? '',
    openTime: openTime ?? '',
    maxCapacity: maxCapacity ?? 1000,
    intro: intro ?? '',
    category: category ?? '',
    status
  });
}

function closeDrawer() {
  visible.value = false;
}

async function handleSubmit() {
  await validate();

  const payload: Api.Scenic.AreaPayload = {
    name: model.value.name,
    address: model.value.address || undefined,
    openTime: model.value.openTime || undefined,
    maxCapacity: model.value.maxCapacity,
    intro: model.value.intro || undefined,
    category: model.value.category || undefined
  };

  submitting.value = true;
  try {
    if (isEdit.value && props.rowData) {
      Object.assign(payload, { status: model.value.status });

      const { error } = await fetchUpdateScenicArea(props.rowData.id, payload);

      if (error) return;

      window.$message?.success('修改成功');
    } else {
      // 这三项只在新建时提交；编辑时后端也不会受理（DTO 是另一个类）
      if (model.value.generateDefaults) {
        payload.generateDefaults = true;
        payload.defaultStockDays = model.value.defaultStockDays;
        payload.defaultSlotStock = model.value.defaultSlotStock;
      }

      const { data, error } = await fetchCreateScenicArea(payload);

      if (error) return;

      const result = data?.defaults;

      if (result?.error) {
        // 景区已经建好了，只是库存那一步失败 —— 如实说，别报「新增成功」
        window.$message?.warning(`景区已创建，但默认库存生成失败：${result.error}`);
      } else if (result) {
        window.$message?.success(
          `新增成功，已生成 ${result.slots} 个时段 / ${result.ticketTypes} 个票种 / ${result.stockCreated} 条库存`
        );
      } else {
        window.$message?.success('新增成功');
      }
    }

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
  <ElDrawer v-model="visible" :title="title" :size="460">
    <ElForm ref="formRef" :model="model" :rules="rules" label-position="top">
      <ElFormItem label="景区名称" prop="name">
        <ElInput v-model="model.name" placeholder="如 中心景区" />
      </ElFormItem>
      <ElFormItem label="地址">
        <ElInput v-model="model.address" placeholder="请输入景区详细地址" />
      </ElFormItem>
      <ElFormItem label="开放时间">
        <ElInput v-model="model.openTime" placeholder="如 08:00-17:00" />
      </ElFormItem>
      <ElFormItem label="景点分类">
        <ElSelect v-model="model.category" class="w-full" clearable placeholder="不分类（只在小程序「全部景点」里出现）">
          <ElOption v-for="opt in CATEGORY_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
        </ElSelect>
      </ElFormItem>
      <ElFormItem label="最大承载量" prop="maxCapacity">
        <ElInputNumber v-model="model.maxCapacity" :min="1" :max="1000000" :step="100" class="w-full" />
      </ElFormItem>
      <ElAlert
        class="mb-16px"
        type="warning"
        :closable="false"
        show-icon
        title="最大承载量是承载率预警的计算基准：实时预约量达到该值的 80% / 90% / 100% 时将分级触发预警。"
      />

      <!-- 仅新增时出现：一键生成默认时段/票种/库存 -->
      <template v-if="!isEdit">
        <ElFormItem label="一键生成默认时段与票种">
          <ElSwitch v-model="model.generateDefaults" />
        </ElFormItem>
        <template v-if="model.generateDefaults">
          <ElFormItem label="生成库存天数">
            <ElInputNumber v-model="model.defaultStockDays" :min="1" :max="30" class="w-full" />
          </ElFormItem>
          <ElFormItem label="每时段库存">
            <ElInputNumber v-model="model.defaultSlotStock" :min="1" :max="100000" :step="50" class="w-full" />
          </ElFormItem>
          <ElAlert
            class="mb-16px"
            type="info"
            :closable="false"
            show-icon
            title="将生成 4 个时段（08:00-17:00，每两小时一场）与 3 个票种（成人全票 / 优待票 / 四季家庭年卡），并为前两个票种生成分时库存。关闭开关则全部手动配置。"
          />
        </template>
      </template>

      <ElFormItem label="状态">
        <ElRadioGroup v-model="model.status">
          <ElRadio :value="1">开放</ElRadio>
          <ElRadio :value="2">关闭</ElRadio>
        </ElRadioGroup>
      </ElFormItem>
      <ElFormItem label="景区简介">
        <ElInput v-model="model.intro" type="textarea" :rows="4" placeholder="请输入景区简介" />
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
