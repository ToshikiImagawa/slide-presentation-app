import { useCallback, useEffect, useRef, useState } from 'react'
import type { SlideData, PresenterControlState, PresenterProgressState, LogoConfig, SectionInfo, ThemeData } from '../data'
import { getSpeakerNotes, getSlideSummary } from '../data'
import { buildSections } from '../sections'
import { useTranslation } from '../i18n'
import { FillProgress } from './FillProgress'
import { SlideRenderer } from './SlideRenderer'
import { resolveCanvasSize } from '../hooks/useReveal'
import styles from './PresenterViewWindow.module.css'

const PREVIEW_GAP = 12
const HEADING_HEIGHT = 30 // h2 の高さ + gap の概算

/** コンテナサイズから aspectRatio 制約付きプレビューレイアウトを計算する（既定は16:9。#188） */
function usePreviewLayout(containerRef: React.RefObject<HTMLDivElement | null>, controlBarRef: React.RefObject<HTMLDivElement | null>, aspectRatio: number) {
  const [layout, setLayout] = useState({ mainContentHeight: 0, rightColumnWidth: 0, previewHeight: 0 })

  const calculate = useCallback(() => {
    const container = containerRef.current
    const controlBar = controlBarRef.current
    if (!container || !controlBar) return

    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight
    const controlBarHeight = controlBar.offsetHeight
    const padding = 12
    const gap = 12

    // コンテナ内の利用可能スペース
    const availableWidth = containerWidth - padding * 2
    const availableHeight = containerHeight - padding * 2 - controlBarHeight - gap * 2 // controlBar + mainContent + summaryPanel の gap

    // プレビュー2つ分の最大高さ（利用可能高さの60%を上限として mainContent に割り当て）
    const maxMainContentHeight = availableHeight * 0.8
    // 各プレビューの最大高さ: (mainContent高さ - gap - 見出し2つ分) / 2
    let previewHeight = (maxMainContentHeight - PREVIEW_GAP - HEADING_HEIGHT * 2) / 2
    let previewWidth = previewHeight * aspectRatio

    // 幅が利用可能幅の半分を超える場合は幅で制約
    const maxPreviewWidth = availableWidth * 0.5
    if (previewWidth > maxPreviewWidth) {
      previewWidth = maxPreviewWidth
      previewHeight = previewWidth / aspectRatio
    }

    const mainContentHeight = previewHeight * 2 + PREVIEW_GAP + HEADING_HEIGHT * 2
    const rightColumnWidth = previewWidth

    setLayout({ mainContentHeight, rightColumnWidth, previewHeight })
  }, [containerRef, controlBarRef, aspectRatio])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    calculate()
    const observer = new ResizeObserver(calculate)
    observer.observe(container)
    return () => observer.disconnect()
  }, [containerRef, calculate])

  return layout
}

type PresenterViewWindowProps = {
  slides: SlideData[]
  currentIndex: number
  logo?: LogoConfig
  theme?: ThemeData
  controlState: PresenterControlState | null
  progressState?: PresenterProgressState
  onNavigate: (direction: 'prev' | 'next') => void
  onAudioToggle: () => void
  onAutoPlayToggle: () => void
  onAutoSlideshowToggle: () => void
  onScrollSpeedChange?: (speed: number) => void
}

export function PresenterViewWindow({ slides, currentIndex, logo, theme, controlState, progressState, onNavigate, onAudioToggle, onAutoPlayToggle, onAutoSlideshowToggle }: PresenterViewWindowProps) {
  const { t } = useTranslation()
  const currentSlide = slides[currentIndex]
  const previousSlide = currentIndex > 0 ? slides[currentIndex - 1] : null
  const nextSlide = currentIndex < slides.length - 1 ? slides[currentIndex + 1] : null
  const speakerNotes = currentSlide ? getSpeakerNotes(currentSlide) : undefined
  const summary = currentSlide ? getSlideSummary(currentSlide) : []
  // プレビューも本編と同じ章情報でマスター装飾を解決する（#191）
  const sections = buildSections(slides)

  const isFirst = currentIndex === 0
  const isLast = currentIndex >= slides.length - 1

  const navPrevLabel = t('presenterView.navPrev')
  const navNextLabel = t('presenterView.navNext')
  const audioLabel = controlState?.hasError ? t('audio.error') : controlState?.isPlaying ? t('audio.stop') : t('audio.play')
  const autoPlayLabel = t('presenterView.autoPlay')
  const autoSlideshowLabel = t('presenterView.autoSlideshow')

  const { width: canvasWidth, height: canvasHeight } = resolveCanvasSize(theme?.canvas)
  const canvasAspectRatio = canvasWidth / canvasHeight

  const containerRef = useRef<HTMLDivElement>(null)
  const controlBarRef = useRef<HTMLDivElement>(null)
  const { mainContentHeight, rightColumnWidth, previewHeight } = usePreviewLayout(containerRef, controlBarRef, canvasAspectRatio)

  // キーボード操作
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        onNavigate('next')
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        onNavigate('prev')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onNavigate])

  return (
    <div ref={containerRef} className={styles.container} data-testid="presenter-view">
      {/* 上部コントロールバー */}
      <div ref={controlBarRef} className={styles.controlBar}>
        <div className={styles.navControls}>
          <button className={styles.navButton} onClick={() => onNavigate('prev')} disabled={isFirst} title={navPrevLabel} aria-label={navPrevLabel}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </svg>
          </button>
          <span className={styles.slideProgress}>
            {currentIndex + 1} / {slides.length}
          </span>
          <button className={styles.navButton} onClick={() => onNavigate('next')} disabled={isLast} title={navNextLabel} aria-label={navNextLabel}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
            </svg>
          </button>
        </div>
        <div className={styles.audioControls}>
          <button
            className={`${styles.audioButton} ${controlState?.hasError ? styles.audioError : controlState?.isPlaying ? styles.active : ''}`}
            onClick={onAudioToggle}
            disabled={!controlState?.hasVoice || controlState?.hasError}
            title={audioLabel}
            aria-label={audioLabel}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              {controlState?.hasError ? (
                <>
                  <path d="M3 9v6h4l5 5V4L7 9H3z" />
                  <path d="M16.5 12l3.5-3.5-1.4-1.4L15.1 10.6 11.6 7.1 10.2 8.5l3.5 3.5-3.5 3.5 1.4 1.4 3.5-3.5 3.5 3.5 1.4-1.4z" />
                </>
              ) : controlState?.isPlaying ? (
                <>
                  <path d="M3 9v6h4l5 5V4L7 9H3z" />
                  <path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                  <path d="M14 7.97v8.06c1.48-.73 2.5-2.25 2.5-3.97 0-1.72-1.02-3.24-2.5-3.97V7.97z" />
                </>
              ) : (
                <path d="M3 9v6h4l5 5V4L7 9H3z" />
              )}
            </svg>
          </button>
          <button className={`${styles.audioButton} ${controlState?.autoPlay ? styles.active : ''}`} onClick={onAutoPlayToggle} title={autoPlayLabel} aria-label={autoPlayLabel}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span className={styles.autoLabel}>A</span>
          </button>
          <div className={styles.buttonWrapper}>
            <button className={`${styles.audioButton} ${controlState?.autoSlideshow ? styles.active : ''}`} onClick={onAutoSlideshowToggle} title={autoSlideshowLabel} aria-label={autoSlideshowLabel}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
              </svg>
              <span className={styles.autoLabel}>A</span>
            </button>
            <FillProgress progress={progressState?.progress ?? 0} visible={progressState?.visible ?? false} animationDuration={progressState?.animationDuration} resetKey={currentIndex} paused={progressState?.paused} />
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className={styles.mainContent} style={{ height: mainContentHeight > 0 ? mainContentHeight : undefined }}>
        {/* 左: スピーカーノート */}
        <div className={styles.notesPanel}>
          <h2>{t('presenterView.notesTitle')}</h2>
          {speakerNotes ? <div className={styles.notesText}>{speakerNotes}</div> : <div className={styles.notesEmpty}>{t('presenterView.notesEmpty')}</div>}
        </div>

        {/* 右: プレビューカラム */}
        <div className={styles.rightColumn} style={{ width: rightColumnWidth > 0 ? rightColumnWidth : undefined }}>
          {/* 次スライドプレビュー */}
          <div className={styles.previewPanel}>
            <h2>{t('presenterView.nextSlide')}</h2>
            <div className={styles.previewFrame} style={{ height: previewHeight > 0 ? previewHeight : undefined, aspectRatio: canvasAspectRatio }}>
              {nextSlide ? <PreviewSlide slide={nextSlide} logo={logo} theme={theme} index={currentIndex + 1} total={slides.length} sections={sections} /> : <div className={styles.boundaryMessage}>{t('presenterView.lastSlide')}</div>}
            </div>
          </div>

          {/* 前スライドプレビュー */}
          <div className={styles.previewPanel}>
            <h2>{t('presenterView.previousSlide')}</h2>
            <div className={styles.previewFrame} style={{ height: previewHeight > 0 ? previewHeight : undefined, aspectRatio: canvasAspectRatio }}>
              {previousSlide ? (
                <PreviewSlide slide={previousSlide} logo={logo} theme={theme} index={currentIndex - 1} total={slides.length} sections={sections} />
              ) : (
                <div className={styles.boundaryMessage}>{t('presenterView.firstSlide')}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* フッター: 要点サマリー */}
      <div className={styles.summaryPanel}>
        <h2>{t('presenterView.summaryTitle')}</h2>
        {summary.length > 0 ? (
          <ul className={styles.summaryList}>
            {summary.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        ) : (
          <div className={styles.notesEmpty}>{t('presenterView.summaryEmpty')}</div>
        )}
      </div>
    </div>
  )
}

/** スライドの縮小プレビュー */
function PreviewSlide({ slide, logo, theme, index, total, sections }: { slide: SlideData; logo?: LogoConfig; theme?: ThemeData; index: number; total: number; sections?: SectionInfo[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.3)
  const { width: canvasWidth, height: canvasHeight } = resolveCanvasSize(theme?.canvas)

  useEffect(() => {
    if (!containerRef.current) return
    const parent = containerRef.current.parentElement
    if (!parent) return

    const updateScale = () => {
      const parentWidth = parent.clientWidth
      const parentHeight = parent.clientHeight
      const scaleX = parentWidth / canvasWidth
      const scaleY = parentHeight / canvasHeight
      setScale(Math.min(scaleX, scaleY))
    }

    updateScale()
    const observer = new ResizeObserver(updateScale)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [canvasWidth, canvasHeight])

  const canvasVars = { '--preview-canvas-width': `${canvasWidth}px`, '--preview-canvas-height': `${canvasHeight}px` } as React.CSSProperties

  return (
    <div ref={containerRef} className={styles.previewScaler} style={{ ...canvasVars, transform: `scale(${scale})` }}>
      <div className={`reveal ${styles.previewReveal}`}>
        <div className="slides">
          <SlideRenderer.Slide slide={slide} logo={logo} theme={theme} index={index} total={total} sections={sections} />
        </div>
      </div>
    </div>
  )
}
