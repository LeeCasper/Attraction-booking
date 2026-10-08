<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fetchCreateTimeSlot, fetchUpdateTimeSlot } from '@/service/api';
import { useForm, useFormRules } from '@/hooks/common/form';
import { formatHm } from '@/utils/business';
import { enableStatusOptions } from '@/constants/business';

defineOptions({ name: 'TimeSlotOperateModal' });

interface Props {
  /** 操作类型 */
  operateType: UI.TableOperateType;
  /** 编辑时的行数据 */
  rowData?: Api.Ticket.TimeSlot | null;
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

const title = computed(() => (props.operateType === 'add' ? '新增分时时段' : '编辑分时时段'));
const isEdit = computed(() => props.operateType === 'edit');
const submitting = ref(false);

/** 表单模型：时间以 HH:mm 字符串提交 */
interface Model {
  name: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
  status: number;
}

function createDefaultModel(): Model {
  return {
    name: '',
    startTime: '',
    endTime: '',
    sortOrder: 0,
    status: 1
  };
}

const model = ref(createDefaultModel());

const rules: Record<'name' | 'startTime' | 'endTime', App.Global.FormRule> = {
  name: defaultRequiredRule,
  startTime: defaultRequiredRule,
  endTime: defaultRequiredRule
};

function handleInitModel() {
  model.value = createDefaultModel();

  if (props.operateType !== 'edit' || !props.rowData) {
    return;
  }

  const { name, startTime, endTime, sortOrder, status } = props.rowData;

  Object.assign(model.value, {
    name,
    startTime: formatHm(startTime),
    endTime: formatHm(endTime),
    sortOrder,
    status
  });
}

function closeModal() {
  visible.value = false;
}

async function handleSubmit() {
  await validate();

  // 服务端亦会校验：开始时间必须早于结束时间，这里先做一次前置提示
  if (model.value.startTime >= model.value.endTime) {
    window.$message?.warning('开始时间必须早于结束时间');
    return;
  }

  if (!isEdit.value && !props.areaId) {
    window.$message?.error('请先选择景区');
    return;
  }

  const payload: Api.Ticket.TimeSlotPayload = {
    name: model.value.name,
    startTime: model.value.startTime,
    endTime: model.value.endTime,
    sortOrder: model.value.sortOrder,
    status: model.value.status
  };

  submitting.value = true;
  try {
    if (isEdit.value && props.rowData) {
      const { error } = await fetchUpdateTimeSlot(props.rowData.id, payload);

      if (error) return;
    } else {
      const { error } = await fetchCreateTimeSlot({
        ...payload,
        scenicAreaId: props.areaId as number
      });

      if (error) return;
    }

    window.$message?.success(isEdit.value ? '修改成功' : '新增成功');
    closeModal();
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
  <ElDialog v-model="visible" :title="title" width="460px">
    <ElForm ref="formRef" :model="model" :rules="rules" label-position="top">
      <ElFormItem label="时段名称" prop="name">
        <ElInput v-model="model.name" placeholder="如 上午场、09:00-12:00 场次" />
      </ElFormItem>
      <ElFormItem label="开始时间" prop="startTime">
        <ElTimePicker
          v-model="model.startTime"
          class="w-full"
          format="HH:mm"
          value-format="HH:mm"
          placeholder="请选择开始时间"
        />
      </ElFormItem>
      <ElFormItem label="结束时间" prop="endTime">
        <ElTimePicker
          v-model="model.endTime"
          class="w-full"
          format="HH:mm"
          value-format="HH:mm"
          placeholder="请选择结束时间"
        />
      </ElFormItem>
      <ElFormItem label="排序">
        <ElInputNumber v-model="model.sortOrder" :min="0" :max="999" class="w-full" />
      </ElFormItem>
      <ElFormItem label="状态">
        <ElRadioGroup v-model="model.status">
          <ElRadio v-for="item in enableStatusOptions" :key="item.value" :value="item.value">
            {{ item.label }}
          </ElRadio>
        </ElRadioGroup>
      </ElFormItem>
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
