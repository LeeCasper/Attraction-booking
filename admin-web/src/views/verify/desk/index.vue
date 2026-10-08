<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import type { InputInstance } from 'element-plus';
import { fetchVerify } from '@/service/api';
import { useAuth } from '@/hooks/business/auth';
import { verifyCodeRecord } from '@/constants/business';

const { hasAuth } = useAuth();

/** 核销权限：对应服务端 @Permissions('verify:execute')；超管权限为 ['*']，等价于拥有全部权限 */
const canVerify = computed(() => hasAuth('verify:execute') || hasAuth('*'));

/** 扫码 / 手动 两个入口 */
const activeTab = ref('scan');
/** 1 入园 / 2 出园 */
const direction = ref(1);

const credential = ref('');
const orderNo = ref('');
const idCardSuffix = ref('');

const loading = ref(false);
/** 最近一次核销结果，未核销时为 null */
const outcome = ref<Api.Verify.VerifyOutcome | null>(null);

/** 本次会话统计：刷新页面即清零，不做持久化 */
const successCount = ref(0);
const failCount = ref(0);

const scanInputRef = ref<InputInstance>();
const orderInputRef = ref<InputInstance>();

/** 结果码 → 中文；未知码回退服务端 message */
function resultText(code: Api.Verify.Code) {
  return verifyCodeRecord[code] ?? code;
}

/** 重复核销需单独警示 */
const isDuplicate = computed(() => outcome.value?.code === 'ALREADY_VERIFIED');

/** 核销后重新聚焦输入框：扫码枪为键盘输入，必须保证焦点在输入框内 */
function focusInput() {
  nextTick(() => {
    if (activeTab.value === 'scan') {
      scanInputRef.value?.focus();
    } else {
      orderInputRef.value?.focus();
    }
  });
}

async function handleVerify() {
  if (loading.value) return;

  const payload: Api.Verify.VerifyPayload = { direction: direction.value };

  if (activeTab.value === 'scan') {
    const value = credential.value.trim();

    if (!value) {
      window.$message?.warning('请扫描游客二维码或输入凭证');
      focusInput();
      return;
    }

    payload.credential = value;
  } else {
    const no = orderNo.value.trim();
    const suffix = idCardSuffix.value.trim();

    if (!no) {
      window.$message?.warning('请输入订单号');
      focusInput();
      return;
    }

    if (!suffix) {
      window.$message?.warning('请输入证件后四位');
      focusInput();
      return;
    }

    payload.orderNo = no;
    payload.idCardSuffix = suffix;
  }

  loading.value = true;

  try {
    const { data, error } = await fetchVerify(payload);

    // 请求层已统一提示错误
    if (error) return;

    outcome.value = data;

    if (data.ok) {
      successCount.value += 1;
    } else {
      failCount.value += 1;
    }
  } finally {
    loading.value = false;
    // 扫码枪连扫场景：清空上一次凭证并回到输入框，等待下一张票
    credential.value = '';
    focusInput();
  }
}

onMounted(focusInput);
</script>

<template>
  <div class="min-h-500px flex-col-stretch gap-16px overflow-hidden lt-sm:overflow-auto">
    <ElAlert
      v-if="!canVerify"
      type="error"
      :closable="false"
      show-icon
      title="无核销权限"
      description="当前账号缺少 verify:execute 权限，无法使用核销台，请联系系统管理员分配后再试。"
    />

    <template v-else>
      <ElAlert type="info" :closable="false" show-icon>
        <template #title>
          游客凭证为动态二维码，有效期 60 秒；如提示「凭证已过期」，请引导游客在小程序内下拉刷新后重新出示。
        </template>
      </ElAlert>

      <div class="grid grid-cols-1 gap-16px lg:grid-cols-3">
        <ElCard class="card-wrapper lg:col-span-2">
          <template #header>
            <div class="flex items-center justify-between">
              <p>核销操作</p>
              <ElRadioGroup v-model="direction">
                <ElRadioButton :value="1">入园</ElRadioButton>
                <ElRadioButton :value="2">出园</ElRadioButton>
              </ElRadioGroup>
            </div>
          </template>

          <ElTabs v-model="activeTab">
            <ElTabPane label="扫码核销" name="scan">
              <div class="flex flex-col gap-12px">
                <ElInput
                  ref="scanInputRef"
                  v-model="credential"
                  size="large"
                  clearable
                  :disabled="loading"
                  placeholder="请扫描游客二维码 / 输入凭证"
                  @keyup.enter="handleVerify"
                >
                  <template #prepend>
                    <icon-ic-round-qr-code-scanner class="text-icon" />
                  </template>
                </ElInput>
                <ElButton type="primary" size="large" :loading="loading" @click="handleVerify">核销</ElButton>
                <ElText type="info">
                  扫码枪扫描后自动回车触发核销；也可手动粘贴凭证后点击「核销」。
                </ElText>
              </div>
            </ElTabPane>

            <ElTabPane label="手动核销" name="manual">
              <div class="flex flex-col gap-12px">
                <ElForm label-position="top">
                  <ElFormItem label="订单号">
                    <ElInput
                      ref="orderInputRef"
                      v-model="orderNo"
                      size="large"
                      clearable
                      :disabled="loading"
                      placeholder="请输入订单号，如 AB202610080001"
                      @keyup.enter="handleVerify"
                    />
                  </ElFormItem>
                  <ElFormItem label="证件后四位">
                    <ElInput
                      v-model="idCardSuffix"
                      size="large"
                      clearable
                      maxlength="8"
                      :disabled="loading"
                      placeholder="请输入游客证件后四位"
                      @keyup.enter="handleVerify"
                    />
                  </ElFormItem>
                </ElForm>
                <ElButton type="primary" size="large" :loading="loading" @click="handleVerify">核销</ElButton>
                <ElText type="info">
                  用于游客无法出示二维码时，凭订单号 + 证件后四位人工核验，一人一票只能核销一次。
                </ElText>
              </div>
            </ElTabPane>
          </ElTabs>
        </ElCard>

        <ElCard class="card-wrapper">
          <template #header>
            <p>本次会话统计</p>
          </template>
          <div class="flex-col gap-16px">
            <div class="session-stat">
              <span class="session-stat__value text-success">{{ successCount }}</span>
              <span class="session-stat__label">已核销（笔）</span>
            </div>
            <ElDivider class="!my-0" />
            <div class="session-stat">
              <span class="session-stat__value text-danger">{{ failCount }}</span>
              <span class="session-stat__label">核销失败（次）</span>
            </div>
            <ElText type="info" class="mt-8px">统计自本次登录打开页面起算，刷新后清零。</ElText>
          </div>
        </ElCard>
      </div>

      <ElCard v-if="!outcome" class="card-wrapper">
        <ElEmpty description="等待扫码… 核销结果将在此醒目展示" />
      </ElCard>

      <ElCard v-else class="card-wrapper" :body-style="{ padding: '0' }">
        <div :class="['verify-result', outcome.ok ? 'verify-result--ok' : 'verify-result--fail']">
          <div class="verify-result__head">
            <span class="verify-result__mark">{{ outcome.ok ? '✓' : '✕' }}</span>
            <div class="flex-col gap-4px">
              <p class="verify-result__title">{{ outcome.ok ? '✓ 核销成功，请通行' : resultText(outcome.code) }}</p>
              <p class="verify-result__sub">{{ outcome.message }}</p>
            </div>
          </div>

          <ElAlert
            v-if="isDuplicate"
            type="warning"
            :closable="false"
            show-icon
            class="mt-16px"
            title="该票已核销，请注意防范重复使用"
            description="如游客主张尚未入园，请核对其订单信息并引导至人工通道处理。"
          />

          <div v-if="outcome.ok" class="verify-result__grid">
            <div class="verify-result__item">
              <span class="verify-result__label">游客姓名</span>
              <span class="verify-result__value">{{ outcome.visitorName || '—' }}</span>
            </div>
            <div class="verify-result__item">
              <span class="verify-result__label">订单号</span>
              <span class="verify-result__value">{{ outcome.orderNo || '—' }}</span>
            </div>
            <div class="verify-result__item">
              <span class="verify-result__label">剩余可入园人数</span>
              <span class="verify-result__value">{{ outcome.remaining ?? '—' }}</span>
            </div>
            <div class="verify-result__item">
              <span class="verify-result__label">开闸指令号</span>
              <span class="verify-result__value">{{ outcome.cmdId || '—' }}</span>
            </div>
          </div>
        </div>
      </ElCard>
    </template>
  </div>
</template>

<style scoped>
.session-stat {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.session-stat__value {
  font-size: 44px;
  font-weight: 700;
  line-height: 1.1;
}

.session-stat__label {
  font-size: 15px;
  color: var(--el-text-color-regular);
}

.verify-result {
  padding: 32px 40px;
  border-left: 10px solid transparent;
}

.verify-result--ok {
  background-color: var(--el-color-success-light-9);
  border-left-color: var(--el-color-success);
}

.verify-result--fail {
  background-color: var(--el-color-danger-light-9);
  border-left-color: var(--el-color-danger);
}

.verify-result__head {
  display: flex;
  align-items: center;
  gap: 24px;
}

.verify-result__mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  color: #fff;
  font-size: 60px;
  line-height: 1;
  flex-shrink: 0;
}

.verify-result--ok .verify-result__mark {
  background-color: var(--el-color-success);
}

.verify-result--fail .verify-result__mark {
  background-color: var(--el-color-danger);
}

.verify-result__title {
  font-size: 40px;
  font-weight: 700;
  line-height: 1.2;
}

.verify-result--ok .verify-result__title {
  color: var(--el-color-success-dark-2);
}

.verify-result--fail .verify-result__title {
  color: var(--el-color-danger-dark-2);
}

.verify-result__sub {
  font-size: 18px;
  color: var(--el-text-color-regular);
}

.verify-result__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 32px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px dashed var(--el-border-color);
}

.verify-result__item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.verify-result__label {
  font-size: 15px;
  color: var(--el-text-color-secondary);
}

.verify-result__value {
  font-size: 26px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  word-break: break-all;
}
</style>
