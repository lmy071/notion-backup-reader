import type { NotionDatabase, NotionDatabaseRow } from '../src/types/notion'

interface RawDatabase {
  id: string
  title: string
  properties: Record<string, unknown>
  results: unknown[]
}

/**
 * Parse a single raw database row.
 */
export function parseDatabaseRow(raw: Record<string, unknown>): NotionDatabaseRow {
  return {
    id: (raw.id as string) ?? '',
    properties: (raw.properties as Record<string, unknown>) ?? (raw as Record<string, unknown>),
  }
}

/**
 * Parse a raw database object into a NotionDatabase.
 */
export function parseDatabase(raw: RawDatabase): NotionDatabase {
  return {
    id: raw.id ?? '',
    title: raw.title ?? '',
    properties: raw.properties ?? {},
    rows: (raw.results ?? []).map((row) => parseDatabaseRow(row as Record<string, unknown>)),
  }
}
