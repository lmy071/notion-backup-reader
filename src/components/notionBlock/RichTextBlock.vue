<script setup lang="ts">
import type { RichText } from '@/types/notion'

defineProps<{
  richText: RichText[]
}>()

function getColorVar(color: string): string {
  const map: Record<string, string> = {
    default: '',
    gray: 'var(--c-rt-gray)',
    brown: 'var(--c-rt-brown)',
    orange: 'var(--c-rt-orange)',
    yellow: 'var(--c-rt-yellow)',
    green: 'var(--c-rt-green)',
    blue: 'var(--c-rt-blue)',
    purple: 'var(--c-rt-purple)',
    pink: 'var(--c-rt-pink)',
    red: 'var(--c-rt-red)',
    gray_background: 'var(--c-rt-gray-bg)',
    brown_background: 'var(--c-rt-brown-bg)',
    orange_background: 'var(--c-rt-orange-bg)',
    yellow_background: 'var(--c-rt-yellow-bg)',
    green_background: 'var(--c-rt-green-bg)',
    blue_background: 'var(--c-rt-blue-bg)',
    purple_background: 'var(--c-rt-purple-bg)',
    pink_background: 'var(--c-rt-pink-bg)',
    red_background: 'var(--c-rt-red-bg)',
  }
  return map[color] || ''
}
</script>

<template>
  <template v-for="(item, idx) in richText" :key="idx">
    <!-- Mention -->
    <span
      v-if="item.type === 'mention'"
      class="inline-flex items-center px-1 py-0.5 rounded text-sm"
      :style="{ backgroundColor: 'var(--c-mention-bg)', color: 'var(--c-mention-text)' }"
    >@{{ item.plain_text }}</span>

    <!-- Inline code -->
    <code
      v-else-if="item.annotations?.code"
      class="px-1 py-0.5 font-mono text-sm rounded"
      :style="{ backgroundColor: 'var(--c-inline-code-bg)', color: 'var(--c-inline-code-text)' }"
    >{{ item.plain_text }}</code>

    <!-- Link -->
    <a
      v-else-if="(item as any).link?.url"
      :href="(item as any).link.url"
      target="_blank"
      rel="noopener noreferrer"
      :style="{
        color: 'var(--c-link)',
        fontWeight: (item as any).bold ? 'bold' : 'normal',
        fontStyle: (item as any).italic ? 'italic' : 'normal',
        textDecoration: [
          (item as any).strikethrough ? 'line-through' : '',
          'underline',
        ].filter(Boolean).join(' '),
      }"
    >{{ item.plain_text }}</a>

    <!-- Plain text with annotations -->
    <span
      v-else
      :style="{
        color: getColorVar((item as any).color) || 'var(--c-text)',
        fontWeight: (item as any).bold ? 'bold' : 'normal',
        fontStyle: (item as any).italic ? 'italic' : 'normal',
        textDecoration: [
          (item as any).underline ? 'underline' : '',
          (item as any).strikethrough ? 'line-through' : '',
        ].filter(Boolean).join(' ') || 'none',
        backgroundColor: ((item as any).color || '').endsWith('_background') ? getColorVar((item as any).color) : '',
      }"
    >{{ item.plain_text }}</span>
  </template>
</template>
