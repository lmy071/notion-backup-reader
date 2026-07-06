<script setup lang="ts">
import type { HeadingItem } from '@/views/reader/useReaderLogic'

defineProps<{
  headings: HeadingItem[]
}>()

function scrollToHeading(id: string) {
  const el = document.getElementById(id)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}
</script>

<template>
  <nav v-if="headings.length > 0" class="flex flex-col gap-0.5">
    <a
      v-for="heading in headings"
      :key="heading.id"
      :style="{ paddingLeft: `${(heading.level - 1) * 16 + 8}px` }"
      class="block py-1 px-2 rounded text-sm transition-colors cursor-pointer no-underline"
      :class="{
        'text-[var(--c-text)] hover:bg-[var(--c-primary-light)]': heading.level <= 2,
        'text-[var(--c-text-secondary)] hover:bg-[var(--c-primary-light)] text-xs': heading.level >= 3,
      }"
      @click="scrollToHeading(heading.id)"
    >
      {{ heading.text || '无标题' }}
    </a>
  </nav>

  <div v-else class="text-xs text-[var(--c-text-secondary)] px-2 py-1">
    暂无可识别的标题
  </div>
</template>
