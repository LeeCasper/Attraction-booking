<script setup lang="tsx">
import { onMounted, ref } from 'vue';
import { fetchGateCommand, fetchGetGates, fetchGetScenicAreas } from '@/service/api';
import { useUIPaginatedTable } from '@/hooks/common/table';
import { backendArrayTransform } from '@/utils/backend';
import { useAuth } from '@/hooks/business/auth';
import { gateDirectionRecord } from '@/constants/business';
import GateLogDrawer from './modules/gate-log-drawer.vue';

const { hasAuth } = useAuth();

const areas = ref<Api.Scenic.Area[]>([]);
const searchParams = ref<{ areaId: number | null }>({ areaId: null });

/** 远程控制类型 → 中文名称与二次确认文案 */
const commandMap: Record<Api.Gate.CommandType, { label: string; tip: string }> = {
  open: {
    label: '单次开闸',
    tip: '将立即执行一次开闸，请确认闸机通道内无人员滞留或正在通行，避免夹伤。'
  },
  hold_open: {
    label: '常开',
    tip: '常开将使闸机保持开启，请确认现场安全。'
  },
  close: {
    label: '常闭',
    tip: '常闭将使闸机保持关闭，所有通行请求都会被拒绝，确认继续？'
  },
  reboot: {
    label: '重启',
    tip: '重启将导致闸机短暂离线（约 30 秒），期间无法核验通行，确认继续？'
  }
};

/** 通信日志抽屉 */
const logDrawerVisible = ref(false);
const logGate = ref<Api.Gate.Device | null>(null);

function openLogDrawer(row: Api.Gate.Device) {
  logGate.value = row;
  logDrawerVisible.value = true;
}

/** 最后心跳：90 秒内展示「N 秒前」，超过则视为离线 */
function formatHeartbeat(row: Api.Gate.Device) {
  const seconds = row.heartbeatAgoSeconds;

  if (seconds === null || seconds === undefined) return '-';

  if (seconds > 90) return '离线';

  return `${seconds} 秒前`;
}

async function handleCommand(row: Api.Gate.Device, type: Api.Gate.CommandType) {
  const { label, tip } = commandMap[type];

  const confirmed = await window.$messageBox
    ?.confirm(tip, `远程控制：${label}`, {
      type: 'warning',
      confirmButtonText: '确认下发',
      cancelButtonText: '取消'
    })
    .catch(() => false);

  if (!confirmed) return;

  const { data, error } = await fetchGateCommand(row.id, type);

  if (error) return;

  window.$message?.success(`${label}指令已下发，指令号 ${data.commandNo}`);
}

const { columns, columnChecks, data, loading, getData } = useUIPaginatedTable({
  api: () => fetchGetGates(searchParams.value.areaId ?? undefined),
  transform: response => backendArrayTransform(response),
  columns: () => [
    { prop: 'gateNo', label: '闸机编号', width: 130 },
    { prop: 'name', label: '名称', minWidth: 120 },
    {
      prop: 'location',
      label: '位置',
      minWidth: 140,
      formatter: row => <span>{row.location || '-'}</span>
    },
    {
      prop: 'ip',
      label: 'IP',
      width: 140,
      formatter: row => <span>{row.ip || '-'}</span>
    },
    {
      prop: 'protocol',
      label: '协议',
      width: 110,
      formatter: row => <ElTag type="info">{row.protocol}</ElTag>
    },
    {
      prop: 'direction',
      label: '方向',
      width: 90,
      formatter: row => <span>{gateDirectionRecord[row.direction] ?? '-'}</span>
    },
    {
      prop: 'online',
      label: '在线状态',
      width: 100,
      formatter: row => (
        <ElTag type={row.online ? 'success' : 'danger'}>{row.online ? '在线' : '离线'}</ElTag>
      )
    },
    {
      prop: 'heartbeat',
      label: '最后心跳',
      width: 120,
      formatter: row => <span>{formatHeartbeat(row)}</span>
    },
    {
      prop: 'firmwareVersion',
      label: '固件版本',
      width: 110,
      formatter: row => <span>{row.firmwareVersion || '-'}</span>
    },
    {
      prop: 'operate',
      label: '操作',
      width: 200,
      fixed: 'right',
      formatter: row => (
        <div class="flex-center gap-8px">
          {hasAuth('gate:control') ? (
            <ElDropdown
              onCommand={(command: Api.Gate.CommandType) => handleCommand(row, command)}
            >
              {{
                default: () => (
                  <ElButton type="primary" plain size="small">
                    远程控制
                  </ElButton>
                ),
                dropdown: () => (
                  <ElDropdownMenu>
                    <ElDropdownItem command="open">单次开闸</ElDropdownItem>
                    <ElDropdownItem command="hold_open">常开</ElDropdownItem>
                    <ElDropdownItem command="close">常闭</ElDropdownItem>
                    <ElDropdownItem command="reboot" divided>
                      重启
                    </ElDropdownItem>
                  </ElDropdownMenu>
                )
              }}
            </ElDropdown>
          ) : null}
          <ElButton type="info" plain size="small" onClick={() => openLogDrawer(row)}>
            通信日志
          </ElButton>
        </div>
      )
    }
  ]
});

/** 离线设备整行标红，便于一眼识别 */
function rowClassName({ row }: { row: Api.Gate.Device }) {
  return row.online ? '' : 'gate-row-offline';
}

function handleAreaChange() {
  getData();
}

onMounted(async () => {
  const { data: areaList, error } = await fetchGetScenicAreas();

  if (error) return;

  areas.value = areaList;

  if (areaList.length > 0) {
    // 一期单景区：默认选中第一个；多景区时用户在下拉中切换
    searchParams.value.areaId = areaList[0].id;
    getData();
  }
});
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <ElAlert type="info" :closable="false" show-icon>
      <template #title>闸机离线判定与告警</template>
      <p>闸机超过 90 秒未上报心跳，服务端会将其标记为离线并产生一条「闸机离线」告警。</p>
    </ElAlert>

    <ElCard class="card-wrapper" :body-style="{ paddingBottom: '0' }">
      <ElForm label-position="left" :label-width="80" inline>
        <ElFormItem label="景区">
          <ElSelect
            v-model="searchParams.areaId"
            placeholder="请选择景区"
            class="w-200px"
            @change="handleAreaChange"
          >
            <ElOption v-for="item in areas" :key="item.id" :label="item.name" :value="item.id" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" @click="handleAreaChange">刷新</ElButton>
        </ElFormItem>
      </ElForm>
    </ElCard>

    <ElCard class="card-wrapper sm:flex-1-hidden">
      <template #header>
        <div class="flex items-center justify-between">
          <p>闸机设备</p>
          <TableHeaderOperation v-model:columns="columnChecks" :loading="loading" @refresh="getData">
            <template #default>
              <ElText type="info">离线设备整行标红，请及时排查</ElText>
            </template>
          </TableHeaderOperation>
        </div>
      </template>
      <ElTable
        v-loading="loading"
        border
        class="sm:h-full"
        :data="data"
        row-key="id"
        :row-class-name="rowClassName"
      >
        <ElTableColumn v-for="col in columns" :key="col.prop" v-bind="col" />
      </ElTable>
    </ElCard>

    <GateLogDrawer v-model:visible="logDrawerVisible" :gate="logGate" />
  </div>
</template>

<style scoped>
:deep(.gate-row-offline) td.el-table__cell {
  background-color: #fef0f0;
}
</style>
