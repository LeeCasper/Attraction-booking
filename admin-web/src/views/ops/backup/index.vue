<script setup lang="tsx">
import { ref } from 'vue';
import { downloadBackup, fetchGetBackups, fetchRunBackup } from '@/service/api';
import { useUIPaginatedTable } from '@/hooks/common/table';
import { backendPageTransform } from '@/utils/backend';
import { useAuth } from '@/hooks/business/auth';

const { hasAuth } = useAuth();

/** 备份类型：auto 自动 / manual 手动 */
const backupTypeRecord: Record<string, string> = {
  auto: '自动',
  manual: '手动'
};

/** 备份状态：10 进行中 / 20 成功 / 30 失败 */
const backupStatusRecord: Record<number, string> = {
  10: '进行中',
  20: '成功',
  30: '失败'
};

const backupStatusTagType: Record<number, UI.ThemeColor> = {
  10: 'warning',
  20: 'success',
  30: 'danger'
};

const running = ref(false);
/** 正在下载的备份记录 id */
const downloadingId = ref<number | null>(null);

function formatDateTime(value: string | null | undefined) {
  return value ? value.replace('T', ' ').slice(0, 19) : '-';
}

/** 字节 → 友好大小 */
function formatSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes <= 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const searchParams = ref({
  page: 1,
  pageSize: 10
});

const { columns, columnChecks, data, loading, getData, getDataByPage, pagination } = useUIPaginatedTable({
  api: () => fetchGetBackups({ page: searchParams.value.page, pageSize: searchParams.value.pageSize }),
  transform: backendPageTransform<Api.Ops.BackupRow>(() => ({
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
    { prop: 'fileName', label: '文件名', minWidth: 260 },
    {
      prop: 'fileSize',
      label: '大小',
      width: 110,
      formatter: row => <span>{formatSize(row.fileSize)}</span>
    },
    {
      prop: 'type',
      label: '类型',
      width: 90,
      formatter: row => <span>{backupTypeRecord[row.type] ?? row.type}</span>
    },
    {
      prop: 'status',
      label: '状态',
      width: 100,
      formatter: row => (
        <ElTag type={backupStatusTagType[row.status] ?? 'info'}>{backupStatusRecord[row.status] ?? '-'}</ElTag>
      )
    },
    {
      prop: 'startedAt',
      label: '开始时间',
      width: 180,
      formatter: row => <span>{formatDateTime(row.startedAt)}</span>
    },
    {
      prop: 'finishedAt',
      label: '完成时间',
      width: 180,
      formatter: row => <span>{formatDateTime(row.finishedAt)}</span>
    },
    {
      prop: 'remark',
      label: '说明',
      minWidth: 200,
      formatter: row => (
        <ElTooltip
          content={row.remark ?? ''}
          placement="top"
          showAfter={300}
          disabled={!row.remark || row.remark.length <= 24}
        >
          <span class="inline-block max-w-280px truncate align-middle">{row.remark || '-'}</span>
        </ElTooltip>
      )
    },
    {
      prop: 'operate',
      label: '操作',
      width: 100,
      fixed: 'right',
      formatter: row => (
        <div class="flex-center gap-8px">
          {hasAuth('config:read') ? (
            <ElButton
              type="primary"
              plain
              size="small"
              disabled={row.status === 10}
              loading={downloadingId.value === row.id}
              onClick={() => handleDownload(row)}
            >
              下载
            </ElButton>
          ) : null}
        </div>
      )
    }
  ]
});

async function handleRun() {
  const confirmed = await window.$messageBox
    ?.confirm('备份期间有 IO 开销，建议在低峰期执行。确认立即执行全库备份？', '立即备份', {
      type: 'warning',
      confirmButtonText: '确认备份',
      cancelButtonText: '取消'
    })
    .catch(() => false);

  if (!confirmed) return;

  running.value = true;
  try {
    const { data: result, error } = await fetchRunBackup();

    if (error) return;

    if (result.skipped) {
      window.$message?.warning('已有备份任务在执行');
    } else {
      window.$message?.success(`备份完成：${result.fileName ?? '-'}（${formatSize(result.fileSize)}）`);
    }

    getDataByPage(1);
  } finally {
    running.value = false;
  }
}

async function handleDownload(row: Api.Ops.BackupRow) {
  if (row.status !== 20) {
    window.$message?.warning('仅备份成功的记录可下载');
    return;
  }

  downloadingId.value = row.id;
  try {
    await downloadBackup(row.id);
    window.$message?.success('已开始下载');
  } catch (err) {
    window.$message?.error((err as Error).message || '下载失败');
  } finally {
    downloadingId.value = null;
  }
}
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <ElAlert type="info" :closable="false" show-icon>
      <template #title>备份说明</template>
      <p>
        备份使用 <b>mysqldump + gzip</b> 导出全库，保留最近 <b>30 天</b>，过期文件自动清理。恢复不提供界面操作
        —— 覆盖生产库属高危操作，需人工按运维文档执行：
        <code>gunzip -c &lt;备份文件&gt; | mysql -u&lt;user&gt; -p &lt;database&gt;</code>。
      </p>
    </ElAlert>

    <ElCard class="card-wrapper sm:flex-1-hidden">
      <template #header>
        <div class="flex items-center justify-between">
          <p>数据备份</p>
          <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData">
            <template #default>
              <ElButton
                v-if="hasAuth('config:update')"
                type="primary"
                :loading="running"
                @click="handleRun"
              >
                <template #icon>
                  <icon-ic-round-cloud-upload class="text-icon" />
                </template>
                立即备份
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
    </ElCard>
  </div>
</template>

<style scoped></style>
