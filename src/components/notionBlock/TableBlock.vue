<script setup lang="ts">
import type { NotionBlock, RichText } from '@/types/notion'
import RichTextBlock from './RichTextBlock.vue'

const props = defineProps<{
  block: NotionBlock
}>()

interface TableRow extends NotionBlock {
  type: string
  table_row: {
    cells: RichText[][]
  }
}

const tableData = (props.block as { table: { has_column_header: boolean; has_row_header: boolean; children?: TableRow[] } }).table
const hasColumnHeader = tableData?.has_column_header ?? false
const hasRowHeader = tableData?.has_row_header ?? false
const rows: TableRow[] = tableData?.children ?? []
</script>

<template>
  <div class="my-4 overflow-x-auto rounded-lg border border-gray-200">
    <table class="min-w-full border-collapse">
      <tbody>
        <tr
          v-for="(row, rowIdx) in rows"
          :key="row.id"
          :class="{
            'bg-gray-50 font-medium': hasColumnHeader && rowIdx === 0,
            'border-t border-gray-200': rowIdx > 0,
          }"
        >
          <td
            v-for="(cell, colIdx) in row.table_row.cells"
            :key="colIdx"
            :class="{
              'font-semibold bg-gray-50': hasRowHeader && colIdx === 0,
            }"
            class="px-4 py-2 text-sm text-gray-800 border-r border-gray-100 last:border-r-0"
          >
            <RichTextBlock :rich-text="cell" />
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="rows.length === 0" class="px-4 py-8 text-center text-gray-400 text-sm">
      Empty table
    </div>
  </div>
</template>
