<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    page: number
    total: number
    pageSize?: number
  }>(),
  {
    pageSize: 10,
  },
)

const emit = defineEmits<{
  'update:page': [page: number]
}>()

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const start = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1))
const end = computed(() => Math.min(props.page * props.pageSize, props.total))
const jumpPage = ref<number | null>(props.page)

watch(
  () => props.page,
  page => {
    jumpPage.value = page
  },
)

function goToPage(page: number) {
  emit('update:page', Math.min(Math.max(page, 1), pageCount.value))
}

function submitJump() {
  if (jumpPage.value === null || !Number.isFinite(jumpPage.value)) {
    jumpPage.value = props.page
    return
  }

  const page = Math.min(Math.max(Math.floor(jumpPage.value), 1), pageCount.value)
  jumpPage.value = page
  goToPage(page)
}
</script>

<template>
  <div
    v-if="total > pageSize"
    class="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs"
    style="color: var(--c-text-tertiary); border-top: 1px solid var(--c-table-border)"
  >
    <span>第 {{ start }}–{{ end }} 条，共 {{ total }} 条</span>
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="rounded px-2.5 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        style="color: var(--c-text-secondary); border: 1px solid var(--c-border)"
        :disabled="page <= 1"
        aria-label="上一页"
        @click="goToPage(page - 1)"
      >
        上一页
      </button>
      <span>{{ page }} / {{ pageCount }}</span>
      <button
        type="button"
        class="rounded px-2.5 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        style="color: var(--c-text-secondary); border: 1px solid var(--c-border)"
        :disabled="page >= pageCount"
        aria-label="下一页"
        @click="goToPage(page + 1)"
      >
        下一页
      </button>
      <form class="flex items-center gap-1" @submit.prevent="submitJump">
        <label class="flex items-center gap-1">
          <span>跳至</span>
          <input
            v-model.number="jumpPage"
            type="number"
            min="1"
            :max="pageCount"
            inputmode="numeric"
            class="w-14 rounded px-2 py-1 text-center outline-none"
            style="
              color: var(--c-text);
              background-color: var(--c-bg);
              border: 1px solid var(--c-border);
            "
            aria-label="跳转页码"
          />
        </label>
        <span>页</span>
        <button
          type="submit"
          class="rounded px-2.5 py-1 transition-colors"
          style="color: var(--c-text-secondary); border: 1px solid var(--c-border)"
        >
          跳转
        </button>
      </form>
    </div>
  </div>
</template>
