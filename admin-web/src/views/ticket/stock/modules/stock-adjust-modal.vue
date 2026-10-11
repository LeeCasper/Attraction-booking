<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fetchAdjustStock } from '@/service/api';
import { useForm } from '@/hooks/common/form';
import { formatHm } from '@/utils/business';

defineOptions({ name: 'StockAdjustModal' });

interface Props {
  /** 待调整的库存行 */
  rowData?: Api.Ticket.TicketStock | null;
}

const props = defineProps<Props>();

interface Emits {
  (e: 'submitted'): void;
}

const emit = defineEmits<Emits>();

const visible = defineModel<boolean>('visible', { default: false });

const { formRef, validate, restoreValidation } = useForm();

const submitting = ref(false);

interface Model {
  /** 变化量，正数增加 / 负数减少 */
  changeValue: number;
  remark: string;
}

function createDefaultModel(): Model {
  return {
    changeValue: 0,
    remark: ''
  };
}

const model = ref(createDefaultModel());

const rules: Record<'changeValue', App.Global.FormRule> = {
  changeValue: {
    required: true,
    validator: (_rule, value, callback) => {
      if (Number(value) === 0) {
        callback(new Error('请填写非 0 的变化量'));
        return;
      }

      callback();
    },
    trigger: 'change'
  }
};

/** 调整后的总库存 */
const afterTotal = computed(() => (props.rowData?.total ?? 0) + model.value.changeValue);

/** 总库存下限：已售 + 锁定 */
const minTotal = computed(() => (props.rowData?.sold ?? 0) + (props.rowData?.locked ?? 0));

function closeModal() {
  visible.value = false;
}

async function handleSubmit() {
  await validate();

  if (!props.rowData) return;

  if (afterTotal.value < minTotal.value) {
    window.$message?.warning(`调整后总库存不能低于「已售 + 锁定」(${minTotal.value})`);
    return;
  }

  submitting.value = true;
  try {
    const { data, error } = await fetchAdjustStock(props.rowData.id, {
      changeValue: model.value.changeValue,
      remark: model.value.remark || undefined
    });

    if (error) return;

    window.$message?.success(`调整成功，当前总库存 ${data.total}`);
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
  <ElDialog v-model="visible" title="调整库存" width="520px" append-to-body>
    <ElDescriptions v-if="rowData" :column="2" border size="small" class="mb-16px">
      <ElDescriptionsItem label="日期">{{ rowData.date }}</ElDescriptionsItem>
      <ElDescriptionsItem label="时段">
        {{ rowData.slotName }} {{ formatHm(rowData.startTime) }}-{{ formatHm(rowData.endTime) }}
      </ElDescriptionsItem>
      <ElDescriptionsItem label="总库存">{{ rowData.total }}</ElDescriptionsItem>
      <ElDescriptionsItem label="已售">{{ rowData.sold }}</ElDescriptionsItem>
      <ElDescriptionsItem label="锁定">{{ rowData.locked }}</ElDescriptionsItem>
      <ElDescriptionsItem label="剩余">{{ rowData.available }}</ElDescriptionsItem>
    </ElDescriptions>
    <ElForm ref="formRef" :model="model" :rules="rules" label-position="top">
      <ElFormItem label="变化量" prop="changeValue">
        <ElInputNumber v-model="model.changeValue" :min="-100000" :max="100000" class="w-full" />
        <div class="mt-4px text-xs text-gray-400">正数增加，负数减少；调整后总库存为 {{ afterTotal }}</div>
      </ElFormItem>
      <ElFormItem label="备注">
        <ElInput v-model="model.remark" type="textarea" :rows="2" placeholder="请填写调整原因" />
      </ElFormItem>
      <ElAlert type="info" :closable="false" show-icon title="库存调整会写入操作日志" />
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
