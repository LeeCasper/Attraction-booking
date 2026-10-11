<script setup lang="tsx">
import { ref } from 'vue';
import { enableStatusRecord } from '@/constants/business';
import { fetchDeleteRole, fetchGetRoles } from '@/service/api';
import { useTableOperate, useUIPaginatedTable } from '@/hooks/common/table';
import { useAuth } from '@/hooks/business/auth';
import { backendArrayTransform } from '@/utils/backend';
import RoleOperateDrawer from './modules/role-operate-drawer.vue';
import RolePermissionModal from './modules/role-permission-modal.vue';

const { hasAuth } = useAuth();

const { columns, columnChecks, data, loading, getData, getDataByPage } = useUIPaginatedTable({
  api: () => fetchGetRoles(),
  transform: response => backendArrayTransform(response),
  columns: () => [
    { prop: 'index', type: 'index', label: '序号', width: 64 },
    { prop: 'name', label: '角色名称', minWidth: 140 },
    {
      prop: 'code',
      label: '角色标识',
      width: 150,
      formatter: row => <ElTag type={row.code === 'super' ? 'danger' : 'info'}>{row.code}</ElTag>
    },
    {
      prop: 'remark',
      label: '说明',
      minWidth: 180,
      formatter: row => <span>{row.remark || '-'}</span>
    },
    {
      prop: 'status',
      label: '状态',
      width: 90,
      formatter: row => {
        const tagMap: Record<number, UI.ThemeColor> = { 1: 'success', 2: 'info' };

        return <ElTag type={tagMap[row.status] ?? 'info'}>{enableStatusRecord[row.status] ?? '-'}</ElTag>;
      }
    },
    {
      prop: 'operate',
      label: '操作',
      width: 280,
      formatter: row => {
        /** 内置超管角色由后端保护：不可编辑、不可删除、不可分配权限 */
        const isSuper = row.code === 'super';

        return (
          <div class="flex-center gap-8px">
            {hasAuth('role:update') ? (
              // eslint-disable-next-line @typescript-eslint/no-use-before-define -- handleEdit 来自下面的 useTableOperate，而它需要表格的 data/getData（两个 hook 互相依赖，这个顺序是唯一能跑的）；列里这行只在点击时读它，不是初始化期。
              <ElButton type="primary" plain size="small" disabled={isSuper} onClick={() => handleEdit(row.id)}>
                编辑
              </ElButton>
            ) : null}
            {hasAuth('role:assign') ? (
              <ElButton type="warning" plain size="small" disabled={isSuper} onClick={() => openPermissionModal(row)}>
                分配权限
              </ElButton>
            ) : null}
            {hasAuth('role:delete') ? (
              <ElPopconfirm
                title="确认删除该角色？删除后使用该角色的管理员将失去对应权限"
                onConfirm={() => handleDelete(row.id)}
              >
                {{
                  reference: () => (
                    <ElButton type="danger" plain size="small" disabled={isSuper}>
                      删除
                    </ElButton>
                  )
                }}
              </ElPopconfirm>
            ) : null}
          </div>
        );
      }
    }
  ]
});

const { drawerVisible, operateType, editingData, handleAdd, handleEdit, onDeleted } = useTableOperate(
  data,
  'id',
  getData
);

const permissionVisible = ref(false);
const permissionRole = ref<Api.System.Role | null>(null);

function openPermissionModal(row: Api.System.Role) {
  permissionRole.value = row;
  permissionVisible.value = true;
}

async function handleDelete(id: number) {
  const { error } = await fetchDeleteRole(id);

  if (error) return;

  onDeleted();
}
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <ElAlert type="info" :closable="false" show-icon>
      <template #title>角色与权限分配</template>
      <p>系统内置超管角色（标识为 super）默认拥有全部权限，不可编辑、不可删除、不可调整权限，由服务端强制保护。</p>
    </ElAlert>
    <ElCard class="card-wrapper sm:flex-1-hidden">
      <template #header>
        <div class="flex items-center justify-between">
          <p>角色管理</p>
          <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData">
            <template #default>
              <ElButton v-if="hasAuth('role:create')" plain type="primary" @click="handleAdd">
                <template #icon>
                  <icon-ic-round-plus class="text-icon" />
                </template>
                新增角色
              </ElButton>
            </template>
          </TableHeaderOperation>
        </div>
      </template>
      <ElTable v-loading="loading" border class="sm:h-full" :data="data" row-key="id">
        <ElTableColumn v-for="col in columns" :key="col.prop" v-bind="col" />
      </ElTable>
      <RoleOperateDrawer
        v-model:visible="drawerVisible"
        :operate-type="operateType"
        :row-data="editingData"
        @submitted="getDataByPage"
      />
      <RolePermissionModal v-model:visible="permissionVisible" :role="permissionRole" @submitted="getData" />
    </ElCard>
  </div>
</template>

<style scoped></style>
