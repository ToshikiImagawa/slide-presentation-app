import { useCallback, useEffect, useRef } from 'react'
import Reveal from 'reveal.js'

/** Reveal.js の設計解像度（スライドの基準サイズ）。pdfExport.ts もPDFページサイズをこれに合わせる */
export const SLIDE_WIDTH = 1280
export const SLIDE_HEIGHT = 720

export interface UseRevealOptions {
  onSlideChanged?: (event: { indexh: number; indexv: number }) => void
}

export interface UseRevealReturn {
  deckRef: React.RefObject<HTMLDivElement | null>
  getCurrentSlide: () => { indexh: number; indexv: number } | null
  goToNext: () => void
  goToPrev: () => void
}

export function useReveal(options?: UseRevealOptions): UseRevealReturn {
  const deckRef = useRef<HTMLDivElement>(null)
  const deckInstanceRef = useRef<InstanceType<typeof Reveal> | null>(null)
  const onSlideChangedRef = useRef(options?.onSlideChanged)

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
      width: SLIDE_WIDTH,
      height: SLIDE_HEIGHT,
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
    deckInstanceRef.current?.next()
  }, [])

  const goToPrev = useCallback(() => {
    deckInstanceRef.current?.prev()
  }, [])

  return { deckRef, getCurrentSlide, goToNext, goToPrev }
}
