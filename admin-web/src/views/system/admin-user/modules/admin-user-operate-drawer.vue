<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { enableStatusOptions } from '@/constants/business';
import { REG_PHONE } from '@/constants/reg';
import { fetchCreateAdminUser, fetchGetRoles, fetchUpdateAdminUser } from '@/service/api';
import { useForm, useFormRules } from '@/hooks/common/form';

defineOptions({ name: 'AdminUserOperateDrawer' });

interface Props {
  /** 操作类型 */
  operateType: UI.TableOperateType;
  /** 编辑时的行数据 */
  rowData?: Api.System.AdminUser | null;
}

const props = defineProps<Props>();

interface Emits {
  (e: 'submitted'): void;
}

const emit = defineEmits<Emits>();

const visible = defineModel<boolean>('visible', { default: false });

const { formRef, validate, restoreValidation } = useForm();
const { defaultRequiredRule } = useFormRules();

const title = computed(() => (props.operateType === 'add' ? '新增管理员' : '编辑管理员'));
const isEdit = computed(() => props.operateType === 'edit');
const submitting = ref(false);
const rolesLoading = ref(false);
const roleOptions = ref<Api.System.Role[]>([]);

/** 内置 admin 账号由后端保护，不允许禁用 */
const isBuiltin = computed(() => props.rowData?.username === 'admin');

interface Model {
  username: string;
  password: string;
  realName: string;
  phone: string;
  status: number;
  roleIds: number[];
}

function createDefaultModel(): Model {
  return {
    username: '',
    password: '',
    realName: '',
    phone: '',
    status: 1,
    roleIds: []
  };
}

const model = ref(createDefaultModel());

/** 手机号为可选字段：留空放行，填写则校验格式 */
const phoneRule: App.Global.FormRule = {
  validator: (_rule, value: string, callback) => {
    if (!value) {
      callback();

      return;
    }

    if (REG_PHONE.test(value)) {
      callback();

      return;
    }

    callback(new Error('手机号格式不正确'));
  },
  trigger: 'blur'
};

const rules = computed(() => {
  const base: Record<string, App.Global.FormRule> = {
    realName: { max: 32, message: '姓名不超过 32 个字符', trigger: 'blur' },
    phone: phoneRule
  };

  if (isEdit.value) {
    return base;
  }

  return {
    ...base,
    username: { ...defaultRequiredRule, min: 2, max: 32, message: '请输入 2-32 个字符的用户名' },
    password: { ...defaultRequiredRule, min: 6, max: 64, message: '密码长度需为 6-64 位' }
  };
});

async function loadRoles() {
  rolesLoading.value = true;
  try {
    const { data, error } = await fetchGetRoles();

    if (!error) {
      roleOptions.value = data;
    }
  } finally {
    rolesLoading.value = false;
  }
}

async function handleInitModel() {
  model.value = createDefaultModel();

  await loadRoles();

  if (props.operateType !== 'edit' || !props.rowData) {
    return;
  }

  const { username, realName, phone, status, roles } = props.rowData;

  // 列表接口返回角色名称，这里映射回角色 ID 用于多选回显
  model.value.username = username;
  model.value.realName = realName ?? '';
  model.value.phone = phone ?? '';
  model.value.status = status;
  model.value.roleIds = roleOptions.value.filter(role => roles.includes(role.name)).map(role => role.id);
}

function closeDrawer() {
  visible.value = false;
}

async function handleSubmit() {
  await validate();

  submitting.value = true;
  try {
    if (isEdit.value && props.rowData) {
      const { error } = await fetchUpdateAdminUser(props.rowData.id, {
        realName: model.value.realName || undefined,
        phone: model.value.phone || undefined,
        status: model.value.status,
        roleIds: model.value.roleIds
      });

      if (error) return;
    } else {
      const { error } = await fetchCreateAdminUser({
        username: model.value.username,
        password: model.value.password,
        realName: model.value.realName || undefined,
        phone: model.value.phone || undefined,
        roleIds: model.value.roleIds
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
    <ElForm ref="formRef" v-loading="rolesLoading" :model="model" :rules="rules" label-position="top">
      <ElFormItem label="用户名" prop="username">
        <ElInput v-model="model.username" :disabled="isEdit" placeholder="登录账号，2-32 个字符" />
      </ElFormItem>
      <ElFormItem v-if="!isEdit" label="初始密码" prop="password">
        <ElInput
          v-model="model.password"
          type="password"
          show-password
          placeholder="至少 6 位，创建后可通过「重置密码」修改"
        />
      </ElFormItem>
      <ElFormItem label="姓名" prop="realName">
        <ElInput v-model="model.realName" placeholder="真实姓名" />
      </ElFormItem>
      <ElFormItem label="手机号" prop="phone">
        <ElInput v-model="model.phone" placeholder="用于接收通知" />
      </ElFormItem>
      <ElFormItem label="角色">
        <ElSelect
          v-model="model.roleIds"
          multiple
          collapse-tags
          collapse-tags-tooltip
          placeholder="请选择角色"
          class="w-full"
        >
          <ElOption v-for="role in roleOptions" :key="role.id" :label="role.name" :value="role.id" />
        </ElSelect>
      </ElFormItem>
      <ElFormItem v-if="isEdit" label="状态">
        <ElRadioGroup v-model="model.status" :disabled="isBuiltin">
          <ElRadio v-for="item in enableStatusOptions" :key="item.value" :value="item.value">
            {{ item.label }}
          </ElRadio>
        </ElRadioGroup>
        <ElText v-if="isBuiltin" type="info" class="mt-4px">内置 admin 账号不可禁用。</ElText>
      </ElFormItem>
      <ElFormItem v-else label="状态">
        <ElText type="info">新建管理员默认为「启用」。</ElText>
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
