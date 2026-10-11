<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  fetchCreateTicketType,
  fetchGetTicketTypeDetail,
  fetchUpdatePurchaseRule,
  fetchUpdateTicketType
} from '@/service/api';
import { useForm, useFormRules } from '@/hooks/common/form';
import { centsToYuan, yuanToCents } from '@/utils/business';

defineOptions({ name: 'TicketTypeOperateDrawer' });

interface Props {
  /** 操作类型 */
  operateType: UI.TableOperateType;
  /** 编辑时的行数据 */
  rowData?: Api.Ticket.TicketType | null;
  /** 所属景区（新增时使用） */
  areaId: number | null;
}

const props = defineProps<Props>();

interface Emits {
  (e: 'submitted'): void;
}

const emit = defineEmits<Emits>();

const visible = defineModel<boolean>('visible', { default: false });

const { formRef, validate, restoreValidation } = useForm();
const { defaultRequiredRule } = useFormRules();

const title = computed(() => (props.operateType === 'add' ? '新增票种' : '编辑票种'));
const isEdit = computed(() => props.operateType === 'edit');
const loading = ref(false);
const submitting = ref(false);

/** 表单模型：价格以「元」输入，提交时转「分」；限购规则为票种的子资源 */
interface Model {
  name: string;
  audience: string;
  basePriceYuan: number;
  needRealname: number;
  status: number;
  remark: string;
  perUserPerOrder: number;
  perUserPerDay: number;
  perIdcardPerDay: number;
  beforeDay: number;
  feeRatePercent: number;
  expiredNoRefund: boolean;
}

function createDefaultModel(): Model {
  return {
    name: '',
    audience: '',
    basePriceYuan: 0,
    needRealname: 1,
    status: 1,
    remark: '',
    perUserPerOrder: 4,
    perUserPerDay: 5,
    perIdcardPerDay: 1,
    beforeDay: 1,
    feeRatePercent: 20,
    expiredNoRefund: true
  };
}

const model = ref(createDefaultModel());

const rules: Record<'name' | 'basePriceYuan', App.Global.FormRule> = {
  name: defaultRequiredRule,
  basePriceYuan: defaultRequiredRule
};

async function handleInitModel() {
  model.value = createDefaultModel();

  if (props.operateType !== 'edit' || !props.rowData) {
    return;
  }

  const { id, name, audience, basePrice, needRealname, status, remark, refundRule } = props.rowData;

  Object.assign(model.value, {
    name,
    audience: audience ?? '',
    basePriceYuan: centsToYuan(basePrice),
    needRealname,
    status,
    remark: remark ?? '',
    beforeDay: refundRule?.beforeDay ?? 1,
    feeRatePercent: Math.round((refundRule?.feeRate ?? 0) * 100),
    expiredNoRefund: refundRule?.expiredNoRefund ?? true
  });

  // 限购规则是独立资源，需额外拉取
  loading.value = true;
  try {
    const { data, error } = await fetchGetTicketTypeDetail(id);

    if (!error && data.purchaseRule) {
      model.value.perUserPerOrder = data.purchaseRule.perUserPerOrder;
      model.value.perUserPerDay = data.purchaseRule.perUserPerDay;
      model.value.perIdcardPerDay = data.purchaseRule.perIdcardPerDay;
    }
  } finally {
    loading.value = false;
  }
}

function closeDrawer() {
  visible.value = false;
}

async function handleSubmit() {
  await validate();

  if (!isEdit.value && !props.areaId) {
    window.$message?.error('请先选择景区');
    return;
  }

  const payload: Api.Ticket.TicketTypePayload = {
    name: model.value.name,
    audience: model.value.audience || undefined,
    basePrice: yuanToCents(model.value.basePriceYuan),
    needRealname: model.value.needRealname,
    status: model.value.status,
    remark: model.value.remark || undefined,
    refundRule: {
      beforeDay: model.value.beforeDay,
      feeRate: model.value.feeRatePercent / 100,
      expiredNoRefund: model.value.expiredNoRefund
    }
  };

  submitting.value = true;
  try {
    if (isEdit.value && props.rowData) {
      const { error } = await fetchUpdateTicketType(props.rowData.id, payload);

      if (error) return;

      const ruleRes = await fetchUpdatePurchaseRule(props.rowData.id, {
        perUserPerOrder: model.value.perUserPerOrder,
        perUserPerDay: model.value.perUserPerDay,
        perIdcardPerDay: model.value.perIdcardPerDay
      });

      if (ruleRes.error) return;
    } else {
      const { error } = await fetchCreateTicketType({
        ...payload,
        scenicAreaId: props.areaId as number,
        purchaseRule: {
          perUserPerOrder: model.value.perUserPerOrder,
          perUserPerDay: model.value.perUserPerDay,
          perIdcardPerDay: model.value.perIdcardPerDay
        }
      });

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
  <ElDrawer v-model="visible" :title="title" :size="420">
    <ElForm ref="formRef" v-loading="loading" :model="model" :rules="rules" label-position="top">
      <ElFormItem label="票种名称" prop="name">
        <ElInput v-model="model.name" placeholder="如 成人票、儿童票" />
      </ElFormItem>
      <ElFormItem label="适用人群">
        <ElInput v-model="model.audience" placeholder="如 18-60 周岁" />
      </ElFormItem>
      <ElFormItem label="基础价（元）" prop="basePriceYuan">
        <ElInputNumber v-model="model.basePriceYuan" :min="0" :precision="2" :step="10" class="w-full" />
      </ElFormItem>
      <ElFormItem label="是否实名">
        <ElRadioGroup v-model="model.needRealname">
          <ElRadio :value="1">是</ElRadio>
          <ElRadio :value="0">否</ElRadio>
        </ElRadioGroup>
      </ElFormItem>
      <ElFormItem label="状态">
        <ElRadioGroup v-model="model.status">
          <ElRadio :value="1">上架</ElRadio>
          <ElRadio :value="2">下架</ElRadio>
        </ElRadioGroup>
      </ElFormItem>

      <ElDivider content-position="left">限购规则</ElDivider>
      <ElFormItem label="单笔限购（张）">
        <ElInputNumber v-model="model.perUserPerOrder" :min="1" :max="100" class="w-full" />
      </ElFormItem>
      <ElFormItem label="每人每日限购（张）">
        <ElInputNumber v-model="model.perUserPerDay" :min="1" :max="100" class="w-full" />
      </ElFormItem>
      <ElFormItem label="每证每日限购（张）">
        <ElInputNumber v-model="model.perIdcardPerDay" :min="1" :max="100" class="w-full" />
      </ElFormItem>

      <ElDivider content-position="left">退改规则</ElDivider>
      <ElFormItem label="提前免手续费天数">
        <ElInputNumber v-model="model.beforeDay" :min="0" :max="30" class="w-full" />
      </ElFormItem>
      <ElFormItem label="当日退票手续费（%）">
        <ElInputNumber v-model="model.feeRatePercent" :min="0" :max="100" class="w-full" />
      </ElFormItem>
      <ElFormItem label="过期不可退">
        <ElSwitch v-model="model.expiredNoRefund" />
      </ElFormItem>

      <ElFormItem label="备注">
        <ElInput v-model="model.remark" type="textarea" :rows="2" />
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
