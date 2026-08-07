import { useEffect, useRef, useState } from 'react'
import type { LogoConfig, SlideData, ThemeData } from '../data'
import { SlideRenderer } from '../components/SlideRenderer'
import { SLIDE_WIDTH, SLIDE_HEIGHT } from '../hooks/useReveal'
import styles from './SlidePreview.module.css'

/**
 * スライドを theme.canvas（未指定時は 1280x720）基準で縮小表示するライブプレビュー。
 * 本番と同一の SlideRenderer.Slide を Reveal デッキ外で描画し（DC-001: レンダラを再実装しない）、
 * 親要素サイズに追従して transform: scale する。編集内容は props 更新で差分再描画され、
 * presentationKey による App 全再マウント（Reveal 全再初期化）を伴わない（NFR-004）。
 */
export function SlidePreview({ slide, logo, theme, index, total }: { slide: SlideData; logo?: LogoConfig; theme?: ThemeData; index: number; total: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.3)
  const canvasWidth = theme?.canvas?.width ?? SLIDE_WIDTH
  const canvasHeight = theme?.canvas?.height ?? SLIDE_HEIGHT

  useEffect(() => {
    if (!containerRef.current) return
    const parent = containerRef.current.parentElement
    if (!parent) return

    const updateScale = () => {
      const scaleX = parent.clientWidth / canvasWidth
      const scaleY = parent.clientHeight / canvasHeight
      setScale(Math.min(scaleX, scaleY))
    }

    updateScale()
    const observer = new ResizeObserver(updateScale)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [canvasWidth, canvasHeight])

  const canvasVars = { '--preview-canvas-width': `${canvasWidth}px`, '--preview-canvas-height': `${canvasHeight}px` } as React.CSSProperties

  return (
    <div ref={containerRef} className={styles.previewScaler} style={{ ...canvasVars, transform: `translate(-50%, -50%) scale(${scale})` }}>
      <div className={`reveal ${styles.previewReveal}`}>
        <div className="slides">
          <SlideRenderer.Slide slide={slide} logo={logo} theme={theme} index={index} total={total} />
        </div>
      </div>
    </div>
  )
}
