<script setup lang="ts">
defineProps<{
  pageId: string
  title: string
  icon: string | null
  coverUrl: string | null
  lastSync: string
  blockCount: number
  childCount: number
}>()

const emit = defineEmits<{
  navigate: [pageId: string]
}>()

function formatDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <article
    class="card cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
    @click="emit('navigate', pageId)"
  >
    <!-- 封面图 -->
    <div v-if="coverUrl" class="w-full h-32 overflow-hidden bg-[var(--c-bg-secondary)]">
      <img
        :src="coverUrl"
        :alt="title"
        class="w-full h-full object-cover"
        loading="lazy"
      />
    </div>

    <!-- 卡片内容 -->
    <div class="p-4">
      <!-- 标题行 -->
      <div class="flex items-start gap-2 mb-2">
        <span v-if="icon" class="text-xl leading-none shrink-0">{{ icon }}</span>
        <h3 class="text-sm font-semibold line-clamp-2 leading-snug">
          {{ title || '无标题' }}
        </h3>
      </div>

      <!-- 元信息 -->
      <div class="flex flex-wrap items-center gap-3 text-xs text-[var(--c-text-secondary)] mt-3">
        <span v-if="lastSync" class="flex items-center gap-1">
          <span class="i-carbon-time w-3 h-3" />
          {{ formatDate(lastSync) }}
        </span>
        <span class="flex items-center gap-1">
          <span class="i-carbon-document w-3 h-3" />
          {{ blockCount }} 块
        </span>
        <span v-if="childCount > 0" class="flex items-center gap-1">
          <span class="i-carbon-tree-view w-3 h-3" />
          {{ childCount }} 子页
        </span>
      </div>
    </div>
  </article>
</template>
