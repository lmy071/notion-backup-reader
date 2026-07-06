<script setup lang="ts">
import { computed } from 'vue'
import type { NotionBlock } from '@/types/notion'
import ParagraphBlock from './ParagraphBlock.vue'
import HeadingBlock from './HeadingBlock.vue'
import CodeBlock from './CodeBlock.vue'
import CalloutBlock from './CalloutBlock.vue'
import QuoteBlock from './QuoteBlock.vue'
import ImageBlock from './ImageBlock.vue'
import ToDoBlock from './ToDoBlock.vue'
import ToggleBlock from './ToggleBlock.vue'
import ListGroupBlock from './ListGroupBlock.vue'
import ColumnBlock from './ColumnBlock.vue'
import DividerBlock from './DividerBlock.vue'
import BookmarkBlock from './BookmarkBlock.vue'
import ChildPageBlock from './ChildPageBlock.vue'
import TableBlock from './TableBlock.vue'
import EmbedBlock from './EmbedBlock.vue'
import EquationBlock from './EquationBlock.vue'
import VideoBlock from './VideoBlock.vue'
import UnsupportedBlock from './UnsupportedBlock.vue'

const props = defineProps<{
  blocks: NotionBlock[]
}>()

type ComponentMap = Record<string, unknown>

const componentMap: ComponentMap = {
  paragraph: ParagraphBlock,
  bulleted_list_item: ParagraphBlock,
  numbered_list_item: ParagraphBlock,
  heading_1: HeadingBlock,
  heading_2: HeadingBlock,
  heading_3: HeadingBlock,
  code: CodeBlock,
  callout: CalloutBlock,
  quote: QuoteBlock,
  image: ImageBlock,
  to_do: ToDoBlock,
  toggle: ToggleBlock,
  bulleted_list: ListGroupBlock,
  numbered_list: ListGroupBlock,
  column_list: ColumnBlock,
  divider: DividerBlock,
  bookmark: BookmarkBlock,
  child_page: ChildPageBlock,
  child_database: ChildPageBlock,
  table: TableBlock,
  embed: EmbedBlock,
  equation: EquationBlock,
  video: VideoBlock,
}

function getComponent(type: string): unknown {
  return componentMap[type] || UnsupportedBlock
}

function shouldRenderChildren(block: NotionBlock): boolean {
  // Blocks that handle their own children internally
  const selfHandlingTypes = [
    'bulleted_list',
    'numbered_list',
    'column_list',
    'table',
    'toggle',
  ]
  return block.has_children && !selfHandlingTypes.includes(block.type) && (block.children?.length ?? 0) > 0
}
</script>

<template>
  <template v-for="block in blocks" :key="block.id">
    <component :is="getComponent(block.type)" :block="block">
      <template v-if="block.type === 'toggle' && block.has_children && block.children">
        <NotionRenderer :blocks="block.children" />
      </template>
    </component>
    <div v-if="shouldRenderChildren(block)" class="pl-4">
      <NotionRenderer :blocks="block.children!" />
    </div>
  </template>
</template>
