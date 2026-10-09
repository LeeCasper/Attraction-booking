<script setup lang="ts">
/**
 * 唯一的页面 —— 应用外壳。
 *
 * ## 为什么是单页
 *
 * 之前是 4 个页面 + 微信 tabBar。但**页面转场必然重建视图层**，切换时一定闪
 * （`reLaunch`、`switchTab`、自定义 tabBar 都躲不开，社区从 2019 年反馈至今，属平台固有问题）。
 * 改成「一个页面 + 四个视图」后，切页只是改一个 ref、CSS 显隐 —— **没有页面转场，就不可能闪**。
 * 顶栏与底栏也只渲染一次，不再随切换重建。
 *
 * ## 布局责任怎么分
 *
 * ```
 * .pg-shell（height: 100vh，纵向 flex）
 *   PageHeader        占位块(状态栏高) + fixed 顶栏
 *   .pg-shell__body   flex:1 —— 每个视图一个 scroll-view，高度 100%
 *   TabBar            占位块(64px+安全区) + fixed 底栏
 * ```
 *
 * 顶部的 64px（设计稿 `<main>` 的 `pt-16`）留在**视图自己**身上，外壳不管；
 * 底部的留白则改由 TabBar 自己占位（视图侧已去掉设计稿的 `pb-24`/`pb-28`，见 gen-pages 的 VIEW_DROP）。
 */
import { reactive, watch } from 'vue';
import PageHeader from '@/components/PageHeader.vue';
import TabBar from '@/components/TabBar.vue';
import HomeView from '@/views/home/index.vue';
import BookingView from '@/views/booking/index.vue';
import CredentialView from '@/views/credential/index.vue';
import ProfileView from '@/views/profile/index.vue';
import { activeTab as tab, type TabKey } from '@/store/shell';

// tab 状态放在模块里（而不是这里的局部 ref）：视图里也需要切页 ——
// 比如购票页下单支付成功后要自动跳到凭证页。外壳只给视图传一个 active prop，加不了别的通道。
const onTabChange = (key: TabKey) => {
  tab.value = key;
};

/**
 * 每个视图**首次访问才挂载**，之后用 `v-show` 保留。
 *
 * - 不一上来全挂载：4 个视图同时渲染会让首屏明显变慢。
 * - 挂载后不销毁：销毁会重置视图内的状态（购票页选好的日期、凭证页的倒计时），
 *   而那正是单页架构要保住的东西。
 * - 顺带解决了「隐藏时量不到宽度」：视图首次挂载时一定可见，
 *   购票页那段 date strip 宽度测量因此拿得到真实值，**行为代码一行都不用改**。
 * - 每个视图各自的 scroll-view 也保证了滚动位置互不干扰。
 */
const visited = reactive<Record<TabKey, boolean>>({
  home: true,
  booking: false,
  credential: false,
  profile: false,
});
watch(tab, (t) => {
  visited[t] = true;
});
</script>

<template>
  <view class="pg-shell">
    <PageHeader />

    <view class="pg-shell__body">
      <scroll-view
        v-if="visited.home"
        v-show="tab === 'home'"
        class="pg-shell__view"
        scroll-y
        :show-scrollbar="false"
      >
        <HomeView :active="tab === 'home'" />
      </scroll-view>

      <scroll-view
        v-if="visited.booking"
        v-show="tab === 'booking'"
        class="pg-shell__view"
        scroll-y
        :show-scrollbar="false"
      >
        <BookingView :active="tab === 'booking'" />
      </scroll-view>

      <scroll-view
        v-if="visited.credential"
        v-show="tab === 'credential'"
        class="pg-shell__view"
        scroll-y
        :show-scrollbar="false"
      >
        <CredentialView :active="tab === 'credential'" />
      </scroll-view>

      <scroll-view
        v-if="visited.profile"
        v-show="tab === 'profile'"
        class="pg-shell__view"
        scroll-y
        :show-scrollbar="false"
      >
        <ProfileView :active="tab === 'profile'" />
      </scroll-view>
    </view>

    <TabBar :active="tab" @change="onTabChange" />
  </view>
</template>

<style lang="scss" scoped>
.pg-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: $c-surface;
}

.pg-shell__body {
  flex: 1;
  // 必须写：flex 子项默认 min-height:auto 不会收缩到底，
  // 滚动容器拿不到确定高度就会整块溢出、滚不动
  min-height: 0;
  position: relative;
}

// 视图各自的滚动容器，高度即正文区高度；隐藏的那个是 display:none，不参与布局
.pg-shell__view {
  height: 100%;
}
</style>
