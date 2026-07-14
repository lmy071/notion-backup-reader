import { ref, computed, watch, type MaybeRefOrGetter, toValue } from 'vue'
import { storage } from '@/services/storage'
import type { NotionPage, NotionDatabase } from '@/types/notion'
import type { SubPageCard } from '@/types/storage'

export interface HeadingItem {
  id: string
  level: number
  text: string
}

export function useReaderLogic(
  rootPageId: MaybeRefOrGetter<string>,
  date: MaybeRefOrGetter<string>,
  pageId: MaybeRefOrGetter<string>,
) {
  const page = ref<NotionPage | null>(null)
  const subPages = ref<SubPageCard[]>([])
  const backlinks = ref<SubPageCard[]>([])
  const pageDatabases = ref<Record<string, NotionDatabase>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)
  const sidebarWidth = ref(280)

  async function loadPage() {
    const rid = toValue(rootPageId)
    const d = toValue(date)
    const pid = toValue(pageId)
    if (!rid || !d || !pid) return

    loading.value = true
    error.value = null
    try {
      const [result, bl] = await Promise.all([
        storage.getPage(rid, d, pid),
        storage.getBacklinks(rid, d, pid),
      ])
      if (result?.page) {
        page.value = result.page as unknown as NotionPage
        subPages.value = (result.subPages ?? []) as SubPageCard[]
        pageDatabases.value = (result.databases ?? {}) as Record<string, NotionDatabase>
      } else {
        error.value = '页面未找到'
      }
      backlinks.value = bl
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
        const richText = (b as { rich_text?: Array<{ plain_text?: string }> }).rich_text ?? []
        const text = richText.map(rt => rt.plain_text ?? '').join('')
        return {
          id: b.id,
          level: parseInt(b.type.replace('heading_', '')),
          text,
        }
      })
  })

  // 监听所有参数变化（含路由复用同一组件时 params/query 变更）
  watch(
    () => [toValue(rootPageId), toValue(date), toValue(pageId)],
    () => { loadPage() },
    { immediate: true },
  )

  return { page, subPages, backlinks, pageDatabases, loading, error, headings, sidebarWidth, loadPage }
}
