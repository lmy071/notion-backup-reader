<script setup lang="ts">
import type { NotionBlock, RichText } from '@/types/notion'

const props = defineProps<{
  block: NotionBlock
}>()

const rows = (props.block as { children?: NotionBlock[] }).children ?? []
const hasColumnHeader = (props.block as { has_column_header?: boolean }).has_column_header ?? false
const hasRowHeader = (props.block as { has_row_header?: boolean }).has_row_header ?? false
</script>

<template>
  <div class="my-4 overflow-x-auto rounded-lg" style="border: 1px solid var(--c-table-border)">
    <table class="w-full border-collapse">
      <tbody>
        <tr
          v-for="(row, rowIdx) in rows"
          :key="row.id"
          :style="{
            backgroundColor: hasColumnHeader && rowIdx === 0 ? 'var(--c-table-header-bg)' : '',
            borderTop: rowIdx > 0 ? `1px solid var(--c-table-border)` : 'none',
          }"
        >
          <td
            v-for="(cell, colIdx) in (row as { cells?: RichText[][] }).cells ?? []"
            :key="colIdx"
            class="px-4 py-2 text-sm"
            :style="{
              borderRight: `1px solid var(--c-table-border)`,
              color: 'var(--c-text)',
              fontWeight: hasRowHeader && colIdx === 0 ? '600' : 'normal',
              backgroundColor: hasRowHeader && colIdx === 0 ? 'var(--c-table-header-bg)' : '',
            }"
          >
            <template v-for="(rt, i) in cell" :key="i">{{ rt.plain_text }}</template>
          </td>
        </tr>
      </tbody>
    </table>
    <div
      v-if="rows.length === 0"
      class="px-4 py-8 text-center text-sm"
      style="color: var(--c-text-tertiary)"
    >
      Empty table
    </div>
  </div>
</template>
