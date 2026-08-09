import { useEffect, useState, type RefObject } from 'react'
import { getVisualCheckWarnings } from '../visualChecks'

/** スライド切り替え直後の測定を遅らせる時間（ms）。fadeInUp（0.6s）等の遷移アニメーション中は
 * レイアウトが確定していないため、アニメーション完了後の位置で実測する（capture-reference-deck.mjs の
 * sleep(700) と同じ値を採用し、撮影経路と判定基準を揃える） */
const MEASURE_DELAY_MS = 700

/**
 * 現在表示中のスライド（`section.present`）を実測し、はみ出し・セーフエリア侵入・マスター装飾との
 * 重なりの警告を返す（#209）。deckRef は useReveal の戻り値（`.reveal` コンテナへの ref）を渡す。
 */
export function useVisualCheckWarnings(deckRef: RefObject<HTMLElement | null>, currentIndex: number): string[] {
  const [warnings, setWarnings] = useState<string[]>([])

  useEffect(() => {
    const timer = setTimeout(() => {
      const section = deckRef.current?.querySelector<HTMLElement>('section.present')
      setWarnings(section ? getVisualCheckWarnings(section) : [])
    }, MEASURE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [deckRef, currentIndex])

  return warnings
}
