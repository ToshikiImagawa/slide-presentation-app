import { useEffect, useState, type RefObject } from 'react'
import { getVisualCheckWarnings, waitForImagesToSettle } from '../visualChecks'

/** スライド切り替え直後の測定を遅らせる時間（ms）。fadeInUp（0.6s）等の遷移アニメーション中は
 * レイアウトが確定していないため、アニメーション完了後の位置で実測する（capture-reference-deck.mjs の
 * sleep(700) と同じ値を採用し、撮影経路と判定基準を揃える） */
const MEASURE_DELAY_MS = 700

/**
 * 現在表示中のスライド（`section.present`）を実測し、はみ出し・セーフエリア侵入・マスター装飾との
 * 重なりの警告を返す（#209）。deckRef は useReveal の戻り値（`.reveal` コンテナへの ref）を渡す。
 * 実測前に画像の読み込み確定を待つ（waitForImagesToSettle）: 確定前は `<img>` が display:none のため、
 * 画像を含むレイアウトが最終形と異なり誤検知の原因になる。
 */
export function useVisualCheckWarnings(deckRef: RefObject<HTMLElement | null>, currentIndex: number): string[] {
  const [warnings, setWarnings] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      const section = deckRef.current?.querySelector<HTMLElement>('section.present')
      if (!section) {
        setWarnings([])
        return
      }
      waitForImagesToSettle(section).then(() => {
        if (!cancelled) setWarnings(getVisualCheckWarnings(section))
      })
    }, MEASURE_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [deckRef, currentIndex])

  return warnings
}
