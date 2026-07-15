<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="h-100vh flex flex-col relative" style="background-color: transparent">
    <!-- 半透明遮罩层 -->
    <div
      class="absolute inset-0 z-0 pointer-events-none"
      :style="{
        backgroundColor: 'var(--c-bg)',
        opacity: 'var(--bg-overlay-opacity)',
        backdropFilter: 'blur(var(--bg-overlay-blur))',
      }"
    />
    <nav
      class="h-48px flex items-center px-6 gap-6 shrink-0 relative z-1"
      style="background-color: var(--c-bg-secondary); border-bottom: 1px solid var(--c-border);"
    >
      <span
        class="font-bold"
        style="font-size: var(--fs-lg); color: var(--c-brand)"
      >
        Notion Backup Reader
      </span>
      <div class="flex gap-2 ml-auto">
        <router-link
          to="/"
          class="px-4 py-2 rounded no-underline transition-colors"
          style="font-size: var(--fs-sm); color: var(--c-text-secondary)"
          active-class="!color-[--c-brand] !bg-[--c-brand-light]"
        >
          首页
        </router-link>
        <router-link
          to="/sync"
          class="px-4 py-2 rounded no-underline transition-colors"
          style="font-size: var(--fs-sm); color: var(--c-text-secondary)"
          active-class="!color-[--c-brand] !bg-[--c-brand-light]"
        >
          同步
        </router-link>
        <router-link
          to="/config"
          class="px-4 py-2 rounded no-underline transition-colors"
          style="font-size: var(--fs-sm); color: var(--c-text-secondary)"
          active-class="!color-[--c-brand] !bg-[--c-brand-light]"
        >
          配置
        </router-link>
      </div>
    </nav>
    <main class="flex-1 overflow-auto relative z-1">
      <RouterView />
    </main>
  </div>
</template>
