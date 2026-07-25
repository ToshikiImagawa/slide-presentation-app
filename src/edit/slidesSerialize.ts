import type { PresentationData, ValidationError } from '../data/types'
import { getValidationErrors } from '../data/loader'

// 構文エラー時に返す空の器（呼び出し側は errors を確認してから data を使う）
function emptyPresentation(): PresentationData {
  return { meta: { title: '' }, slides: [] }
}

/**
 * JSON テキストを PresentationData へパースする（無損失往復の入口）。
 *
 * - JSON 構文エラー時は例外を投げず、errors に構造化エラー（path=''）を積み、data は空の器を返す。
 * - 構文的に妥当なら getValidationErrors でスキーマ検証し、エラーを errors で通知する。
 *   未知キー（left/right/steps/tiles/codeBlock 等）・文字列内の HTML・意味を持つ空白は
 *   JSON.parse がそのまま JS オブジェクトへ載せるため保持される（FR-004 / NFR-002）。
 */
export function parseSlides(text: string): { data: PresentationData; errors: ValidationError[] } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return {
      data: emptyPresentation(),
      errors: [{ path: '', message: `JSON 構文エラー: ${message}`, expected: '妥当な JSON', actual: '解析不能なテキスト' }],
    }
  }

  const errors = getValidationErrors(parsed)
  // スキーマ検証エラーがあっても data はそのまま返す（未知キー保持のため。呼び出し側が errors を見て判断する）
  return { data: parsed as PresentationData, errors }
}

/**
 * PresentationData を JSON テキストへシリアライズする（無損失往復の出口）。
 *
 * - インデントはスペース2固定。
 * - キー順はオブジェクトのプロパティ順（JSON.parse が保持した順）をそのまま出力するため、
 *   編集していないフィールドが不要に差分化しない（差分最小化）。
 * - 未知キー・customCSS・任意 component props・fragment 制御も通常のプロパティとしてそのまま書き戻す（FR-004）。
 */
export function serializeSlides(data: PresentationData): string {
  return JSON.stringify(data, null, 2)
}

/**
 * JSON テキストを 2 スペース整形へ正規化する（AI 生成結果の適用時など）。
 *
 * - 構文的に妥当な JSON なら `serializeSlides` と同じ 2 スペースで再整形する（1 行出力の可視性改善・③）。
 * - 構文エラーの場合は例外を投げず**原文をそのまま返す**。検証 NG の候補（exhausted）でも内容を失わず、
 *   器の生 JSON エディタで手直しできるようにするため（FR-008）。
 * - スキーマ検証は行わない（未知キーや部分的に不正な構造も、妥当な JSON でありさえすれば整形する）。
 */
export function prettyPrintJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}
