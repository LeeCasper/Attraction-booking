<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { enableStatusOptions } from '@/constants/business';
import { fetchCreateRole, fetchUpdateRole } from '@/service/api';
import { useForm, useFormRules } from '@/hooks/common/form';

defineOptions({ name: 'RoleOperateDrawer' });

interface Props {
  /** 操作类型 */
  operateType: UI.TableOperateType;
  /** 编辑时的行数据 */
  rowData?: Api.System.Role | null;
}

const props = defineProps<Props>();

interface Emits {
  (e: 'submitted'): void;
}

const emit = defineEmits<Emits>();

const visible = defineModel<boolean>('visible', { default: false });

const { formRef, validate, restoreValidation } = useForm();
const { defaultRequiredRule } = useFormRules();

const title = computed(() => (props.operateType === 'add' ? '新增角色' : '编辑角色'));
const isEdit = computed(() => props.operateType === 'edit');
const submitting = ref(false);

interface Model {
  name: string;
  code: string;
  remark: string;
  status: number;
}

function createDefaultModel(): Model {
  return {
    name: '',
    code: '',
    remark: '',
    status: 1
  };
}

const model = ref(createDefaultModel());

/** 角色标识：小写字母开头，仅允许小写字母、数字与下划线（创建时由后端持久化） */
const rules: Record<'name' | 'code', App.Global.FormRule> = {
  name: { ...defaultRequiredRule, min: 2, max: 32, message: '请输入 2-32 个字符的角色名称' },
  code: {
    required: true,
    pattern: /^[a-z][a-z0-9_]{1,31}$/,
    message: '角色标识需以小写字母开头，仅含小写字母、数字、下划线，长度 2-32'
  }
};

function handleInitModel() {
  model.value = createDefaultModel();

  if (props.operateType !== 'edit' || !props.rowData) {
    return;
  }

  const { name, code, remark, status } = props.rowData;

  Object.assign(model.value, {
    name,
    code,
    remark: remark ?? '',
    status
  });
}

function closeDrawer() {
  visible.value = false;
}

async function handleSubmit() {
  await validate();

  submitting.value = true;
  try {
    if (isEdit.value && props.rowData) {
      // 编辑时角色标识与创建接口均不可变更，仅提交名称、说明与状态
      const { error } = await fetchUpdateRole(props.rowData.id, {
        name: model.value.name,
        remark: model.value.remark || undefined,
        status: model.value.status
      });

      if (error) return;
    } else {
      // 创建接口暂不支持指定状态，新角色默认启用
      const { error } = await fetchCreateRole({
        name: model.value.name,
        code: model.value.code,
        remark: model.value.remark || undefined
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
    <ElForm ref="formRef" :model="model" :rules="rules" label-position="top">
      <ElFormItem label="角色名称" prop="name">
        <ElInput v-model="model.name" placeholder="如 景区运营" />
      </ElFormItem>
      <ElFormItem label="角色标识" prop="code">
        <ElInput v-model="model.code" :disabled="isEdit" placeholder="如 ops、checker" />
      </ElFormItem>
      <ElFormItem label="说明">
        <ElInput v-model="model.remark" type="textarea" :rows="2" placeholder="该角色的职责说明" />
      </ElFormItem>
      <ElFormItem v-if="isEdit" label="状态">
        <ElRadioGroup v-model="model.status">
          <ElRadio v-for="item in enableStatusOptions" :key="item.value" :value="item.value">
            {{ item.label }}
          </ElRadio>
        </ElRadioGroup>
      </ElFormItem>
      <ElFormItem v-else label="状态">
        <ElText type="info">新建角色默认为「启用」，可在创建后调整。</ElText>
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
