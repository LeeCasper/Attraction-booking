<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fetchCreateGate, fetchGetTicketTypes, fetchGetTimeSlots, fetchUpdateGate } from '@/service/api';
import { useForm, useFormRules } from '@/hooks/common/form';

/**
 * 闸机的新增 / 编辑。
 *
 * 几个**必须照后端口径**的地方：
 * - `gateNo` **全局唯一**（它是闸机的身份，走 `X-Gate-No` 头，HMAC 签名里没有景区）。
 *   重名后端回 409 并把话说清楚，这里不自己判重。
 * - **状态只有 启用(1) / 禁用(3)**：2 离线、4 故障是心跳巡检的运行时状态，后端不接受直接写
 *   （提交 2 会被 400）。新闸机一建出来是**离线**（它还没心跳过），所以新增时不给这个字段。
 * - **密钥**：新增时留空由服务端生成，**只在这一次的返回里给**（列表接口不下发）、
 *   操作日志里也不记 —— 所以拿到后要当场抄到设备配置里。
 */
defineOptions({ name: 'GateOperateDrawer' });

interface Props {
  /** 操作类型 */
  operateType: UI.TableOperateType;
  /** 编辑时的行数据 */
  rowData?: Api.Gate.Device | null;
  /** 景区下拉（由父页面传入，避免重复请求） */
  areas: Api.Scenic.Area[];
}

const props = defineProps<Props>();

interface Emits {
  (e: 'submitted'): void;
}

const emit = defineEmits<Emits>();

const visible = defineModel<boolean>('visible', { default: false });

const { formRef, validate, restoreValidation } = useForm();
const { defaultRequiredRule } = useFormRules();

const title = computed(() => (props.operateType === 'add' ? '新增闸机' : '编辑闸机'));
const isEdit = computed(() => props.operateType === 'edit');
const submitting = ref(false);

interface Model {
  /** 所属景区 —— 闸机只能核验本景区的单，绑错了会一直回 GATE_NO_PERMISSION */
  scenicAreaId: number | null;
  gateNo: string;
  name: string;
  /** 1 入 / 2 出 / 3 双向 */
  direction: number;
  location: string;
  ip: string;
  /** 1 启用 / 3 禁用（仅编辑时提交） */
  status: number;
  secretKey: string;
  /** 通行规则（A-044）：空数组 = 不限 */
  allowedSlotIds: number[];
  allowedTicketTypeIds: number[];
}

function createDefaultModel(): Model {
  return {
    scenicAreaId: null,
    gateNo: '',
    name: '',
    direction: 1,
    location: '',
    ip: '',
    status: 1,
    secretKey: '',
    // 空 = 不限。**别用 undefined**：多选组件要的是数组，且后端把空数组当作「清空规则」
    allowedSlotIds: [],
    allowedTicketTypeIds: []
  };
}

const model = ref(createDefaultModel());

// 每个字段都可以挂多条规则（与 `hooks/common/form.ts` 里 `Record<string, App.Global.FormRule[]>` 一致）
const rules: Record<'scenicAreaId' | 'gateNo', App.Global.FormRule[]> = {
  scenicAreaId: [defaultRequiredRule],
  gateNo: [defaultRequiredRule, { min: 2, max: 32, message: '长度 2~32 个字符', trigger: ['input', 'blur'] }]
};

/** 通行规则的候选项 —— 跟着表单里选的**景区**走（跨景区的时段/票种后端会 400） */
const slotOptions = ref<Api.Ticket.TimeSlot[]>([]);
const typeOptions = ref<Api.Ticket.TicketType[]>([]);
const rulesLoading = ref(false);

async function loadRuleOptions(areaId: number | null) {
  slotOptions.value = [];
  typeOptions.value = [];

  if (!areaId) return;

  rulesLoading.value = true;

  try {
    const [slots, types] = await Promise.all([
      fetchGetTimeSlots(areaId),
      // 已下架的票种不列出来（下架票种不会再卖，配进规则只会让人困惑）
      fetchGetTicketTypes({ areaId, all: false })
    ]);

    if (slots.data) slotOptions.value = slots.data;
    if (types.data) typeOptions.value = types.data;
  } finally {
    rulesLoading.value = false;
  }
}

/**
 * 换景区 ⇒ 原来选的时段/票种全都作废（它们属于旧景区，留着后端会 400，
 * 也等于把所有人都拦下）。所以清空重选，并立刻按新景区加载候选项。
 */
watch(
  () => model.value.scenicAreaId,
  (areaId, oldAreaId) => {
    if (areaId === oldAreaId) return;

    model.value.allowedSlotIds = [];
    model.value.allowedTicketTypeIds = [];
    loadRuleOptions(areaId);
  }
);

function handleInitModel() {
  model.value = createDefaultModel();

  if (props.operateType !== 'edit' || !props.rowData) {
    // 新增：默认绑到当前筛选的景区（大多数情况就是它）
    if (props.areas.length > 0) model.value.scenicAreaId = props.areas[0].id;
    loadRuleOptions(model.value.scenicAreaId);
    return;
  }

  const { scenicAreaId, gateNo, name, direction, location, ip, status, allowedSlotIds, allowedTicketTypeIds } =
    props.rowData;

  Object.assign(model.value, {
    scenicAreaId,
    gateNo,
    name,
    direction,
    location: location ?? '',
    ip: ip ?? '',
    // 离线(2)/故障(4) 是运行时状态，表单里归到「启用」——后端会按最近心跳决定落 1 还是 2
    status: status === 3 ? 3 : 1,
    secretKey: '',
    allowedSlotIds: allowedSlotIds ?? [],
    allowedTicketTypeIds: allowedTicketTypeIds ?? []
  });

  loadRuleOptions(scenicAreaId);
}

function closeDrawer() {
  visible.value = false;
}

async function handleSubmit() {
  // 与其它抽屉一致：validate() 校验不过会 reject（Element Plus 的行为），
  // 这里不接住 —— `hooks/common/form.ts` 的 validate 把结果丢掉了，只留了 throw 这一条路
  await validate();

  submitting.value = true;

  try {
    if (isEdit.value && props.rowData) {
      const payload: Api.Gate.GateUpdatePayload = {
        scenicAreaId: model.value.scenicAreaId ?? undefined,
        name: model.value.name || undefined,
        direction: model.value.direction,
        location: model.value.location,
        ip: model.value.ip,
        status: model.value.status,
        // 显式传（空数组 = 恢复「不限」）—— 不传就是"不改动"，那是另一种语义
        allowedSlotIds: model.value.allowedSlotIds,
        allowedTicketTypeIds: model.value.allowedTicketTypeIds
      };

      if (model.value.secretKey) payload.secretKey = model.value.secretKey;

      const { error } = await fetchUpdateGate(props.rowData.id, payload);

      if (error) return;

      window.$message?.success('修改成功');
    } else {
      const payload: Api.Gate.GateCreatePayload = {
        scenicAreaId: model.value.scenicAreaId!,
        gateNo: model.value.gateNo,
        name: model.value.name || undefined,
        direction: model.value.direction,
        location: model.value.location,
        ip: model.value.ip,
        allowedSlotIds: model.value.allowedSlotIds,
        allowedTicketTypeIds: model.value.allowedTicketTypeIds
      };

      if (model.value.secretKey) payload.secretKey = model.value.secretKey;

      const { data, error } = await fetchCreateGate(payload);

      if (error) return;

      closeDrawer();
      emit('submitted');

      // 密钥只在这里出现一次 —— 不用 $message（会几秒后自己消失）
      if (!payload.secretKey && data?.secretKey) {
        await window.$messageBox?.alert(
          `闸机编号：${data.gateNo}\n签名密钥：${data.secretKey}\n\n请立即抄进闸机配置，界面不会再显示第二次。`,
          '密钥（只显示这一次）',
          { confirmButtonText: '我已抄好', type: 'success' }
        );
      } else {
        window.$message?.success('新增成功');
      }

      return;
    }

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
  <ElDrawer v-model="visible" :title="title" :size="460">
    <ElForm ref="formRef" :model="model" :rules="rules" label-position="top">
      <ElFormItem label="所属景区" prop="scenicAreaId">
        <ElSelect v-model="model.scenicAreaId" placeholder="请选择景区" class="w-full">
          <ElOption v-for="item in areas" :key="item.id" :label="item.name" :value="item.id" />
        </ElSelect>
      </ElFormItem>

      <ElFormItem label="闸机编号" prop="gateNo">
        <ElInput v-model="model.gateNo" :disabled="isEdit" placeholder="如 A-北门；全局唯一，多景区请用前缀区分" />
      </ElFormItem>

      <ElFormItem label="名称">
        <ElInput v-model="model.name" placeholder="留空则用闸机编号" />
      </ElFormItem>

      <ElFormItem label="通行方向">
        <ElRadioGroup v-model="model.direction">
          <ElRadio :value="1">入园</ElRadio>
          <ElRadio :value="2">出园</ElRadio>
          <ElRadio :value="3">双向</ElRadio>
        </ElRadioGroup>
      </ElFormItem>

      <ElFormItem label="安装位置">
        <ElInput v-model="model.location" placeholder="如 游客中心北侧 A 通道" />
      </ElFormItem>

      <ElFormItem label="IP 地址">
        <ElInput v-model="model.ip" placeholder="如 192.168.1.20" />
      </ElFormItem>

      <ElFormItem v-if="isEdit" label="状态">
        <ElRadioGroup v-model="model.status">
          <ElRadio :value="1">启用</ElRadio>
          <ElRadio :value="3">禁用</ElRadio>
        </ElRadioGroup>
        <div class="mt-1 text-12px text-gray-400">在线 / 离线 / 故障由心跳自动维护，这里只管「让不让它用」</div>
      </ElFormItem>

      <ElFormItem label="通行规则：允许的时段">
        <ElSelect
          v-model="model.allowedSlotIds"
          multiple
          collapse-tags
          collapse-tags-tooltip
          clearable
          :loading="rulesLoading"
          placeholder="不选 = 全部时段都放行"
          class="w-full"
        >
          <ElOption v-for="item in slotOptions" :key="item.id" :label="item.name" :value="item.id" />
        </ElSelect>
        <div class="mt-1 text-12px text-gray-400">
          PRD A-044：配了之后，本闸机只放行这些时段（游客的预约时段不在其中会被拒，提示走其他通道）
        </div>
      </ElFormItem>

      <ElFormItem label="通行规则：允许的票种">
        <ElSelect
          v-model="model.allowedTicketTypeIds"
          multiple
          collapse-tags
          collapse-tags-tooltip
          clearable
          :loading="rulesLoading"
          placeholder="不选 = 全部票种都放行"
          class="w-full"
        >
          <ElOption v-for="item in typeOptions" :key="item.id" :label="item.name" :value="item.id" />
        </ElSelect>
        <div class="mt-1 text-12px text-gray-400">两个维度都留空 = 不限（与本闸机「没配规则」等价）</div>
      </ElFormItem>

      <ElFormItem :label="isEdit ? '重置签名密钥' : '签名密钥'">
        <ElInput v-model="model.secretKey" placeholder="留空则自动生成（长度 ≥ 8）" show-password />
        <div class="mt-1 text-12px text-gray-400">
          {{
            isEdit
              ? '留空不改动；改了之后设备侧要同步改，否则签名校验全部失败'
              : '自动生成的密钥只在提交后的弹窗里显示一次，请立即抄进设备配置'
          }}
        </div>
      </ElFormItem>
    </ElForm>

    <template #footer>
      <ElSpace>
        <ElButton @click="closeDrawer">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="handleSubmit">确认</ElButton>
      </ElSpace>
    </template>
  </ElDrawer>
</template>
