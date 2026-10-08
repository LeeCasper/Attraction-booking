<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fetchAuditRefund } from '@/service/api';
import { useForm, useFormRules } from '@/hooks/common/form';
import { formatPrice } from '@/utils/business';

defineOptions({ name: 'RefundAuditModal' });

interface Props {
  /** 待审核的退款单 */
  rowData?: Api.Order.RefundRow | null;
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
  /** true 通过 / false 拒绝 */
  approve: boolean;
  remark: string;
}

const model = ref<Model>({ approve: true, remark: '' });

/** 拒绝时备注必填 */
const rules = computed<Record<string, App.Global.FormRule>>(() => ({
  remark: model.value.approve
    ? { max: 255, message: '备注不超过 255 个字符', trigger: 'blur' }
    : { ...defaultRequiredRule, message: '拒绝时需填写拒绝原因', trigger: 'blur' }
}));

function closeModal() {
  visible.value = false;
}

async function handleSubmit() {
  await validate();

  if (!props.rowData) return;

  const message = model.value.approve
    ? '通过后将调用微信支付退款接口，原路退回且不可撤销，确认继续？'
    : '确认拒绝该退款申请？拒绝后用户需重新发起。';

  const confirmed = await window.$messageBox
    ?.confirm(message, '审核确认', {
      type: 'warning',
      confirmButtonText: '确认提交',
      cancelButtonText: '取消'
    })
    .catch(() => false);

  if (!confirmed) return;

  submitting.value = true;
  try {
    const { error } = await fetchAuditRefund(props.rowData.id, {
      approve: model.value.approve,
      remark: model.value.remark || undefined
    });

    if (error) return;

    window.$message?.success(model.value.approve ? '已通过，退款处理中' : '已拒绝');
    closeModal();
    emit('submitted');
  } finally {
    submitting.value = false;
  }
}

watch(visible, () => {
  if (visible.value) {
    restoreValidation();
    model.value = { approve: true, remark: '' };
  }
});
</script>

<template>
  <ElDialog v-model="visible" title="退款审核" width="560px">
    <ElDescriptions v-if="props.rowData" :column="1" border class="mb-16px">
      <ElDescriptionsItem label="关联订单号">{{ props.rowData.orderNo }}</ElDescriptionsItem>
      <ElDescriptionsItem label="申请金额">{{ formatPrice(props.rowData.amount) }}</ElDescriptionsItem>
      <ElDescriptionsItem label="手续费">{{ formatPrice(props.rowData.fee) }}</ElDescriptionsItem>
      <ElDescriptionsItem label="实退金额">{{ formatPrice(props.rowData.actualAmount) }}</ElDescriptionsItem>
      <ElDescriptionsItem label="退款原因">{{ props.rowData.reason || '-' }}</ElDescriptionsItem>
    </ElDescriptions>

    <ElForm ref="formRef" :model="model" :rules="rules" label-position="top">
      <ElFormItem label="审核结果">
        <ElRadioGroup v-model="model.approve">
          <ElRadio :value="true">通过</ElRadio>
          <ElRadio :value="false">拒绝</ElRadio>
        </ElRadioGroup>
      </ElFormItem>
      <ElFormItem label="备注" prop="remark">
        <ElInput
          v-model="model.remark"
          type="textarea"
          :rows="3"
          maxlength="255"
          show-word-limit
          :placeholder="model.approve ? '选填，如审核说明' : '必填，请说明拒绝原因'"
        />
      </ElFormItem>
      <ElAlert v-if="model.approve" type="warning" :closable="false" show-icon>
        通过后将调用微信支付退款接口，原路退回且不可撤销。
      </ElAlert>
    </ElForm>

    <template #footer>
      <ElSpace :size="16">
        <ElButton @click="closeModal">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="handleSubmit">确认提交</ElButton>
      </ElSpace>
    </template>
  </ElDialog>
</template>

<style scoped></style>
