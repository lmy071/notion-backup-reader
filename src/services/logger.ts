export interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  pageId?: string
  pageTitle?: string
  dbId?: string
  action: 'sync_start' | 'sync_done' | 'sync_error' | 'block_fetch' | 'child_fetch' | 'db_fetch' | 'cleanup' | 'config'
  message: string
  duration?: number
  error?: string | null
}

function getLogFileName(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}.log`
}

async function writeLog(entry: LogEntry): Promise<void> {
  const fileName = getLogFileName()
  const line = JSON.stringify(entry) + '\n'

  try {
    const response = await fetch('/api/storage/append-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, line }),
    })
    if (!response.ok) {
      console.error('[logger] failed to write log:', response.statusText)
    }
  } catch (e) {
    console.error('[logger] write error:', e)
  }
}

export const logger = {
  info(entry: Omit<LogEntry, 'level' | 'timestamp'>) {
    return writeLog({ ...entry, level: 'info', timestamp: new Date().toISOString() })
  },

  warn(entry: Omit<LogEntry, 'level' | 'timestamp'>) {
    return writeLog({ ...entry, level: 'warn', timestamp: new Date().toISOString() })
  },

  error(entry: Omit<LogEntry, 'level' | 'timestamp'>) {
    return writeLog({ ...entry, level: 'error', timestamp: new Date().toISOString() })
  },

  debug(entry: Omit<LogEntry, 'level' | 'timestamp'>) {
    return writeLog({ ...entry, level: 'debug', timestamp: new Date().toISOString() })
  },

  async query(params: {
    date?: string
    level?: string
    pageId?: string
  }): Promise<LogEntry[]> {
    const searchParams = new URLSearchParams()
    if (params.date) searchParams.set('date', params.date)
    if (params.level) searchParams.set('level', params.level)
    if (params.pageId) searchParams.set('pageId', params.pageId)

    try {
      const response = await fetch(`/api/storage/logs?${searchParams.toString()}`)
      if (!response.ok) return []
      return response.json()
    } catch {
      return []
    }
  },

  async cleanup(): Promise<void> {
    try {
      await fetch('/api/storage/cleanup-logs', { method: 'POST' })
    } catch (e) {
      console.error('[logger] cleanup error:', e)
    }
  },
}
