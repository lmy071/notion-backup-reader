<script setup lang="ts">
import { computed } from 'vue'
import type { HeadingItem } from './useReaderLogic'

const props = defineProps<{
  headings: HeadingItem[]
}>()

// Group headings by nesting level
interface TocNode {
  item: HeadingItem
  children: TocNode[]
}

function buildTree(items: HeadingItem[]): TocNode[] {
  const root: TocNode[] = []
  const stack: TocNode[] = []

  for (const item of items) {
    const node: TocNode = { item, children: [] }
    while (stack.length > 0 && stack[stack.length - 1].item.level >= item.level) {
      stack.pop()
    }
    if (stack.length === 0) {
      root.push(node)
    } else {
      stack[stack.length - 1].children.push(node)
    }
    stack.push(node)
  }

  return root
}

const tree = computed(() => buildTree(props.headings))

function scrollTo(id: string) {
  // Try id first (getElementById), then data-block-id
  let el: HTMLElement | null
  try {
    el = document.getElementById(id)
  } catch {
    el = null
  }
  if (!el) {
    el = document.querySelector(`[data-block-id="${CSS.escape(id)}"]`) as HTMLElement | null
  }
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <template v-if="headings.length === 0">
    <p class="text-sm" style="color: var(--c-text-tertiary)">暂无可识别的标题</p>
  </template>
  <template v-else>
    <TocNodeRenderer
      :nodes="tree"
      :depth="0"
      @navigate="scrollTo"
    />
  </template>
</template>

<!-- Recursive sub-component for tree rendering -->
<script lang="ts">
import { defineComponent, h, type PropType } from 'vue'

interface TocNode { item: { id: string; level: number; text: string }; children: TocNode[] }

export const TocNodeRenderer = defineComponent({
  name: 'TocNodeRenderer',
  props: {
    nodes: { type: Array as PropType<TocNode[]>, required: true },
    depth: { type: Number, default: 0 },
  },
  emits: ['navigate'],
  setup(props, { emit }) {
    return () => {
      return h('ul', {
        style: {
          listStyle: 'none',
          paddingLeft: props.depth > 0 ? '16px' : '0',
        },
      }, props.nodes.map(node => [
        h('li', { key: node.item.id, style: { marginTop: '4px' } }, [
          h('button', {
            onClick: () => emit('navigate', node.item.id),
            style: {
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '13px',
              color: 'var(--c-text-secondary)',
              lineHeight: '1.5',
              padding: '2px 0',
              width: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            },
            title: node.item.text,
          }, node.item.text || '(无标题)'),
        ]),
        node.children.length > 0
          ? h(TocNodeRenderer, {
              nodes: node.children,
              depth: props.depth + 1,
              onNavigate: (id: string) => emit('navigate', id),
            })
          : null,
      ]))
    }
  },
})
</script>
