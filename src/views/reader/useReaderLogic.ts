import { ref, computed, watch } from 'vue'
import { storage } from '@/services/storage'
import type { NotionPage } from '@/types/notion'

export interface HeadingItem {
  id: string
  level: number
  text: string
}

export function useReaderLogic(rootPageId: string, date: string, pageId: string) {
  const page = ref<NotionPage | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const sidebarWidth = ref(280)

  async function loadPage() {
    loading.value = true
    error.value = null
    try {
      const result = await storage.getPage(rootPageId, date, pageId)
      if (result?.page) {
        page.value = result.page as unknown as NotionPage
      } else {
        error.value = '页面未找到'
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : '加载失败'
    } finally {
      loading.value = false
    }
  }

  const headings = computed<HeadingItem[]>(() => {
    if (!page.value) return []
    return page.value.blocks
      .filter(b => b.type.startsWith('heading_'))
      .map(b => {
        // parseBlock has already flattened rich_text to top level
        const richText = (b as { rich_text?: Array<{ plain_text?: string }> }).rich_text ?? []
        const text = richText.map(rt => rt.plain_text ?? '').join('')
        return {
          id: b.id,
          level: parseInt(b.type.replace('heading_', '')),
          text,
        }
      })
  })

  watch([() => rootPageId, () => date, () => pageId], loadPage, { immediate: true })

  return { page, loading, error, headings, sidebarWidth, loadPage }
}
