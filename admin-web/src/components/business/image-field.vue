<script setup lang="ts">
import { computed, ref } from 'vue';
import { fetchUploadImage } from '@/service/api';

/**
 * 「一张图」的表单字段（标题 + 预览 + 上传 + 清除 + 说明）。
 *
 * 抽成组件是因为它要用的地方不止一处：景区的封面与缩略图、首页轮播图的图片、
 * 参数配置里的平台 Logo —— 每处内联就是同一套 ElUpload + 预览 + 校验写一遍，改一处必然漏两处。
 *
 * 落在 `components/business/`：它是**业务组件**（直接调上传接口、存相对路径），
 * 不属于模板自带的 `custom/`，也不止一个业务模块在用。
 *
 * ⚠️ 上传走 `fetchUploadImage`，那里已经**显式把 Content-Type 置空** ——
 * 否则 axios 的 transformRequest 会把 FormData 转成 JSON 字符串发出去，
 * 服务端收不到任何 multipart 字段（见 admin-web/README 与本仓库 CLAUDE.md 第 19 条）。
 */
defineOptions({ name: 'ImageField' });

interface Props {
  /** 表单项标题 */
  label: string;
  /** v-model：上传接口返回的**相对路径**（`/uploads/xxx.jpg`）；空串 = 未设置 */
  modelValue: string;
  /** 字段下方的说明：这张图**用在小程序哪里**、不传会怎样 */
  hint: string;
  /** 画幅提示，默认按横图写 */
  ratioHint?: string;
  /** 预览框的尺寸类（方图那张传小一点） */
  previewClass?: string;
}

const props = withDefaults(defineProps<Props>(), {
  ratioHint: '建议 16:9；5MB 内，支持 jpeg / png / webp',
  previewClass: 'h-60px w-90px'
});

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const uploading = ref(false);

/**
 * 预览地址：库里存的是相对路径（`/uploads/xxx.jpg`），这里拼上管理端的服务端前缀 ——
 * 小程序那边拼的是它自己的前缀，所以**不能存完整 URL**。
 */
const preview = computed(() => (props.modelValue ? `${import.meta.env.VITE_SERVICE_BASE_URL}${props.modelValue}` : ''));

/**
 * **哪张图**加载失败了（记 URL，不是一个布尔量）。
 *
 * 布尔量会「粘住」：图只要在某一瞬间没加载出来（刚上传完、文件还没落稳，或网络抖一下），
 * 标记就一直是 true —— 之后值没变就再也不会重置，用户看到的是**永远的**「图片无法加载」
 * （实测踩过：上传是成功的、文件直接访问也是 200，弹窗里却一直显示加载失败）。
 * 记 URL 天然解决两件事：值一变标记自动失效；同一个值只判定一次。
 *
 * 另外这也是「路径是手填的」的兜底：填错或文件被删时，与其显示浏览器的裂图标记，
 * 不如如实写一句「图片无法加载」。
 */
const failedSrc = ref('');
const previewFailed = computed(() => preview.value !== '' && failedSrc.value === preview.value);

/** 交给 ElUpload 自己发请求：走同一个 request 实例，鉴权/代理/拆包都现成 */
async function handleUpload(options: { file: File }) {
  uploading.value = true;
  try {
    const { data, error } = await fetchUploadImage(options.file);
    if (error) return;
    emit('update:modelValue', data.url);
    window.$message?.success('图片已上传，保存后生效');
  } finally {
    uploading.value = false;
  }
}

/** 本地先拦一道，省得白传一趟；服务端还会再校验 MIME 与大小 */
function beforeUpload(file: File) {
  const okType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  if (!okType) {
    window.$message?.error('只支持 jpeg / png / webp 图片');
    return false;
  }
  if (file.size > 5 * 1024 * 1024) {
    window.$message?.error('图片不能超过 5MB');
    return false;
  }
  return true;
}
</script>

<template>
  <ElFormItem :label="props.label">
    <div class="w-full flex items-center gap-12px">
      <div
        class="flex-center shrink-0 overflow-hidden border border-gray-200 rounded bg-gray-50"
        :class="props.previewClass"
      >
        <img
          v-if="preview && !previewFailed"
          :src="preview"
          class="h-full w-full object-cover"
          :alt="`${props.label}预览`"
          @error="failedSrc = preview"
        />
        <span v-else class="text-12px text-gray-400">{{ previewFailed ? '图片无法加载' : '未设置' }}</span>
      </div>
      <ElUpload
        :show-file-list="false"
        accept="image/jpeg,image/png,image/webp"
        :before-upload="beforeUpload"
        :http-request="handleUpload"
      >
        <ElButton :loading="uploading">{{ props.modelValue ? '更换图片' : '上传图片' }}</ElButton>
      </ElUpload>
      <ElButton v-if="props.modelValue" link type="danger" @click="emit('update:modelValue', '')">清除</ElButton>
    </div>
    <div class="mt-4px text-12px text-gray-400">{{ props.hint }}</div>
    <div class="mt-2px text-12px text-gray-400">{{ props.ratioHint }}</div>
  </ElFormItem>
</template>
