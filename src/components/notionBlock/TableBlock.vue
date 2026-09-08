<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { NotionBlock, RichText } from '@/types/notion'
import TablePagination from '@/components/common/TablePagination.vue'

const props = defineProps<{
  block: NotionBlock
}>()

const rows = computed(() => (props.block as { children?: NotionBlock[] }).children ?? [])
const hasColumnHeader = computed(
  () => (props.block as { has_column_header?: boolean }).has_column_header ?? false,
)
const hasRowHeader = computed(
  () => (props.block as { has_row_header?: boolean }).has_row_header ?? false,
)
const pageSize = 10
const currentPage = ref(1)
const dataRows = computed(() => (hasColumnHeader.value ? rows.value.slice(1) : rows.value))
const paginatedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return dataRows.value.slice(start, start + pageSize)
})
const visibleRows = computed(() => {
  if (!hasColumnHeader.value || rows.value.length === 0) return paginatedRows.value
  return [rows.value[0], ...paginatedRows.value]
})

watch(
  () => [props.block.id, rows.value.length],
  () => {
    currentPage.value = 1
  },
)
</script>

<template>
  <div class="my-4 overflow-hidden rounded-lg" style="border: 1px solid var(--c-table-border)">
    <div class="overflow-x-auto">
      <table class="w-full border-collapse">
        <tbody>
          <tr
            v-for="(row, pageRowIdx) in visibleRows"
            :key="row.id"
            :style="{
              backgroundColor:
                hasColumnHeader && pageRowIdx === 0 ? 'var(--c-table-header-bg)' : '',
              borderTop: pageRowIdx > 0 ? `1px solid var(--c-table-border)` : 'none',
            }"
          >
            <td
              v-for="(cell, colIdx) in (row as { cells?: RichText[][] }).cells ?? []"
              :key="colIdx"
              class="break-words px-4 py-2 text-sm"
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
    </div>
    <div
      v-if="rows.length === 0"
      class="px-4 py-8 text-center text-sm"
      style="color: var(--c-text-tertiary)"
    >
      Empty table
    </div>
    <TablePagination v-model:page="currentPage" :total="dataRows.length" :page-size="pageSize" />
  </div>
</template>
