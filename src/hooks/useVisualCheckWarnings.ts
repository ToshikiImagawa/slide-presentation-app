import { useEffect, useState, type RefObject } from 'react'
import { getVisualCheckWarnings, waitForAnimationsToSettle, waitForImagesToSettle } from '../visualChecks'

/**
 * 現在表示中のスライド（`section.present`）を実測し、はみ出し・セーフエリア侵入・マスター装飾との
 * 重なりの警告を返す（#209）。deckRef は useReveal の戻り値（`.reveal` コンテナへの ref）を渡す。
 *
 * 実測前にレイアウトが最終形になるのを待つ。固定の待ち時間ではなく完了そのものを待つことで、
 * 実行環境の速さに左右されない（inspect-reference-deck.mjs と同じ待ちを共有する）:
 * - `waitForImagesToSettle`: 読み込み確定前は `<img>` が display:none のため画像を含むレイアウトが最終形と異なる
 * - `waitForAnimationsToSettle`: fadeInUp 等の途中の座標を拾うと誤検知になる（translateY 分だけ侵入と報告される）
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
    Promise.all([waitForImagesToSettle(section), waitForAnimationsToSettle(section)]).then(() => {
      if (!cancelled) setWarnings(getVisualCheckWarnings(section))
    })
    return () => {
      cancelled = true
    }
  }, [deckRef, currentIndex])

  return warnings
}
