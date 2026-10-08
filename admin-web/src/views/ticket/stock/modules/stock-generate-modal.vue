<script setup lang="ts">
import { ref, watch } from 'vue';
import { fetchGenerateStock } from '@/service/api';
import { useForm, useFormRules } from '@/hooks/common/form';
import { formatDate } from '@/utils/business';

defineOptions({ name: 'StockGenerateModal' });

interface Props {
  /** 目标票种 id */
  ticketTypeId: number | null;
}

const props = defineProps<Props>();

interface Emits {
  (e: 'submitted'): void;
}

const emit = defineEmits<Emits>();

const visible = defineModel<boolean>('visible', { default: false });

const { formRef, validate, restoreValidation } = useForm();
const { createRequiredRule } = useFormRules();

const submitting = ref(false);

/** 默认日期范围：今天 ~ 今天 + 6 天（与列表页保持一致） */
function getDefaultDateRange(): string[] {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 6);

  return [formatDate(start), formatDate(end)];
}

interface Model {
  /** [开始日期, 结束日期]，yyyy-MM-dd */
  dateRange: string[];
  /** 每个时段的库存数 */
  total: number;
}

function createDefaultModel(): Model {
  return {
    dateRange: getDefaultDateRange(),
    total: 100
  };
}

const model = ref(createDefaultModel());

const rules: Record<'dateRange' | 'total', App.Global.FormRule> = {
  dateRange: { required: true, message: '请选择日期范围', type: 'array' },
  total: createRequiredRule('请填写每个时段的库存数')
};

function closeModal() {
  visible.value = false;
}

async function handleSubmit() {
  await validate();

  if (!props.ticketTypeId) {
    window.$message?.error('请先选择票种');
    return;
  }

  const [startDate = '', endDate = ''] = model.value.dateRange;

  try {
    await ElMessageBox.confirm(
      `${startDate} ~ ${endDate} 期间的每个时段将生成 ${model.value.total} 条库存。已有库存记录的日期/时段不会被覆盖，只补充缺失的记录。是否继续？`,
      '批量生成库存',
      {
        type: 'warning',
        confirmButtonText: '确认生成',
        cancelButtonText: '取消'
      }
    );
  } catch {
    return;
  }

  submitting.value = true;
  try {
    const { data, error } = await fetchGenerateStock({
      ticketTypeId: props.ticketTypeId,
      startDate,
      endDate,
      total: model.value.total
    });

    if (error) return;

    window.$message?.success(`已生成 ${data.created} 条库存`);
    closeModal();
    emit('submitted');
  } finally {
    submitting.value = false;
  }
}

watch(visible, () => {
  if (visible.value) {
    restoreValidation();
    model.value = createDefaultModel();
  }
});
</script>

<template>
  <ElDialog v-model="visible" title="批量生成库存" width="520px" append-to-body>
    <ElForm ref="formRef" :model="model" :rules="rules" label-position="top">
      <ElFormItem label="日期范围" prop="dateRange">
        <ElDatePicker
          v-model="model.dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="~"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          class="w-full"
        />
      </ElFormItem>
      <ElFormItem label="每个时段库存数" prop="total">
        <ElInputNumber v-model="model.total" :min="1" :max="100000" class="w-full" />
      </ElFormItem>
      <ElAlert type="info" :closable="false" show-icon title="已有库存记录的日期/时段不会被覆盖，只补充缺失的记录" />
    </ElForm>
    <template #footer>
      <ElSpace :size="16">
        <ElButton @click="closeModal">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="handleSubmit">确认</ElButton>
      </ElSpace>
    </template>
  </ElDialog>
</template>

<style scoped></style>
