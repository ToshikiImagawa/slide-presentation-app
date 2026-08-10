import { useEffect, useState, type RefObject } from 'react'
import { getVisualCheckWarnings, waitForImagesToSettle } from '../visualChecks'

/** スライド切り替え直後の測定を遅らせる時間（ms）。`.content-area` の fadeInUp（global.css）は
 * animation-delay 0.15s + duration 0.6s = 完了まで計750ms かかるため、それより十分な余裕を持たせる
 * （700ms では CI 実測でアニメーション途中の位置を拾って誤検知した・inspect-reference-deck.mjs と同じ値） */
const MEASURE_DELAY_MS = 1000

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
