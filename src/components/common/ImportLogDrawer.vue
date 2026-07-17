<script setup lang="ts">
import type { ImportLog, LogLevel } from '@/services/db-import'

defineProps<{
  open: boolean
  logs: ImportLog[]
  importing: boolean
  importProgress: { done: number; total: number } | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const levelConfig: Record<LogLevel, { label: string; color: string; bg: string }> = {
  info:    { label: 'INFO',  color: 'var(--c-brand)',    bg: 'var(--c-bg-secondary)' },
  warn:    { label: 'WARN',  color: 'var(--c-warning)',   bg: 'var(--c-bg-secondary)' },
  error:   { label: 'ERROR', color: 'var(--c-danger)',    bg: 'var(--c-bg-secondary)' },
  success: { label: 'OK',    color: 'var(--c-success)',   bg: 'var(--c-bg-secondary)' },
  skip:    { label: 'SKIP',  color: 'var(--c-text-tertiary)', bg: 'var(--c-bg-secondary)' },
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
</script>

<template>
  <Transition name="drawer-fade">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex justify-end"
      style="background-color: transparent"
      @click.self="emit('close')"
    >
      <!-- 面板 -->
      <Transition name="drawer-slide">
        <div
          v-if="open"
          class="h-full w-full max-w-md flex flex-col shadow-2xl"
          style="background-color: var(--c-card-bg); border-left: 1px solid var(--c-card-border)"
        >
          <!-- 头部 -->
          <div
            class="flex items-center justify-between px-4 py-3 shrink-0"
            style="border-bottom: 1px solid var(--c-card-border)"
          >
            <h2 class="text-lg font-semibold" style="color: var(--c-text-primary)">导入日志</h2>
            <button
              class="w-8 h-8 flex items-center justify-center rounded cursor-pointer border-none outline-none transition-colors"
              style="background-color: transparent; color: var(--c-text-secondary)"
              @click="emit('close')"
              @mouseenter="(e: MouseEvent) => (e.target as HTMLElement).style.backgroundColor = 'var(--c-bg-secondary)'"
              @mouseleave="(e: MouseEvent) => (e.target as HTMLElement).style.backgroundColor = 'transparent'"
            >
              ✕
            </button>
          </div>

          <!-- 进度条 -->
          <div
            v-if="importProgress"
            class="px-4 py-2 shrink-0"
            style="border-bottom: 1px solid var(--c-card-border)"
          >
            <div class="flex items-center justify-between text-xs mb-1" style="color: var(--c-text-secondary)">
              <span>导入进度</span>
              <span>{{ importProgress.done }} / {{ importProgress.total }}</span>
            </div>
            <div class="h-1.5 rounded-full overflow-hidden" style="background-color: var(--c-bg-secondary)">
              <div
                class="h-full rounded-full transition-all duration-300"
                style="background-color: var(--c-brand)"
                :style="{ width: (importProgress.total > 0 ? (importProgress.done / importProgress.total) * 100 : 0) + '%' }"
              />
            </div>
          </div>

          <!-- 日志列表 -->
          <div class="flex-1 overflow-y-auto px-4 py-3">
            <div v-if="logs.length === 0 && !importing" class="text-sm text-center py-8" style="color: var(--c-text-tertiary)">
              暂无日志
            </div>

            <div v-if="importing && logs.length === 0" class="text-sm text-center py-8" style="color: var(--c-text-tertiary)">
              正在检查中...
            </div>

            <div v-for="(log, i) in logs" :key="i" class="flex items-start gap-2 py-1.5 text-sm">
              <span
                class="inline-block px-1.5 py-0.5 rounded text-xs font-mono shrink-0"
                :style="{ color: levelConfig[log.level].color, backgroundColor: levelConfig[log.level].bg }"
              >
                {{ levelConfig[log.level].label }}
              </span>
              <span class="shrink-0 text-xs font-mono" style="color: var(--c-text-tertiary)">
                {{ formatTime(log.time) }}
              </span>
              <span
                v-if="log.row"
                class="shrink-0 text-xs"
                style="color: var(--c-text-tertiary)"
              >
                R{{ log.row }}
              </span>
              <span style="color: var(--c-text-primary); word-break: break-word;">{{ log.message }}</span>
            </div>
          </div>

          <!-- 底部统计 -->
          <div
            class="flex items-center gap-3 px-4 py-2 text-xs shrink-0"
            style="border-top: 1px solid var(--c-card-border)"
          >
            <span style="color: var(--c-success)">✅ {{ logs.filter(l => l.level === 'success').length }}</span>
            <span style="color: var(--c-warning)">⚠️ {{ logs.filter(l => l.level === 'warn').length }}</span>
            <span style="color: var(--c-danger)">❌ {{ logs.filter(l => l.level === 'error').length }}</span>
            <span style="color: var(--c-text-tertiary)">⏭️ {{ logs.filter(l => l.level === 'skip').length }}</span>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<style scoped>
.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: background-color 0.25s ease;
}

.drawer-slide-enter-active {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.drawer-slide-leave-active {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(100%);
}
</style>
