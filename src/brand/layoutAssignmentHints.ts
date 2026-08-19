import { LAYOUT_ASSIGNMENT_SLOTS, type BrandProfile, type LayoutAssignmentSlot, type PlaceholderProfile, type SlideLayoutProfile, type SlideSize } from './types'

/**
 * `layoutAssignments` の初期値を決定的ヒューリスティクスで提示する（#372）。
 *
 * 判定材料は OOXML 規格側の情報（`layoutType` / `PlaceholderProfile.kind` / 矩形）だけを見る。AI は使わず、
 * `name`（作者依存で意味を持たない場合がある）にも依存しない。**確信が持てないレイアウトは未割当のまま
 * にする**（誤った割り当ては「未割当で既定値」より悪い。書体・型階層・safeArea がそこから取られてしまう）。
 * `center/section`/`center/closing` は構成だけでは決め手が弱いため、このモジュールは常に候補に含めない。
 */

/** 判定規則の確信度（数値が小さいほど確信度が高い）。同じ枠に複数レイアウトが該当したとき、
 * `resolveSlotConflicts` がこの値で優劣を決める */
const enum Confidence {
  /** `layoutType` が `title`（OOXML 標準の表紙レイアウト種別）。最も確信度が高い */
  LayoutTypeTitle = 0,
  /** プレースホルダ構成から一意に決まる（表紙 / 本文 の1:1構成） */
  PlaceholderShape = 1,
  /** 複数 body の矩形配置から判定する（2カラム / 全面） */
  RectLayout = 2,
}

interface SlotCandidate {
  /** `"<masterIndex>:<layoutIndex>"` */
  key: string
  slot: LayoutAssignmentSlot
  confidence: Confidence
}

type ResolvedRect = { xEmu: number; yEmu: number; cxEmu: number; cyEmu: number }

function hasRect(placeholder: PlaceholderProfile): placeholder is PlaceholderProfile & ResolvedRect {
  return placeholder.xEmu != null && placeholder.yEmu != null && placeholder.cxEmu != null && placeholder.cyEmu != null
}

/** 矩形2つが「横並び」と判定する許容比率。yEmu の差が両者の平均高さの30%以内なら「近い」、
 * xEmu の差が両者の平均幅の30%以上なら「異なる」とみなす（実測で調整可） */
const SIDE_BY_SIDE_Y_TOLERANCE_RATIO = 0.3
const SIDE_BY_SIDE_X_MIN_RATIO = 0.3

function areSideBySide(a: ResolvedRect, b: ResolvedRect): boolean {
  const avgHeight = (a.cyEmu + b.cyEmu) / 2
  const avgWidth = (a.cxEmu + b.cxEmu) / 2
  const yDiff = Math.abs(a.yEmu - b.yEmu)
  const xDiff = Math.abs(a.xEmu - b.xEmu)
  return yDiff <= avgHeight * SIDE_BY_SIDE_Y_TOLERANCE_RATIO && xDiff >= avgWidth * SIDE_BY_SIDE_X_MIN_RATIO
}

/** 2矩形の合成した左右端がスライド幅のこの比率以内まで迫っていれば「左右の余白をほぼ持たない」＝ bleed とみなす */
const BLEED_MARGIN_RATIO = 0.03

/** `slideSize` が無いと全面判定の基準（スライド幅）が無く確信を持てないため、常に `two-column` 側に倒す
 * （bleed は誤ると全面レイアウトに変わってしまい two-column より影響が大きいため、より保守的な方を既定にする） */
function isFullBleedPair(a: ResolvedRect, b: ResolvedRect, slideSize: SlideSize | null): boolean {
  if (!slideSize || slideSize.widthEmu <= 0) return false
  const left = Math.min(a.xEmu, b.xEmu)
  const right = Math.max(a.xEmu + a.cxEmu, b.xEmu + b.cxEmu)
  const margin = slideSize.widthEmu * BLEED_MARGIN_RATIO
  return left <= margin && right >= slideSize.widthEmu - margin
}

/**
 * 1枚の slideLayout を判定する。確信が持てない構成は `undefined`（未割当のまま）。
 * ルールは確信度の高い順に評価し、最初に一致したものを採る（issue #372 の「判定規則の起点」）。
 */
function classifySlideLayout(layout: SlideLayoutProfile, slideSize: SlideSize | null): { slot: LayoutAssignmentSlot; confidence: Confidence } | undefined {
  const titles = layout.placeholders.filter((p) => p.kind === 'title')
  const bodies = layout.placeholders.filter((p) => p.kind === 'body')

  // OOXML 標準の表紙レイアウト種別。サブタイトル（body）の有無に関わらず表紙として扱う
  if (layout.layoutType === 'title') return { slot: 'center', confidence: Confidence.LayoutTypeTitle }

  // タイトルのみ（body 無し）: 表紙系。全面塗りの背景を持つなら大メッセージ（message-inverse）の候補
  if (titles.length === 1 && bodies.length === 0) {
    return { slot: layout.backgroundColorHex ? 'center/message-inverse' : 'center', confidence: Confidence.PlaceholderShape }
  }

  // タイトル + body が1つずつ: 本文スライド
  if (titles.length === 1 && bodies.length === 1) return { slot: 'content', confidence: Confidence.PlaceholderShape }

  // body が2つで矩形が横並び: 2カラム、余白が無ければ全面（bleed）
  if (bodies.length === 2) {
    const [a, b] = bodies
    if (hasRect(a) && hasRect(b) && areSideBySide(a, b)) {
      const slot = isFullBleedPair(a, b, slideSize) ? 'bleed' : 'two-column'
      return { slot, confidence: Confidence.RectLayout }
    }
  }

  return undefined
}

/** 同じ枠に複数のレイアウトが該当した場合、確度が高い方（`confidence` が小さい方。同点は走査順が早い方）を
 * 採り、もう一方は未割当のままにする（枠は1対1で埋まる想定・issue #372 の実装ステップ3）。
 * `candidates` は既に masterIndex→layoutIndex の昇順（走査順）で渡ってくるため、同点（confidence が等しい）
 * の場合は `!current`（先に来た方が bestBySlot に残る）だけで自然に「走査順が早い方」になる。
 * 明示的な order フィールドでの tie-break は不要 */
function resolveSlotConflicts(candidates: SlotCandidate[]): Record<string, LayoutAssignmentSlot> {
  const bestBySlot = new Map<LayoutAssignmentSlot, SlotCandidate>()
  for (const candidate of candidates) {
    const current = bestBySlot.get(candidate.slot)
    if (!current || candidate.confidence < current.confidence) bestBySlot.set(candidate.slot, candidate)
  }
  return Object.fromEntries([...bestBySlot.values()].map((c) => [c.key, c.slot]))
}

/**
 * `profile` の全 slideLayout から `layoutAssignments` の推薦値を作る純関数。
 * `overrides` は見ない（人の上書きとの合成は `mergeLayoutAssignments` の責務）。
 * 確信が持てないレイアウトはキー自体を含めない（省略＝未割当）。
 */
export function recommendLayoutAssignments(profile: BrandProfile): Record<string, LayoutAssignmentSlot> {
  const candidates: SlotCandidate[] = []
  for (const [masterIndex, master] of profile.masters.entries()) {
    for (const [layoutIndex, layout] of master.slideLayouts.entries()) {
      const result = classifySlideLayout(layout, profile.slideSize)
      if (result) candidates.push({ key: `${masterIndex}:${layoutIndex}`, slot: result.slot, confidence: result.confidence })
    }
  }
  return resolveSlotConflicts(candidates)
}

/**
 * 推薦（`recommended`）と人の上書き（`manual`。`BrandOverrides.layoutAssignments`）を合成する。
 * **人の上書きが常に推薦より優先される**: `manual` にキーが存在すれば（値が `null` の明示的な未割当を含む）
 * そのキーは推薦を無視して `manual` の値をそのまま採る。さらに、推薦の枠が既に別キーの `manual` で
 * 占有されている場合はその推薦を落とす（枠は1対1のため、人が明示的に選んだ枠に推薦が横から入り込まない）。
 */
export function mergeLayoutAssignments(recommended: Record<string, LayoutAssignmentSlot>, manual: Record<string, LayoutAssignmentSlot | null> | undefined): Record<string, LayoutAssignmentSlot | null> {
  const manualSlots = new Set(Object.values(manual ?? {}).filter((slot): slot is LayoutAssignmentSlot => slot !== null))
  const merged: Record<string, LayoutAssignmentSlot | null> = {}
  for (const [key, slot] of Object.entries(recommended)) {
    if (manual && key in manual) continue
    if (manualSlots.has(slot)) continue
    merged[key] = slot
  }
  return { ...merged, ...manual }
}

export interface LayoutAssignmentCounts {
  /** 人の上書きが無く、推薦がそのまま採用された件数 */
  recommended: number
  /** 人が明示的に枠を選んだ件数（`null` の明示的な未割当は含まない） */
  overridden: number
  /** 上記いずれにも当たらない件数（推薦が無い、推薦が枠競合で落ちた、人が明示的に未割当を選んだ、等） */
  unassigned: number
}

/** `report.fields['layoutAssignments']`（issue #372 の実装ステップ5）の集計。`merged`（`mergeLayoutAssignments`
 * の結果）を呼び出し元から受け取ることで、`recommendLayoutAssignments`（masters×slideLayouts の全走査）を
 * 再計算しない。`compile.ts` は `resolveAssignedLayouts` で計算済みの `merged` をそのまま渡す */
export function countMergedLayoutAssignments(profile: BrandProfile, manual: Record<string, LayoutAssignmentSlot | null> | undefined, merged: Record<string, LayoutAssignmentSlot | null>): LayoutAssignmentCounts {
  let total = 0
  let recommendedCount = 0
  let overriddenCount = 0
  for (const [masterIndex, master] of profile.masters.entries()) {
    for (const layoutIndex of master.slideLayouts.keys()) {
      total++
      const key = `${masterIndex}:${layoutIndex}`
      const manualSlot = manual?.[key]
      if (manualSlot !== undefined) {
        if (manualSlot !== null && LAYOUT_ASSIGNMENT_SLOTS.includes(manualSlot)) overriddenCount++
      } else if (merged[key]) {
        recommendedCount++
      }
    }
  }
  return { recommended: recommendedCount, overridden: overriddenCount, unassigned: total - recommendedCount - overriddenCount }
}

/** `countMergedLayoutAssignments` の便利版。`merged` を持たない呼び出し元（テスト等）向けに、推薦と
 * 合成をこの場で計算する */
export function countLayoutAssignments(profile: BrandProfile, manual: Record<string, LayoutAssignmentSlot | null> | undefined): LayoutAssignmentCounts {
  return countMergedLayoutAssignments(profile, manual, mergeLayoutAssignments(recommendLayoutAssignments(profile), manual))
}
