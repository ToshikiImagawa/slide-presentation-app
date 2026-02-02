import { useCallback, useEffect, useRef, useState } from 'react'
import type { SlideData, PresenterControlState } from '../data'
import { getSpeakerNotes, getSlideSummary } from '../data'
import { useTranslation } from '../i18n'
import { FillProgress } from './FillProgress'
import { SlideRenderer } from './SlideRenderer'
import styles from './PresenterViewWindow.module.css'

const ASPECT_RATIO = 16 / 9
const PREVIEW_GAP = 12
const HEADING_HEIGHT = 30 // h2 の高さ + gap の概算

/** コンテナサイズから16:9制約付きプレビューレイアウトを計算する */
function usePreviewLayout(containerRef: React.RefObject<HTMLDivElement | null>, controlBarRef: React.RefObject<HTMLDivElement | null>) {
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
    let previewWidth = previewHeight * ASPECT_RATIO

    // 幅が利用可能幅の半分を超える場合は幅で制約
    const maxPreviewWidth = availableWidth * 0.5
    if (previewWidth > maxPreviewWidth) {
      previewWidth = maxPreviewWidth
      previewHeight = previewWidth / ASPECT_RATIO
    }

    const mainContentHeight = previewHeight * 2 + PREVIEW_GAP + HEADING_HEIGHT * 2
    const rightColumnWidth = previewWidth

    setLayout({ mainContentHeight, rightColumnWidth, previewHeight })
  }, [containerRef, controlBarRef])

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
  controlState: PresenterControlState | null
  progressState?: { progress: number; visible: boolean; animationDuration?: number }
  onNavigate: (direction: 'prev' | 'next') => void
  onAudioToggle: () => void
  onAutoPlayToggle: () => void
  onAutoSlideshowToggle: () => void
  onScrollSpeedChange?: (speed: number) => void
}

export function PresenterViewWindow({ slides, currentIndex, controlState, progressState, onNavigate, onAudioToggle, onAutoPlayToggle, onAutoSlideshowToggle }: PresenterViewWindowProps) {
  const { t } = useTranslation()
  const currentSlide = slides[currentIndex]
  const previousSlide = currentIndex > 0 ? slides[currentIndex - 1] : null
  const nextSlide = currentIndex < slides.length - 1 ? slides[currentIndex + 1] : null
  const speakerNotes = currentSlide ? getSpeakerNotes(currentSlide) : undefined
  const summary = currentSlide ? getSlideSummary(currentSlide) : []

  const isFirst = currentIndex === 0
  const isLast = currentIndex >= slides.length - 1

  const containerRef = useRef<HTMLDivElement>(null)
  const controlBarRef = useRef<HTMLDivElement>(null)
  const { mainContentHeight, rightColumnWidth, previewHeight } = usePreviewLayout(containerRef, controlBarRef)

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
    <div ref={containerRef} className={styles.container}>
      {/* 上部コントロールバー */}
      <div ref={controlBarRef} className={styles.controlBar}>
        <div className={styles.navControls}>
          <button className={styles.navButton} onClick={() => onNavigate('prev')} disabled={isFirst} title={t('presenterView.navPrev')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </svg>
          </button>
          <span className={styles.slideProgress}>
            {currentIndex + 1} / {slides.length}
          </span>
          <button className={styles.navButton} onClick={() => onNavigate('next')} disabled={isLast} title={t('presenterView.navNext')}>
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
            title={controlState?.hasError ? t('audio.error') : controlState?.isPlaying ? t('audio.stop') : t('audio.play')}
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
          <button className={`${styles.audioButton} ${controlState?.autoPlay ? styles.active : ''}`} onClick={onAutoPlayToggle} title={t('presenterView.autoPlay')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span className={styles.autoLabel}>A</span>
          </button>
          <div className={styles.buttonWrapper}>
            <button className={`${styles.audioButton} ${controlState?.autoSlideshow ? styles.active : ''}`} onClick={onAutoSlideshowToggle} title={t('presenterView.autoSlideshow')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
              </svg>
              <span className={styles.autoLabel}>A</span>
            </button>
            <FillProgress progress={progressState?.progress ?? 0} visible={progressState?.visible ?? false} animationDuration={progressState?.animationDuration} resetKey={currentIndex} />
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
            <div className={styles.previewFrame} style={{ height: previewHeight > 0 ? previewHeight : undefined, aspectRatio: '16 / 9' }}>
              {nextSlide ? <PreviewSlide slide={nextSlide} /> : <div className={styles.boundaryMessage}>{t('presenterView.lastSlide')}</div>}
            </div>
          </div>

          {/* 前スライドプレビュー */}
          <div className={styles.previewPanel}>
            <h2>{t('presenterView.previousSlide')}</h2>
            <div className={styles.previewFrame} style={{ height: previewHeight > 0 ? previewHeight : undefined, aspectRatio: '16 / 9' }}>
              {previousSlide ? <PreviewSlide slide={previousSlide} /> : <div className={styles.boundaryMessage}>{t('presenterView.firstSlide')}</div>}
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
function PreviewSlide({ slide }: { slide: SlideData }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.3)

  useEffect(() => {
    if (!containerRef.current) return
    const parent = containerRef.current.parentElement
    if (!parent) return

    const updateScale = () => {
      const parentWidth = parent.clientWidth
      const parentHeight = parent.clientHeight
      const scaleX = parentWidth / 1280
      const scaleY = parentHeight / 720
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
