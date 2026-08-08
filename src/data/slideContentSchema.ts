import type { PresentationData, ValidationError } from './types'
import schemaJson from '../../schema/slide-content-schema.json'
import { THEME_COLOR_TOKENS } from '../applyTheme'
import { hasComponent } from '../components/ComponentRegistry'

/**
 * AI生成専用の厳格な構造チェック（#14 生成精度改善）。
 *
 * `schema/slide-content-schema.json`（Rust `system_prompt()` と共有する単一ソース）を参照し、
 * 「知らない layout」「既知フィールドの型不一致」に加え、テーマ由来の制約違反（未登録のコンポーネント/アイコン名・
 * 未定義の色トークン・情報密度の推奨上限超過）を検出する（#211）。判定対象のフィールドは
 * schema 側の `colorToken`/`iconName`/`componentName`/`maxItems` で宣言し、種別追加時もこのファイルは変更不要にする。
 * 一般用途の `getValidationErrors`（loader.ts）は手動編集・アドオン拡張を阻害しないよう意図的に緩いため変更せず、
 * この検証は `aiGenerate.ts` の自動修正ループでのみ追加適用する。
 */

interface FieldDef {
  type?: string | string[]
  enum?: string[]
  ref?: string
  fields?: FieldMap
  itemFields?: FieldMap
  /** 値がテーマの色トークン名（THEME_COLOR_TOKENSのキー）である必要があるフィールド（#211） */
  colorToken?: boolean
  /** 値がComponentRegistryに'Icon:<値>'で登録済みのアイコン名である必要があるフィールド（#211） */
  iconName?: boolean
  /** 値がComponentRegistryに登録済みのコンポーネント名である必要があるフィールド（#211） */
  componentName?: boolean
  /** 配列の推奨上限件数。超過は情報密度過多としてエラーにする（#211） */
  maxItems?: number
}

type FieldMap = Record<string, FieldDef>

interface SlideContentSchema {
  layouts: Record<string, { contentFields: FieldMap }>
  columnContentFields: FieldMap & { description?: string }
  componentReference: FieldMap & { description?: string }
  contentItem: FieldMap & { description?: string }
  chart: FieldMap & { description?: string }
  table: FieldMap & { description?: string }
}

const SCHEMA = schemaJson as unknown as SlideContentSchema

/** JSONの「description」等のメタキーを除いたフィールド定義のみを取り出す */
function stripMetaKeys(map: FieldMap & { description?: string }): FieldMap {
  const { description: _description, ...fields } = map
  return fields as FieldMap
}

const REF_MAPS: Record<string, FieldMap> = {
  columnContentFields: stripMetaKeys(SCHEMA.columnContentFields),
  componentReference: stripMetaKeys(SCHEMA.componentReference),
  contentItem: stripMetaKeys(SCHEMA.contentItem),
  chart: stripMetaKeys(SCHEMA.chart),
  table: stripMetaKeys(SCHEMA.table),
}

/** テーマの色トークン名（THEME_COLOR_TOKENSのキー）の集合。colorToken フィールドの値検証に使う（#211） */
const COLOR_TOKEN_NAMES = new Set(Object.keys(THEME_COLOR_TOKENS))

/** 生成が指定してよい layout の一覧（schemaの単一ソースから導出） */
export const ALLOWED_LAYOUTS = Object.keys(SCHEMA.layouts)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function addError(errors: ValidationError[], path: string, message: string, expected: string, actual: string): void {
  errors.push({ path, message, expected, actual })
}

function typeMatches(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number'
    case 'boolean':
      return typeof value === 'boolean'
    case 'array':
      return Array.isArray(value)
    case 'object':
      return isRecord(value)
    default:
      return true
  }
}

/** フィールド定義から検証対象のFieldMapを解決する（refがあれば名前解決、なければ直接指定分を使う） */
function resolveFields(def: FieldDef, direct: FieldMap | undefined): FieldMap | undefined {
  return (def.ref && REF_MAPS[def.ref]) || direct
}

function checkFieldValue(value: unknown, def: FieldDef, path: string, errors: ValidationError[]): void {
  const types = Array.isArray(def.type) ? def.type : def.type ? [def.type] : []
  if (types.length > 0 && !types.some((t) => typeMatches(value, t))) {
    addError(errors, path, `${path}は${types.join('|')}である必要があります`, types.join('|'), typeof value)
    return
  }
  if (def.enum && typeof value === 'string' && !def.enum.includes(value)) {
    addError(errors, path, `${path}は${def.enum.join('|')}のいずれかである必要があります`, def.enum.join('|'), value)
    return
  }
  if (typeof value === 'string') {
    if (def.colorToken && !COLOR_TOKEN_NAMES.has(value)) {
      addError(errors, path, `${path}はテーマの色トークン名である必要があります`, [...COLOR_TOKEN_NAMES].join('|'), value)
      return
    }
    if (def.iconName && !hasComponent(`Icon:${value}`)) {
      addError(errors, path, `${path}は登録済みのアイコン名である必要があります`, '登録済みアイコン名', value)
      return
    }
    if (def.componentName && !hasComponent(value)) {
      addError(errors, path, `${path}は登録済みのコンポーネント名である必要があります`, '登録済みコンポーネント名', value)
      return
    }
  }
  if (Array.isArray(value)) {
    if (def.maxItems != null && value.length > def.maxItems) {
      addError(errors, path, `${path}は${def.maxItems}件以下を推奨します（情報密度）`, `${def.maxItems}件以下`, `${value.length}件`)
    }
    const itemFields = resolveFields(def, def.itemFields)
    if (itemFields) {
      value.forEach((item, i) => checkKnownFields(item, itemFields, `${path}[${i}]`, errors))
    }
  }
  if (isRecord(value)) {
    const fields = resolveFields(def, def.fields)
    if (fields) {
      checkKnownFields(value, fields, path, errors)
    }
  }
}

/** オブジェクトのうち、スキーマに既知のフィールドのみを型チェックする（未知フィールドはエラーにしない） */
function checkKnownFields(value: unknown, fields: FieldMap, prefix: string, errors: ValidationError[]): void {
  if (!isRecord(value)) return
  for (const [key, def] of Object.entries(fields)) {
    const fieldValue = value[key]
    if (fieldValue === undefined) continue
    checkFieldValue(fieldValue, def, `${prefix}.${key}`, errors)
  }
}

/**
 * AI生成結果がスキーマ（`schema/slide-content-schema.json`）に適合しているかを検証する。
 * 「未知の layout」「既知 content フィールドの型不一致」のみを検出し、未知フィールドは許容する。
 */
export function getSchemaConformanceErrors(data: PresentationData): ValidationError[] {
  const errors: ValidationError[] = []
  if (!Array.isArray(data.slides)) return errors

  data.slides.forEach((slide, index) => {
    const prefix = `slides[${index}]`
    const layoutDef = SCHEMA.layouts[slide.layout]
    if (!layoutDef) {
      addError(errors, `${prefix}.layout`, 'layoutは既知のレイアウトである必要があります', ALLOWED_LAYOUTS.join('|'), String(slide.layout))
      return
    }
    checkKnownFields(slide.content, layoutDef.contentFields, `${prefix}.content`, errors)
  })

  return errors
}
