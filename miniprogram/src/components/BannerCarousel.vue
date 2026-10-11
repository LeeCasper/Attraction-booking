<script setup lang="ts">
/**
 * 首页 banner：**景点轮播图**（自动轮播切换）。
 *
 * 设计稿的 banner 是按**单景区**画的 —— 一张封面 + 写死的景点名。
 * 而本站管多个景点（一进小程序就只有一个景点的图，用户根本不知道还有别的），
 * 所以这里换成轮播：每一屏是一个景点，自动切换，屏上的景点名/在园率/指示点
 * 都跟着**那一屏自己的数据**走。
 *
 * class 逐字取自 `design/reference/home.html` 的 banner（`#homeBanner`）：
 *   banner 容器 `relative w-full h-56 overflow-hidden bg-surface-container`
 *   文字层 = 背景图容器上那层 `bg-gradient-to-t … flex flex-col justify-end p-4 pb-4`
 * 生成器把 `#homeBanner` 整块 replace 成这个组件（见 `page-bindings.mjs` 的 `home` 节），
 * 所以容器类必须落在组件根节点上 —— 自定义组件会多一层节点。
 *
 * 三处与设计稿的差异，都是「设计稿没有、但轮播必须有」的：
 *   ① `<swiper>`：设计稿是一张静态背景图。小程序里轮播只有 `<swiper>` 靠得住
 *      （自己写手势/位移动画会与页面滚动打架），H5 端 uni-app 也实现了它，两端同一份代码
 *   ② 指示点：设计稿没有。**每一屏各自渲染一份**（其中当前那一屏的点是高亮的）——
 *      看着与一个静态指示器一样，但不用把点放到 swiper 外面去算绝对定位，
 *      也不会盖住景点名（名字长了会撞）
 *   ③ 封面按 `areaCoverOf()` 兜底：后台上传过封面就用上传的，没传的按序号轮换示意图
 *
 * ⚠️ 天气（晴 21°C）是设计稿的**写死文案**，后端没有天气数据 —— 每一屏都渲染同一句，
 *    所以看起来是静止的。见 README 的「仍是静态」清单。
 */
import type { BannerSlide } from '@/views/home/behavior';

const props = defineProps<{ slides: BannerSlide[] }>();
const emit = defineEmits<{ pick: [id: number] }>();

// —— 以下 class 串与设计稿逐字对应（已消毒），勿手改措辞 ——
const WRAP = 'relative w-full h-56 overflow-hidden bg-surface-container';
const SWIPER = 'w-full h-full';
const SLIDE = 'relative w-full h-full';
const OVERLAY = 'absolute inset-0 flex flex-col justify-end p-4 pb-4';
const GRADIENT =
  'absolute inset-0 bg-gradient-to-t from-screen-xuanqing-bg_85 via-screen-xuanqing-bg_35 to-transparent';
const STACK = 'flex flex-col gap-2_5';
const ROW = 'flex items-center justify-between';
const STATUS_PILL =
  'inline-flex items-center gap-1_5 px-2_5 py-1 rounded-full bg-black_40 backdrop-blur-md border border-white_20 text-white_90 shadow-sm';
const DOT_LIVE = 'w-2 h-2 rounded-full bg-screen-neon-jade animate-pulse';
const STATUS_TEXT = 'font-caption-sm text-11px font-medium tracking-wide';
const SEP = 'text-white_40 font-mono text-10px';
const PRESENCE = 'text-11px font-label-badge text-bamboo-light-100';
const WEATHER =
  'inline-flex items-center gap-1 text-11px text-white_90 bg-white_15 backdrop-blur-md px-2 py-0_5 rounded border border-white_15';
/** 顶部那排「在园率 / 天气」下的一行：副标题 + 景点名 + 指示点 */
const BOTTOM_ROW = 'flex items-end justify-between gap-3';
const SUBTITLE =
  'font-caption-sm text-11px text-bamboo-light-100_90 tracking-widest block font-medium mb-0_5';
const TITLE = 'font-headline-xl text-24px font-bold text-white tracking-wider drop-shadow-md truncate';
/** 指示点：高亮用实心白，未高亮用 20% 白（设计稿里 `bg-white/20` 就是那个时代胶囊的底色） */
const DOTS = 'flex items-center gap-1_5 pb-2 shrink-0';
const DOT_ON = 'w-1_5 h-1_5 rounded-full bg-white';
const DOT_OFF = 'w-1_5 h-1_5 rounded-full bg-white_20';
</script>

<template>
  <view :class="WRAP">
    <!-- slides 为空时不渲染 swiper（加载中/没有开放景点）—— 只留容器底色，不留半张图 -->
    <swiper
      v-if="props.slides.length"
      :class="SWIPER"
      :autoplay="props.slides.length > 1"
      :circular="props.slides.length > 1"
      :interval="4200"
      :duration="450"
    >
      <swiper-item v-for="(s, i) in props.slides" :key="s.id">
        <!-- 整屏可点：这一屏写着是哪个景点，点它就是「我要这个景点」→ 进它的购票页 -->
        <view :class="SLIDE" @tap="emit('pick', s.id)">
          <image class="w-full h-full object-cover" :src="s.cover" mode="aspectFill" />
          <view :class="GRADIENT" />
          <view :class="OVERLAY">
            <view :class="STACK">
              <view :class="ROW">
                <view :class="STATUS_PILL">
                  <text :class="DOT_LIVE" />
                  <text :class="STATUS_TEXT">{{ s.statusLabel }}</text>
                  <text :class="SEP">|</text>
                  <text :class="PRESENCE">{{ s.presenceLabel }}</text>
                </view>
                <view :class="WEATHER">
                  <view class="msi icon-wb_sunny text-13px text-screen-gilt-gold" />
                  <text>晴 21°C</text>
                </view>
              </view>
              <view :class="BOTTOM_ROW">
                <view class="min-w-0">
                  <text :class="SUBTITLE">国家生态自然公园 · 5A级风景名胜区</text>
                  <view :class="TITLE">{{ s.name }}</view>
                </view>
                <!-- 指示点：每个景点一个，当前这屏的那个高亮 -->
                <view v-if="props.slides.length > 1" :class="DOTS">
                  <text v-for="(x, j) in props.slides" :key="x.id" :class="j === i ? DOT_ON : DOT_OFF" />
                </view>
              </view>
            </view>
          </view>
        </view>
      </swiper-item>
    </swiper>
  </view>
</template>
