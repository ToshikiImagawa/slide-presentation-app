import { useCallback, useEffect, useRef } from 'react'
import Reveal from 'reveal.js'
import type { CanvasData } from '../data'

/** Reveal.js の設計解像度（スライドの基準サイズ）。pdfExport.ts もPDFページサイズをこれに合わせる */
export const SLIDE_WIDTH = 1280
export const SLIDE_HEIGHT = 720

/** テーマの canvas から実際のキャンバスサイズ（px）を解決する。未指定時は SLIDE_WIDTH/SLIDE_HEIGHT（現行と完全同一）。
 * SlidePreview・PresenterViewWindow の縮小表示スケーラーが共通で使う（#188） */
export function resolveCanvasSize(canvas?: CanvasData): { width: number; height: number } {
  return { width: canvas?.width ?? SLIDE_WIDTH, height: canvas?.height ?? SLIDE_HEIGHT }
}

export interface UseRevealOptions {
  onSlideChanged?: (event: { indexh: number; indexv: number }) => void
  /** キャンバスサイズ（px）。テーマの canvas 未指定時は SLIDE_WIDTH/SLIDE_HEIGHT（現行と完全同一） */
  canvasWidth?: number
  canvasHeight?: number
}

export interface UseRevealReturn {
  deckRef: React.RefObject<HTMLDivElement | null>
  getCurrentSlide: () => { indexh: number; indexv: number } | null
  goToNext: () => void
  goToPrev: () => void
  /** PDF書き出し中（src/pdfExport.ts が .present を直接操作する間）はナビゲーションを止める */
  setNavigationLocked: (locked: boolean) => void
}

export function useReveal(options?: UseRevealOptions): UseRevealReturn {
  const deckRef = useRef<HTMLDivElement>(null)
  const deckInstanceRef = useRef<InstanceType<typeof Reveal> | null>(null)
  const onSlideChangedRef = useRef(options?.onSlideChanged)
  const navigationLockedRef = useRef(false)

  // コールバックの最新値を ref に保持（stale closure 回避）
  useEffect(() => {
    onSlideChangedRef.current = options?.onSlideChanged
  }, [options?.onSlideChanged])

  useEffect(() => {
    if (!deckRef.current) return

    // hash:true は初期化時に URL ハッシュ（#/3 等）の位置へジャンプする。App は presentation ごとに
    // key で作り直されるため、この初期化エフェクトが「新規開始」の境界になる。前のスライドの表示位置を
    // 引き継がないよう、initialize の直前でハッシュをクリアして必ず先頭スライドから開始する。
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }

    const deck = new Reveal(deckRef.current, {
      width: options?.canvasWidth ?? SLIDE_WIDTH,
      height: options?.canvasHeight ?? SLIDE_HEIGHT,
      margin: 0,
      minScale: 0.2,
      maxScale: 2.0,
      center: false,
      controls: true,
      slideNumber: 'c/t',
      hash: true,
      transition: 'slide',
      progress: true,
      keyboard: true,
      // Reveal 組み込みのヘルプオーバーレイを無効化する。ショートカット一覧はアプリ側の
      // ShortcutsDialog を唯一の真実源にしているため（英語固定・アプリ独自キーを含まない
      // Reveal の一覧が ? や F1 で開くのを防ぐ）。/ による一時停止は Reveal 既定のまま残す
      help: false,
      touch: true,
      navigationMode: 'linear',
    })

    deck.initialize()
    deckInstanceRef.current = deck

    const handleSlideChanged = () => {
      if (onSlideChangedRef.current) {
        const indices = deck.getIndices()
        onSlideChangedRef.current({ indexh: indices.h, indexv: indices.v })
      }
    }

    deck.on('slidechanged', handleSlideChanged)

    return () => {
      deck.off('slidechanged', handleSlideChanged)
      deck.destroy()
      deckInstanceRef.current = null
    }
  }, [])

  const getCurrentSlide = useCallback((): { indexh: number; indexv: number } | null => {
    if (!deckInstanceRef.current) return null
    const indices = deckInstanceRef.current.getIndices()
    return { indexh: indices.h, indexv: indices.v }
  }, [])

  const goToNext = useCallback(() => {
    if (navigationLockedRef.current) return
    deckInstanceRef.current?.next()
  }, [])

  const goToPrev = useCallback(() => {
    if (navigationLockedRef.current) return
    deckInstanceRef.current?.prev()
  }, [])

  // goToNext/goToPrev（発表者ビュー経由等）と、Reveal.js 組み込みのキーボード操作（矢印キー等、
  // Reveal内部が直接処理しこのフックの外を通る）の両方をロックする必要がある。
  // keyboardCondition は Reveal.js がキー入力ごとに動的評価する唯一の公式フックのため、これで塞ぐ
  const setNavigationLocked = useCallback((locked: boolean) => {
    navigationLockedRef.current = locked
    deckInstanceRef.current?.configure({ keyboardCondition: locked ? () => false : undefined })
  }, [])

  return { deckRef, getCurrentSlide, goToNext, goToPrev, setNavigationLocked }
}
