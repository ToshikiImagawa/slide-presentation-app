import { useEffect, useState, type RefObject } from 'react'
import { getVisualCheckWarnings, waitForImagesToSettle, waitForLayoutToSettle } from '../visualChecks'

/**
 * 現在表示中のスライド（`section.present`）を実測し、はみ出し・セーフエリア侵入・マスター装飾との
 * 重なりの警告を返す（#209）。deckRef は useReveal の戻り値（`.reveal` コンテナへの ref）を渡す。
 *
 * 実測前に2つを待つ（inspect-reference-deck.mjs と同じ待ちを共有する）:
 * - `waitForImagesToSettle`: 読み込み確定前は `<img>` が display:none のため画像を含むレイアウトが最終形と異なる
 * - `waitForLayoutToSettle`: Reveal.js 自身のレイアウト・スケール再計算が収束する前に測ると数px ずれる（#297）
 * fadeInUp 等のアニメーションは待たない。getVisualCheckWarnings が実測直前に最終状態へ強制するため（#297）。
 */
export function useVisualCheckWarnings(deckRef: RefObject<HTMLElement | null>, currentIndex: number): string[] {
  const [warnings, setWarnings] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    const section = deckRef.current?.querySelector<HTMLElement>('section.present')
    if (!section) {
      setWarnings([])
      return
    }
    Promise.all([waitForImagesToSettle(section), waitForLayoutToSettle(section)]).then(([images, layout]) => {
      if (images.timedOut) {
        console.warn('[visualCheck] 画像の読み込み確定待ちがタイムアウトしました。実測結果が不正確な可能性があります')
      }
      if (layout.timedOut) {
        console.warn('[visualCheck] レイアウトの収束待ちがタイムアウトしました。実測結果が不正確な可能性があります')
      }
      if (!cancelled) setWarnings(getVisualCheckWarnings(section))
    })
    return () => {
      cancelled = true
    }
  }, [deckRef, currentIndex])

  return warnings
}
