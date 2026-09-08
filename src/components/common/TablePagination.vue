<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ page: number; pageSize: number; total: number }>()
const emit = defineEmits<{ 'update:page': [value: number]; 'update:pageSize': [value: number] }>()
const pages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const start = computed(() => (props.total ? (props.page - 1) * props.pageSize + 1 : 0))
const end = computed(() => Math.min(props.page * props.pageSize, props.total))
</script>
<template>
  <nav class="table-pagination" aria-label="表格分页">
    <span aria-live="polite">{{ start }}–{{ end }} / 共 {{ total }} 条</span>
    <label
      >每页
      <select
        :value="pageSize"
        @change="emit('update:pageSize', Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="size in [30, 50, 100]" :key="size" :value="size">{{ size }} 条</option>
      </select>
    </label>
    <div class="pagination-buttons">
      <button type="button" :disabled="page <= 1" @click="emit('update:page', page - 1)">
        上一页
      </button>
      <span>{{ page }} / {{ pages }}</span>
      <button type="button" :disabled="page >= pages" @click="emit('update:page', page + 1)">
        下一页
      </button>
    </div>
  </nav>
</template>
<style scoped>
.table-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid var(--c-table-border);
  font-size: 13px;
  color: var(--c-text-secondary);
  background: var(--c-paper);
}
.table-pagination label,
.pagination-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}
.table-pagination button,
.table-pagination select {
  padding: 4px 8px;
  color: var(--c-text);
  background: var(--c-bg);
  border: 1px solid var(--c-border);
}
.table-pagination button:not(:disabled),
.table-pagination select {
  cursor: pointer;
}
</style>
