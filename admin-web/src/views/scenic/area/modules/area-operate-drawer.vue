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
  /** 1 开放 / 2 关闭 */
  status: number;
}

function createDefaultModel(): Model {
  return {
    name: '',
    address: '',
    openTime: '',
    maxCapacity: 1000,
    intro: '',
    status: 1
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

  const { name, address, openTime, maxCapacity, intro, status } = props.rowData;

  Object.assign(model.value, {
    name,
    address: address ?? '',
    openTime: openTime ?? '',
    maxCapacity: maxCapacity ?? 1000,
    intro: intro ?? '',
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
    intro: model.value.intro || undefined
  };

  submitting.value = true;
  try {
    if (isEdit.value && props.rowData) {
      Object.assign(payload, { status: model.value.status });

      const { error } = await fetchUpdateScenicArea(props.rowData.id, payload);

      if (error) return;
    } else {
      const { error } = await fetchCreateScenicArea(payload);

      if (error) return;
    }

    window.$message?.success(isEdit.value ? '修改成功' : '新增成功');
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
