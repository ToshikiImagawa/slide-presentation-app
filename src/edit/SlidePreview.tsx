import { useEffect, useRef, useState } from 'react'
import type { SlideData } from '../data'
import { SlideRenderer } from '../components/SlideRenderer'
import styles from './SlidePreview.module.css'

/**
 * スライドを 1280x720 基準で縮小表示するライブプレビュー。
 * 本番と同一の SlideRenderer.Slide を Reveal デッキ外で描画し（DC-001: レンダラを再実装しない）、
 * 親要素サイズに追従して transform: scale する。編集内容は props 更新で差分再描画され、
 * presentationKey による App 全再マウント（Reveal 全再初期化）を伴わない（NFR-004）。
 */
export function SlidePreview({ slide }: { slide: SlideData }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.3)

  useEffect(() => {
    if (!containerRef.current) return
    const parent = containerRef.current.parentElement
    if (!parent) return

    const updateScale = () => {
      const scaleX = parent.clientWidth / 1280
      const scaleY = parent.clientHeight / 720
      setScale(Math.min(scaleX, scaleY))
    }

    updateScale()
    const observer = new ResizeObserver(updateScale)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={containerRef} className={styles.previewScaler} style={{ transform: `scale(${scale})` }}>
      <div className={`reveal ${styles.previewReveal}`}>
        <div className="slides">
          <SlideRenderer.Slide slide={slide} />
        </div>
      </div>
    </div>
  )
}
