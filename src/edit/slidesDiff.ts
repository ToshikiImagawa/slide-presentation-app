/**
 * 生成結果を器へ適用する前に見せる「構造サマリ差分」の算出（①・案3）。
 *
 * before/after の slides.json テキストを JSON.parse し、`meta` のフィールド差分と `slides` を `id` で
 * 突き合わせて 追加 / 変更 / 削除 を算出する純関数。行差分ではなく「何が起きたか」を構造単位で返す。
 * どちらかが構文不正、`slides` が配列でない、id が欠落/重複で突き合わせ不能な場合は `parseable: false` を返し、
 * 呼び出し側（`GeneratedDiffDialog`）は「構造解析不可・全体置換」のフォールバック表示に切り替える。
 */

import type { PresentationData } from '../data/types'
import { serializeSlides } from './slidesSerialize'

/** スライド単位の変更種別。 */
export type SlideChangeKind = 'added' | 'changed' | 'removed'

/** スライド単位の変更。before/after は詳細展開（フィールド差分表示）用の生オブジェクト。 */
export interface SlideChange {
  id: string
  kind: SlideChangeKind
  before?: unknown
  after?: unknown
}

/** meta（および theme 等の非 slides トップレベル）のフィールド差分。 */
export interface FieldChange {
  key: string
  kind: 'added' | 'changed' | 'removed'
  before?: unknown
  after?: unknown
}

/** 構造差分の結果。`parseable: false` のときは他フィールドは空で、フォールバック表示に使う。 */
export interface SlidesDiff {
  parseable: boolean
  beforeCount: number
  afterCount: number
  metaChanges: FieldChange[]
  /** meta / slides 以外のトップレベル（theme 等）の変更キー。 */
  otherChanges: FieldChange[]
  slideChanges: SlideChange[]
  added: number
  changed: number
  removed: number
}

const UNPARSEABLE: SlidesDiff = {
  parseable: false,
  beforeCount: 0,
  afterCount: 0,
  metaChanges: [],
  otherChanges: [],
  slideChanges: [],
  added: 0,
  changed: 0,
  removed: 0,
}

/** キー順に依存しない再帰的等価判定（差分の「変更」判定に使う）。 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return a === b
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  if (typeof a === 'object') {
    const ao = a as Record<string, unknown>
    const bo = b as Record<string, unknown>
    const ak = Object.keys(ao)
    const bk = Object.keys(bo)
    if (ak.length !== bk.length) return false
    return ak.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && deepEqual(ao[k], bo[k]))
  }
  return false
}

function tryParseObject(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text)
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** slides 配列を id→slide の Map にする。id が非文字列/空/重複なら null（突き合わせ不能）。 */
function toSlideMap(slides: unknown): Map<string, Record<string, unknown>> | null {
  if (!Array.isArray(slides)) return null
  const map = new Map<string, Record<string, unknown>>()
  for (const s of slides) {
    if (s === null || typeof s !== 'object' || Array.isArray(s)) return null
    const id = (s as Record<string, unknown>).id
    if (typeof id !== 'string' || id.length === 0) return null
    if (map.has(id)) return null
    map.set(id, s as Record<string, unknown>)
  }
  return map
}

/** オブジェクト同士のフィールド差分（追加/変更/削除）を算出する。 */
function fieldChanges(before: Record<string, unknown>, after: Record<string, unknown>, keyFilter?: (k: string) => boolean): FieldChange[] {
  const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)])
  const changes: FieldChange[] = []
  for (const key of keys) {
    if (keyFilter && !keyFilter(key)) continue
    const inB = Object.prototype.hasOwnProperty.call(before, key)
    const inA = Object.prototype.hasOwnProperty.call(after, key)
    if (inB && !inA) changes.push({ key, kind: 'removed', before: before[key] })
    else if (!inB && inA) changes.push({ key, kind: 'added', after: after[key] })
    else if (!deepEqual(before[key], after[key])) changes.push({ key, kind: 'changed', before: before[key], after: after[key] })
  }
  return changes
}

/**
 * before/after の slides.json テキストから構造差分を算出する。
 * 突き合わせ不能なら `parseable: false`（フォールバック表示用）。
 */
export function computeSlidesDiff(beforeText: string, afterText: string): SlidesDiff {
  const before = tryParseObject(beforeText)
  const after = tryParseObject(afterText)
  if (!before || !after) return UNPARSEABLE

  const beforeSlides = toSlideMap(before.slides)
  const afterSlides = toSlideMap(after.slides)
  if (!beforeSlides || !afterSlides) return UNPARSEABLE

  // meta のフィールド差分（meta 自体が無い側は空オブジェクト扱い）
  const beforeMeta = (before.meta && typeof before.meta === 'object' && !Array.isArray(before.meta) ? before.meta : {}) as Record<string, unknown>
  const afterMeta = (after.meta && typeof after.meta === 'object' && !Array.isArray(after.meta) ? after.meta : {}) as Record<string, unknown>
  const metaChanges = fieldChanges(beforeMeta, afterMeta)

  // meta / slides 以外のトップレベル（theme 等）の変更
  const otherChanges = fieldChanges(before, after, (k) => k !== 'meta' && k !== 'slides')

  // slides を id で突き合わせ
  const slideChanges: SlideChange[] = []
  for (const [id, beforeSlide] of beforeSlides) {
    const afterSlide = afterSlides.get(id)
    if (!afterSlide) slideChanges.push({ id, kind: 'removed', before: beforeSlide })
    else if (!deepEqual(beforeSlide, afterSlide)) slideChanges.push({ id, kind: 'changed', before: beforeSlide, after: afterSlide })
  }
  for (const [id, afterSlide] of afterSlides) {
    if (!beforeSlides.has(id)) slideChanges.push({ id, kind: 'added', after: afterSlide })
  }

  const added = slideChanges.filter((c) => c.kind === 'added').length
  const changed = slideChanges.filter((c) => c.kind === 'changed').length
  const removed = slideChanges.filter((c) => c.kind === 'removed').length

  return {
    parseable: true,
    beforeCount: beforeSlides.size,
    afterCount: afterSlides.size,
    metaChanges,
    otherChanges,
    slideChanges,
    added,
    changed,
    removed,
  }
}

/** 差分に実質的な変更があるか（サマリの「変更なし」表示判定用）。 */
export function hasChanges(diff: SlidesDiff): boolean {
  return diff.metaChanges.length > 0 || diff.otherChanges.length > 0 || diff.slideChanges.length > 0
}

/**
 * 部分適用で選ぶ単位（②・#301）。
 *
 * 選択可能なのは issue が定めた2軸のみ: テーマ（`theme`）とスライド単位（`slideIds`）。
 * meta・theme 以外のトップレベル変更は選択の余地なく常に適用する（追加の選択UIは対象外・YAGNI）。
 */
export interface DiffSelection {
  /** otherChanges の `theme` を適用するか（theme 変更が無ければ意味を持たない） */
  theme: boolean
  /** 適用する slideChanges の id 集合 */
  slideIds: Set<string>
}

/** 全項目を選択した DiffSelection（現状の「全て適用」と等価）。 */
export function selectAllChanges(diff: SlidesDiff): DiffSelection {
  return { theme: true, slideIds: new Set(diff.slideChanges.map((c) => c.id)) }
}

/**
 * afterIds における afterIndex の直前から遡り、resultSlides に既に存在する id を探して
 * その直後の位置を返す（追加スライドの挿入位置。前が見つからなければ先頭 0）。
 */
function findInsertIndex(afterIds: string[], afterIndex: number, resultSlides: Record<string, unknown>[]): number {
  for (let i = afterIndex - 1; i >= 0; i--) {
    const idx = resultSlides.findIndex((s) => s.id === afterIds[i])
    if (idx !== -1) return idx + 1
  }
  return 0
}

/**
 * 選択された項目（テーマ・スライド単位）だけを before に反映し、2 スペース整形の JSON テキストを返す（②・#301）。
 *
 * - meta と theme 以外のトップレベル変更は選択に関わらず常に反映する（after の値を採用）
 * - theme は `selection.theme` が true のときだけ after の値を採用する
 * - スライドは `selection.slideIds` に含まれる id だけ反映する。追加スライドは after での相対順序を保って
 *   before の並びに挿入し、選択されなかった削除/変更は before のまま残す
 * - 構造解析不能（`computeSlidesDiff` が `parseable: false`）なら before をそのまま返す
 *   （呼び出し側は parseable を見て全体置換にフォールバックする想定）
 */
export function applySelectedChanges(beforeText: string, afterText: string, selection: DiffSelection): string {
  const diff = computeSlidesDiff(beforeText, afterText)
  if (!diff.parseable) return beforeText

  const before = JSON.parse(beforeText) as Record<string, unknown>
  const after = JSON.parse(afterText) as Record<string, unknown>
  const result: Record<string, unknown> = { ...before }

  // meta は選択の余地なく常に適用するが、diff.metaChanges（フィールド単位の追加/変更/削除）を反映する。
  // after.meta を丸ごと差し替えないのは、otherChanges と同じフィールド単位の意味論に揃えるため
  const beforeMeta = (before.meta && typeof before.meta === 'object' && !Array.isArray(before.meta) ? before.meta : {}) as Record<string, unknown>
  const mergedMeta: Record<string, unknown> = { ...beforeMeta }
  for (const m of diff.metaChanges) {
    if (m.kind === 'removed') delete mergedMeta[m.key]
    else mergedMeta[m.key] = m.after
  }
  result.meta = mergedMeta

  for (const o of diff.otherChanges) {
    if (o.key === 'theme' && !selection.theme) continue
    if (o.kind === 'removed') delete result[o.key]
    else result[o.key] = after[o.key]
  }

  const beforeSlides = Array.isArray(before.slides) ? (before.slides as Record<string, unknown>[]) : []
  const afterIds = Array.isArray(after.slides) ? (after.slides as Record<string, unknown>[]).map((s) => s.id as string) : []
  const changeById = new Map(diff.slideChanges.map((c) => [c.id, c]))

  const resultSlides: Record<string, unknown>[] = []
  for (const slide of beforeSlides) {
    const id = slide.id as string
    const change = changeById.get(id)
    if (change?.kind === 'removed' && selection.slideIds.has(id)) continue
    if (change?.kind === 'changed' && selection.slideIds.has(id)) {
      resultSlides.push(change.after as Record<string, unknown>)
    } else {
      resultSlides.push(slide)
    }
  }
  for (const change of diff.slideChanges) {
    if (change.kind !== 'added' || !selection.slideIds.has(change.id)) continue
    const insertAt = findInsertIndex(afterIds, afterIds.indexOf(change.id), resultSlides)
    resultSlides.splice(insertAt, 0, change.after as Record<string, unknown>)
  }
  result.slides = resultSlides

  return serializeSlides(result as unknown as PresentationData)
}
