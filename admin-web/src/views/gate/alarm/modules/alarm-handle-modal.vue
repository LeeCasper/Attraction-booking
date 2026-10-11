<script setup lang="ts">
import { ref, watch } from 'vue';
import { alarmLevelRecord, alarmLevelTagType, alarmTypeRecord } from '@/constants/business';
import { fetchHandleAlarm } from '@/service/api';
import { useForm, useFormRules } from '@/hooks/common/form';

defineOptions({ name: 'AlarmHandleModal' });

interface Props {
  /** 待处理的告警 */
  rowData?: Api.Gate.AlarmRow | null;
}

const props = defineProps<Props>();

interface Emits {
  (e: 'submitted'): void;
}

const emit = defineEmits<Emits>();

const visible = defineModel<boolean>('visible', { default: false });

const { formRef, validate, restoreValidation } = useForm();
const { defaultRequiredRule } = useFormRules();

const submitting = ref(false);

interface Model {
  remark: string;
}

const model = ref<Model>({ remark: '' });

const rules: Record<'remark', App.Global.FormRule> = {
  remark: { ...defaultRequiredRule, message: '请填写处理备注', trigger: 'blur' }
};

function formatDateTime(value: string | null | undefined) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-';
}

function closeModal() {
  visible.value = false;
}

async function handleSubmit() {
  await validate();

  if (!props.rowData) return;

  submitting.value = true;
  try {
    const { error } = await fetchHandleAlarm(props.rowData.id, model.value.remark);

    if (error) return;

    window.$message?.success('告警已处理');
    closeModal();
    emit('submitted');
  } finally {
    submitting.value = false;
  }
}

watch(visible, () => {
  if (visible.value) {
    restoreValidation();
    model.value = { remark: '' };
  }
});
</script>

<template>
  <ElDialog v-model="visible" title="处理告警" width="560px">
    <ElDescriptions v-if="props.rowData" :column="1" border class="mb-16px">
      <ElDescriptionsItem label="告警类型">
        {{ alarmTypeRecord[props.rowData.type] ?? props.rowData.type }}
      </ElDescriptionsItem>
      <ElDescriptionsItem label="告警等级">
        <ElTag :type="alarmLevelTagType[props.rowData.level] ?? 'info'">
          {{ alarmLevelRecord[props.rowData.level] ?? '-' }}
        </ElTag>
      </ElDescriptionsItem>
      <ElDescriptionsItem label="告警时间">{{ formatDateTime(props.rowData.createdAt) }}</ElDescriptionsItem>
      <ElDescriptionsItem label="闸机 ID">{{ props.rowData.gateId ?? '-' }}</ElDescriptionsItem>
      <ElDescriptionsItem label="告警内容">{{ props.rowData.content }}</ElDescriptionsItem>
    </ElDescriptions>

    <ElForm ref="formRef" :model="model" :rules="rules" label-position="top">
      <ElFormItem label="处理备注" prop="remark">
        <ElInput
          v-model="model.remark"
          type="textarea"
          :rows="3"
          maxlength="255"
          show-word-limit
          placeholder="请说明排查情况与处理措施"
        />
      </ElFormItem>
      <ElAlert type="info" :closable="false" show-icon>处理后将记录处理人与处理时间，且不可撤销。</ElAlert>
    </ElForm>

    <template #footer>
      <ElSpace :size="16">
        <ElButton @click="closeModal">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="handleSubmit">确认处理</ElButton>
      </ElSpace>
    </template>
  </ElDialog>
</template>

<style scoped></style>
