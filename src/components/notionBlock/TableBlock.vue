<script setup lang="ts">
import type { NotionBlock } from '@/types/notion'
import RichTextBlock from './RichTextBlock.vue'

const props = defineProps<{
  block: NotionBlock
}>()

// parseBlock 已将 table 相关字段提取到顶层
const block = props.block as {
  table_width?: number
  has_column_header?: boolean
  has_row_header?: boolean
  children?: NotionBlock[]
}
const hasColumnHeader = block.has_column_header ?? false
const hasRowHeader = block.has_row_header ?? false
const rows = block.children ?? []
</script>

<template>
  <div class="my-4 overflow-x-auto rounded-lg border border-gray-200">
    <table class="min-w-full border-collapse">
      <tbody>
        <tr
          v-for="(row, rowIdx) in rows"
          :key="(row as { id: string }).id"
          :class="{
            'bg-gray-50 font-medium': hasColumnHeader && rowIdx === 0,
            'border-t border-gray-200': rowIdx > 0,
          }"
        >
          <td
            v-for="(cell, colIdx) in (row as { cells?: unknown[] }).cells ?? []"
            :key="colIdx"
            :class="{
              'font-semibold bg-gray-50': hasRowHeader && colIdx === 0,
            }"
            class="px-4 py-2 text-sm text-gray-800 border-r border-gray-100 last:border-r-0"
          >
            <RichTextBlock :rich-text="(cell as any)" />
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="rows.length === 0" class="px-4 py-8 text-center text-gray-400 text-sm">
      Empty table
    </div>
  </div>
</template>
