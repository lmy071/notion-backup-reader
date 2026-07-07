<script setup lang="ts">
import type { RichText } from '@/types/notion'

defineProps<{
  richText: RichText[]
}>()

// 注意：parseRichText 已将 annotations 字段扁平化到顶层
// item.code / item.bold / item.italic / ... 直接可用

function getColorClass(color: string): string {
  const colorMap: Record<string, string> = {
    default: '',
    gray: 'text-gray-500',
    brown: 'text-amber-700',
    orange: 'text-orange-500',
    yellow: 'text-yellow-500',
    green: 'text-green-500',
    blue: 'text-blue-500',
    purple: 'text-purple-500',
    pink: 'text-pink-500',
    red: 'text-red-500',
    gray_background: 'bg-gray-100 rounded',
    brown_background: 'bg-amber-100 rounded',
    orange_background: 'bg-orange-100 rounded',
    yellow_background: 'bg-yellow-100 rounded',
    green_background: 'bg-green-100 rounded',
    blue_background: 'bg-blue-100 rounded',
    purple_background: 'bg-purple-100 rounded',
    pink_background: 'bg-pink-100 rounded',
    red_background: 'bg-red-100 rounded',
  }
  return colorMap[color] || ''
}
</script>

<template>
  <template v-for="(item, idx) in richText" :key="idx">
    <!-- Mention -->
    <span
      v-if="item.type === 'mention'"
      class="inline-flex items-center px-1 py-0.5 rounded bg-gray-100 text-gray-600 text-sm"
    >@{{ item.plain_text }}</span>

    <!-- Inline code -->
    <code
      v-else-if="(item as any).code"
      :class="getColorClass((item as any).color)"
      class="px-1 py-0.5 bg-red-50 text-red-500 font-mono text-sm rounded"
    >{{ item.plain_text }}</code>

    <!-- Link -->
    <a
      v-else-if="(item as any).link?.url"
      :href="(item as any).link.url"
      target="_blank"
      rel="noopener noreferrer"
      :class="getColorClass((item as any).color)"
      class="underline decoration-blue-400 text-blue-600 hover:text-blue-800"
      :style="{
        fontWeight: (item as any).bold ? 'bold' : 'normal',
        fontStyle: (item as any).italic ? 'italic' : 'normal',
        textDecoration: ([
          'underline',
          (item as any).strikethrough ? 'line-through' : '',
        ] as string[]).filter(Boolean).join(' '),
      }"
    >{{ item.plain_text }}</a>

    <!-- Plain text with annotations -->
    <span
      v-else
      :class="getColorClass((item as any).color)"
      :style="{
        fontWeight: (item as any).bold ? 'bold' : 'normal',
        fontStyle: (item as any).italic ? 'italic' : 'normal',
        textDecoration: ([
          (item as any).underline ? 'underline' : '',
          (item as any).strikethrough ? 'line-through' : '',
        ] as string[]).filter(Boolean).join(' ') || 'none',
      }"
    >{{ item.plain_text }}</span>
  </template>
</template>
