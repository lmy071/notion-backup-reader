<script setup lang="ts">
import { computed } from 'vue'
import type { NotionBlock, RichText } from '@/types/notion'
import TablePagination from '@/components/common/TablePagination.vue'
import { usePagination } from '@/composables/usePagination'
const props = defineProps<{ block: NotionBlock }>()
const rows = computed(() => (props.block as { children?: NotionBlock[] }).children ?? [])
const hasColumnHeader = computed(
  () => (props.block as { has_column_header?: boolean }).has_column_header ?? false,
)
const hasRowHeader = computed(
  () => (props.block as { has_row_header?: boolean }).has_row_header ?? false,
)
const bodyRows = computed(() => (hasColumnHeader.value ? rows.value.slice(1) : rows.value))
const { page, pageSize, pagedRows } = usePagination(bodyRows)
const visibleRows = computed(() =>
  hasColumnHeader.value && rows.value[0] ? [rows.value[0], ...pagedRows.value] : pagedRows.value,
)
</script>
<template>
  <div class="my-4 rounded-lg" style="border: 1px solid var(--c-table-border)">
    <div class="overflow-x-auto">
      <table class="w-full border-collapse">
        <tbody>
          <tr
            v-for="(row, rowIdx) in visibleRows"
            :key="row.id"
            :style="{
              backgroundColor: hasColumnHeader && rowIdx === 0 ? 'var(--c-table-header-bg)' : '',
              borderTop: rowIdx > 0 ? '1px solid var(--c-table-border)' : 'none',
            }"
          >
            <component
              :is="
                (hasColumnHeader && rowIdx === 0) || (hasRowHeader && colIdx === 0) ? 'th' : 'td'
              "
              v-for="(cell, colIdx) in (row as { cells?: RichText[][] }).cells ?? []"
              :key="colIdx"
              :scope="
                hasColumnHeader && rowIdx === 0
                  ? 'col'
                  : hasRowHeader && colIdx === 0
                    ? 'row'
                    : undefined
              "
              class="px-4 py-2 text-sm text-left"
              :style="{
                borderRight: '1px solid var(--c-table-border)',
                color: 'var(--c-text)',
                backgroundColor: hasRowHeader && colIdx === 0 ? 'var(--c-table-header-bg)' : '',
              }"
            >
              <template v-for="(rt, i) in cell" :key="i">{{ rt.plain_text }}</template>
            </component>
          </tr>
        </tbody>
      </table>
    </div>
    <div
      v-if="rows.length === 0"
      class="px-4 py-8 text-center text-sm"
      style="color: var(--c-text-tertiary)"
    >
      空表格
    </div>
    <TablePagination
      v-if="bodyRows.length"
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="bodyRows.length"
    />
  </div>
</template>
