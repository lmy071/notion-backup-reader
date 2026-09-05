<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref, watchEffect } from 'vue'
import { RouterView } from 'vue-router'
import CatMargins from '@/components/common/CatMargins.vue'
import { createCatStickerSession } from '@/data/catPoses'
const stickerPoses = createCatStickerSession()
import ImageViewer from '@/components/ImageViewer.tsx'
import { useImageViewer } from '@/composables/useImageViewer'
const { visible, src, close } = useImageViewer()
const motionEnabled = ref(true)
const systemReducedMotion = ref(false)
provide(
  'catMotionEnabled',
  computed(() => motionEnabled.value && !systemReducedMotion.value),
)
try {
  motionEnabled.value = localStorage.getItem('notebook-motion') !== 'off'
} catch {
  /* Preferences remain usable when browser storage is unavailable. */
}
const media = window.matchMedia('(prefers-reduced-motion: reduce)')
const syncSystemMotion = () => {
  systemReducedMotion.value = media.matches
}
syncSystemMotion()
onMounted(() => media.addEventListener('change', syncSystemMotion))
onUnmounted(() => media.removeEventListener('change', syncSystemMotion))
watchEffect(() => {
  document.documentElement.dataset.motion =
    motionEnabled.value && !systemReducedMotion.value ? 'on' : 'off'
})
function toggleMotion() {
  motionEnabled.value = !motionEnabled.value
  try {
    localStorage.setItem('notebook-motion', motionEnabled.value ? 'on' : 'off')
  } catch {
    /* Optional persistence. */
  }
}
const navigation = [
  { to: '/', label: '首页', mark: '01' },
  { to: '/sync', label: '同步', mark: '02' },
  { to: '/config', label: '配置', mark: '03' },
  { to: '/test', label: '测试', mark: '04' },
]
</script>
<template>
  <ImageViewer v-if="visible" :src="src" @close="close" />
  <div class="app-shell">
    <a class="skip-link" href="#main-content">跳转到内容</a>
    <header class="app-header">
      <router-link to="/" class="app-brand" aria-label="Notion Backup Reader 首页">
        <span class="brand-stamp" aria-hidden="true">N</span>
        <span class="brand-copy">Notion Backup Reader</span>
      </router-link>
      <nav class="app-navigation" aria-label="主导航">
        <router-link
          v-for="item in navigation"
          :key="item.to"
          :to="item.to"
          class="nav-tab"
          exact-active-class="nav-tab-active"
        >
          <span class="nav-number" aria-hidden="true">{{ item.mark }}</span
          >{{ item.label }}
        </router-link>
      </nav>
    </header>
    <div class="app-workspace">
      <CatMargins side="left" :poses="stickerPoses.slice(0, 3)" />
      <main id="main-content" class="app-main" tabindex="-1">
        <RouterView v-slot="{ Component }">
          <Transition name="page-turn" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>
      <CatMargins side="right" :poses="stickerPoses.slice(3, 6)" />
    </div>
    <footer class="app-footer">
      <span class="footer-note">NOTION / BACKUP READER</span>
      <!--      <button-->
      <!--        class="motion-toggle"-->
      <!--        type="button"-->
      <!--        :aria-pressed="motionEnabled && !systemReducedMotion"-->
      <!--        :disabled="systemReducedMotion"-->
      <!--        @click="toggleMotion"-->
      <!--      >-->
      <!--        <span class="motion-indicator" aria-hidden="true">◆</span>-->
      <!--        {{-->
      <!--          systemReducedMotion ? '已跟随系统减少动效' : motionEnabled ? '动效：开启' : '动效：关闭'-->
      <!--        }}-->
      <!--      </button>-->
      <!--      <span>每一页，都好好收藏。 ✦</span>-->
    </footer>
  </div>
</template>
