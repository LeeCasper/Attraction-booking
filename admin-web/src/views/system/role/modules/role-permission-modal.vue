<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fetchAssignRolePermissions } from '@/service/api';

defineOptions({ name: 'RolePermissionModal' });

interface Props {
  /** 待分配权限的角色 */
  role?: Api.System.Role | null;
}

const props = defineProps<Props>();

interface Emits {
  (e: 'submitted'): void;
}

const emit = defineEmits<Emits>();

const visible = defineModel<boolean>('visible', { default: false });

interface PermissionItem {
  /** 权限标识，如 ticket:create */
  value: string;
  label: string;
}

interface PermissionGroup {
  label: string;
  permissions: PermissionItem[];
}

/** 权限清单：按资源分组，供角色多选分配 */
const permissionGroups: PermissionGroup[] = [
  {
    label: '景区管理',
    permissions: [
      { value: 'scenic:read', label: '查看景区' },
      { value: 'scenic:create', label: '新建景区' },
      { value: 'scenic:update', label: '编辑景区' },
      { value: 'scenic:delete', label: '删除景区' }
    ]
  },
  {
    label: '票种管理',
    permissions: [
      { value: 'ticket:read', label: '查看票种' },
      { value: 'ticket:create', label: '新建票种' },
      { value: 'ticket:update', label: '编辑票种' },
      { value: 'ticket:delete', label: '删除票种' }
    ]
  },
  {
    label: '库存管理',
    permissions: [
      { value: 'stock:read', label: '查看库存' },
      { value: 'stock:update', label: '调整库存' }
    ]
  },
  {
    label: '订单管理',
    permissions: [
      { value: 'order:read', label: '查看订单' },
      { value: 'order:refund_audit', label: '退改审核' }
    ]
  },
  {
    label: '核销',
    permissions: [{ value: 'verify:execute', label: '执行核销' }]
  },
  {
    label: '闸机',
    permissions: [
      { value: 'gate:read', label: '查看闸机' },
      { value: 'gate:control', label: '控制闸机' }
    ]
  },
  {
    label: '数据看板',
    permissions: [{ value: 'stats:read', label: '查看数据看板' }]
  },
  {
    label: '参数配置',
    permissions: [
      { value: 'config:read', label: '查看参数' },
      { value: 'config:update', label: '修改参数' }
    ]
  },
  {
    label: '角色权限',
    permissions: [
      { value: 'role:read', label: '查看角色' },
      { value: 'role:create', label: '新建角色' },
      { value: 'role:update', label: '编辑角色' },
      { value: 'role:assign', label: '分配权限' },
      { value: 'role:delete', label: '删除角色' }
    ]
  },
  {
    label: '管理员',
    permissions: [
      { value: 'admin:read', label: '查看管理员' },
      { value: 'admin:create', label: '新建管理员' },
      { value: 'admin:update', label: '编辑管理员' },
      { value: 'admin:delete', label: '删除管理员' },
      { value: 'admin:reset_password', label: '重置密码' }
    ]
  },
  {
    label: '操作日志',
    permissions: [{ value: 'log:read', label: '查看操作日志' }]
  }
];

const allPermissions = permissionGroups.flatMap(group => group.permissions.map(item => item.value));

const isSuper = computed(() => props.role?.code === 'super');
const submitting = ref(false);
const selected = ref<string[]>([]);

function handleInitModel() {
  selected.value = [];

  if (!props.role) return;

  const permissions = props.role.permissions ?? [];

  // 超管返回 ['*']，等价于拥有全部权限
  selected.value = permissions.includes('*')
    ? [...allPermissions]
    : allPermissions.filter(permission => permissions.includes(permission));
}

function checkAll() {
  selected.value = [...allPermissions];
}

function clearAll() {
  selected.value = [];
}

function closeModal() {
  visible.value = false;
}

async function handleSubmit() {
  if (!props.role || isSuper.value) return;

  submitting.value = true;
  try {
    // 按清单顺序提交，避免勾选顺序影响后端存储
    const permissions = allPermissions.filter(permission => selected.value.includes(permission));

    const { error } = await fetchAssignRolePermissions(props.role.id, permissions);

    if (error) return;

    window.$message?.success('权限分配成功');
    closeModal();
    emit('submitted');
  } finally {
    submitting.value = false;
  }
}

watch(visible, () => {
  if (visible.value) {
    handleInitModel();
  }
});
</script>

<template>
  <ElDialog v-model="visible" title="分配权限" width="720px">
    <ElAlert v-if="isSuper" class="mb-16px" type="warning" :closable="false" show-icon>
      超管角色默认拥有全部权限，不可调整。
    </ElAlert>
    <div class="mb-12px flex items-center justify-between">
      <span class="text-sm text-gray-500">
        角色：<span class="font-medium">{{ role?.name ?? '-' }}</span>
        <ElTag class="ml-8px" type="info" size="small">{{ role?.code ?? '-' }}</ElTag>
      </span>
      <ElSpace :size="8">
        <ElButton size="small" :disabled="isSuper" @click="checkAll">全选</ElButton>
        <ElButton size="small" :disabled="isSuper" @click="clearAll">清空</ElButton>
      </ElSpace>
    </div>
    <ElCheckboxGroup v-model="selected" class="w-full" :disabled="isSuper">
      <div v-for="group in permissionGroups" :key="group.label">
        <ElDivider content-position="left">{{ group.label }}</ElDivider>
        <div class="flex flex-wrap gap-x-24px gap-y-8px">
          <ElCheckbox v-for="item in group.permissions" :key="item.value" :value="item.value">
            {{ item.label }}
          </ElCheckbox>
        </div>
      </div>
    </ElCheckboxGroup>
    <template #footer>
      <ElSpace :size="16">
        <ElButton @click="closeModal">取消</ElButton>
        <ElButton type="primary" :loading="submitting" :disabled="isSuper" @click="handleSubmit">确认</ElButton>
      </ElSpace>
    </template>
  </ElDialog>
</template>

<style scoped></style>
