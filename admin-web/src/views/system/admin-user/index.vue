<script setup lang="tsx">
import { ref } from 'vue';
import { enableStatusRecord } from '@/constants/business';
import { fetchDeleteAdminUser, fetchGetAdminUsers, fetchResetAdminPassword } from '@/service/api';
import { useTableOperate, useUIPaginatedTable } from '@/hooks/common/table';
import { useAuth } from '@/hooks/business/auth';
import { backendPageTransform } from '@/utils/backend';
import AdminUserOperateDrawer from './modules/admin-user-operate-drawer.vue';

const { hasAuth } = useAuth();

const searchParams = ref({
  page: 1,
  pageSize: 10,
  keyword: ''
});

const { columns, columnChecks, data, loading, getData, getDataByPage, pagination } = useUIPaginatedTable({
  api: () => fetchGetAdminUsers(searchParams.value),
  transform: backendPageTransform<Api.System.AdminUser>(() => ({
    page: searchParams.value.page,
    pageSize: searchParams.value.pageSize
  })),
  paginationProps: {
    pageSizes: [10, 20, 50]
  },
  onPaginationParamsChange: params => {
    searchParams.value.page = params.currentPage ?? 1;
    searchParams.value.pageSize = params.pageSize ?? 10;
  },
  columns: () => [
    {
      prop: 'username',
      label: '用户名',
      minWidth: 150,
      formatter: row => (
        <div class="flex-center gap-8px">
          <span>{row.username}</span>
          {row.username === 'admin' ? (
            <ElTag type="danger" size="small">
              内置
            </ElTag>
          ) : null}
        </div>
      )
    },
    { prop: 'realName', label: '姓名', width: 120, formatter: row => <span>{row.realName || '-'}</span> },
    { prop: 'phone', label: '手机号', width: 140, formatter: row => <span>{row.phone || '-'}</span> },
    {
      prop: 'roles',
      label: '角色',
      minWidth: 180,
      formatter: row => (
        <div class="flex flex-wrap gap-4px">
          {row.roles?.length ? (
            row.roles.map(name => (
              <ElTag key={name} type="info" size="small">
                {name}
              </ElTag>
            ))
          ) : (
            <span>-</span>
          )}
        </div>
      )
    },
    {
      prop: 'status',
      label: '状态',
      width: 90,
      formatter: row => {
        const tagMap: Record<number, UI.ThemeColor> = { 1: 'success', 2: 'danger' };

        return <ElTag type={tagMap[row.status] ?? 'info'}>{enableStatusRecord[row.status] ?? '-'}</ElTag>;
      }
    },
    {
      prop: 'lastLoginAt',
      label: '最后登录时间',
      width: 180,
      formatter: row => <span>{row.lastLoginAt ? row.lastLoginAt.replace('T', ' ').slice(0, 19) : '从未登录'}</span>
    },
    {
      prop: 'operate',
      label: '操作',
      width: 260,
      formatter: row => {
        /** 内置 admin 账号由后端保护：不可禁用、不可删除 */
        const isBuiltin = row.username === 'admin';

        return (
          <div class="flex-center gap-8px">
            {hasAuth('admin:update') ? (
              <ElButton type="primary" plain size="small" onClick={() => handleEdit(row.id)}>
                编辑
              </ElButton>
            ) : null}
            {hasAuth('admin:reset_password') ? (
              <ElButton type="warning" plain size="small" onClick={() => handleResetPassword(row)}>
                重置密码
              </ElButton>
            ) : null}
            {hasAuth('admin:delete') ? (
              <ElPopconfirm title="确认删除该管理员？删除后其账号将无法登录" onConfirm={() => handleDelete(row.id)}>
                {{
                  reference: () => (
                    <ElButton type="danger" plain size="small" disabled={isBuiltin}>
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

function handleSearch() {
  getDataByPage(1);
}

function resetSearch() {
  searchParams.value.keyword = '';
  getDataByPage(1);
}

async function handleResetPassword(row: Api.System.AdminUser) {
  const result = await window.$messageBox
    ?.prompt('请输入新密码', `重置「${row.username}」的登录密码`, {
      confirmButtonText: '确认重置',
      cancelButtonText: '取消',
      inputType: 'password',
      inputPlaceholder: '长度至少 6 位',
      inputValidator: value => (!value || value.length < 6 ? '密码长度至少 6 位' : true)
    })
    .catch(() => null);

  if (!result) return;

  const { error } = await fetchResetAdminPassword(row.id, result.value);

  if (error) return;

  window.$message?.success('密码已重置');
}

async function handleDelete(id: number) {
  const { error } = await fetchDeleteAdminUser(id);

  if (error) return;

  onDeleted();
}
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <ElCard class="card-wrapper" :body-style="{ paddingBottom: '0' }">
      <ElForm :model="searchParams" label-position="left" :label-width="80" inline>
        <ElFormItem label="用户名">
          <ElInput
            v-model="searchParams.keyword"
            placeholder="按用户名模糊搜索"
            clearable
            class="w-200px"
            @keyup.enter="handleSearch"
          />
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" @click="handleSearch">查询</ElButton>
          <ElButton @click="resetSearch">重置</ElButton>
        </ElFormItem>
      </ElForm>
    </ElCard>
    <ElCard class="card-wrapper sm:flex-1-hidden">
      <template #header>
        <div class="flex items-center justify-between">
          <p>管理员管理</p>
          <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData">
            <template #default>
              <ElButton v-if="hasAuth('admin:create')" plain type="primary" @click="handleAdd">
                <template #icon>
                  <icon-ic-round-plus class="text-icon" />
                </template>
                新增管理员
              </ElButton>
            </template>
          </TableHeaderOperation>
        </div>
      </template>
      <ElTable v-loading="loading" border class="sm:h-full" :data="data" row-key="id">
        <ElTableColumn v-for="col in columns" :key="col.prop" v-bind="col" />
      </ElTable>
      <ElPagination
        v-model:current-page="pagination.currentPage"
        v-model:page-size="pagination.pageSize"
        class="mt-16px justify-end"
        :total="pagination.total"
        :page-sizes="pagination.pageSizes"
        layout="total, sizes, prev, pager, next, jumper"
      />
      <AdminUserOperateDrawer
        v-model:visible="drawerVisible"
        :operate-type="operateType"
        :row-data="editingData"
        @submitted="getDataByPage"
      />
    </ElCard>
  </div>
</template>

<style scoped></style>
