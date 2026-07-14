import type { NotionDatabase, NotionDatabaseRow, RawDatabaseProperties, DatabasePropertyValue } from '../src/types/notion'

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
    properties: (raw.properties as Record<string, DatabasePropertyValue>) ?? {},
  }
}

/**
 * Parse a raw database object into a NotionDatabase.
 */
export function parseDatabase(raw: RawDatabase): NotionDatabase {
  return {
    id: raw.id ?? '',
    title: raw.title ?? '',
    properties: raw.properties as RawDatabaseProperties ?? {},
    rows: (raw.results ?? []).map((row) => parseDatabaseRow(row as Record<string, unknown>)),
  }
}
