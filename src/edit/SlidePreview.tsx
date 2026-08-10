import { useEffect, useRef, useState } from 'react'
import type { LogoConfig, SectionInfo, SlideData, ThemeData } from '../data'
import { SlideRenderer } from '../components/SlideRenderer'
import { LazyImageContext } from '../components/FallbackImage'
import { resolveCanvasSize } from '../hooks/useReveal'
import styles from './SlidePreview.module.css'

/**
 * スライドを theme.canvas（未指定時は 1280x720）基準で縮小表示するライブプレビュー。
 * 本番と同一の SlideRenderer.Slide を Reveal デッキ外で描画し（DC-001: レンダラを再実装しない）、
 * 親要素サイズに追従して transform: scale する。編集内容は props 更新で差分再描画され、
 * presentationKey による App 全再マウント（Reveal 全再初期化）を伴わない（NFR-004）。
 * Reveal インスタンスを持たないため viewDistance による data-src → src 昇格が走らず、
 * FallbackImage の遅延読み込みに乗せると画像が永久に表示されない。LazyImageContext で
 * 即時読み込みに切り替える（#224）。
 */
export function SlidePreview({ slide, logo, theme, index, total, sections }: { slide: SlideData; logo?: LogoConfig; theme?: ThemeData; index: number; total: number; sections: SectionInfo[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.3)
  const { width: canvasWidth, height: canvasHeight } = resolveCanvasSize(theme?.canvas)

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
          <LazyImageContext.Provider value={false}>
            <SlideRenderer.Slide slide={slide} logo={logo} theme={theme} index={index} total={total} sections={sections} />
          </LazyImageContext.Provider>
        </div>
      </div>
    </div>
  )
}
