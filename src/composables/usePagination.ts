import { computed, ref, watch, type Ref } from 'vue'

export function usePagination<T>(rows: Ref<T[]>) {
  const page = ref(1)
  const pageSize = ref(30)
  const totalPages = computed(() => Math.max(1, Math.ceil(rows.value.length / pageSize.value)))
  watch(
    [rows, pageSize],
    () => {
      page.value = 1
    },
    { flush: 'sync' },
  )
  watch(
    totalPages,
    count => {
      page.value = Math.min(page.value, count)
    },
    { flush: 'sync' },
  )
  const pagedRows = computed(() => {
    const start = (page.value - 1) * pageSize.value
    return rows.value.slice(start, start + pageSize.value)
  })
  return { page, pageSize, totalPages, pagedRows }
}
