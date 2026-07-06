<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="h-100vh flex flex-col bg-[var(--c-bg)]">
    <nav
      class="h-48px flex items-center px-6 gap-6 border-b border-[var(--c-border)] bg-[var(--c-bg-secondary)] shrink-0"
    >
      <span class="text-[var(--fs-lg)] font-bold text-[var(--c-primary)]">
        Notion Backup Reader
      </span>
      <div class="flex gap-2 ml-auto">
        <router-link
          to="/"
          class="px-4 py-2 rounded text-[var(--fs-sm)] text-[var(--c-text-secondary)] hover:bg-[var(--c-primary-light)] hover:text-[var(--c-primary)] transition-colors no-underline"
          active-class="!text-[var(--c-primary)] !bg-[var(--c-primary-light)]"
        >
          首页
        </router-link>
        <router-link
          to="/sync"
          class="px-4 py-2 rounded text-[var(--fs-sm)] text-[var(--c-text-secondary)] hover:bg-[var(--c-primary-light)] hover:text-[var(--c-primary)] transition-colors no-underline"
          active-class="!text-[var(--c-primary)] !bg-[var(--c-primary-light)]"
        >
          同步
        </router-link>
        <router-link
          to="/config"
          class="px-4 py-2 rounded text-[var(--fs-sm)] text-[var(--c-text-secondary)] hover:bg-[var(--c-primary-light)] hover:text-[var(--c-primary)] transition-colors no-underline"
          active-class="!text-[var(--c-primary)] !bg-[var(--c-primary-light)]"
        >
          配置
        </router-link>
      </div>
    </nav>
    <main class="flex-1 overflow-auto">
      <RouterView />
    </main>
  </div>
</template>
