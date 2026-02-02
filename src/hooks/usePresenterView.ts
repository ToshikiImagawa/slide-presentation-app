import { useCallback, useEffect, useRef, useState } from 'react'
import type { SlideData, PresenterViewMessage, PresenterControlState } from '../data'

const CHANNEL_NAME = 'presenter-view'

export interface UsePresenterViewOptions {
  slides: SlideData[]
  onNavigate?: (direction: 'prev' | 'next') => void
  onAudioToggle?: () => void
  onAutoPlayToggle?: () => void
  onAutoSlideshowToggle?: () => void
  onScrollSpeedChange?: (speed: number) => void
}

export interface UsePresenterViewReturn {
  openPresenterView: () => void
  isOpen: boolean
  sendSlideState: (currentIndex: number) => void
  sendControlState: (state: PresenterControlState) => void
  sendProgressState: (progress: number, visible: boolean, animationDuration?: number) => void
}

export function usePresenterView({ slides, onNavigate, onAudioToggle, onAutoPlayToggle, onAutoSlideshowToggle, onScrollSpeedChange }: UsePresenterViewOptions): UsePresenterViewReturn {
  const [isOpen, setIsOpen] = useState(false)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const windowRef = useRef<Window | null>(null)

  // コールバックを useRef で保持（stale closure 回避）
  const onNavigateRef = useRef(onNavigate)
  const onAudioToggleRef = useRef(onAudioToggle)
  const onAutoPlayToggleRef = useRef(onAutoPlayToggle)
  const onAutoSlideshowToggleRef = useRef(onAutoSlideshowToggle)
  const onScrollSpeedChangeRef = useRef(onScrollSpeedChange)
  const latestControlStateRef = useRef<PresenterControlState | null>(null)

  useEffect(() => {
    onNavigateRef.current = onNavigate
  }, [onNavigate])
  useEffect(() => {
    onAudioToggleRef.current = onAudioToggle
  }, [onAudioToggle])
  useEffect(() => {
    onAutoPlayToggleRef.current = onAutoPlayToggle
  }, [onAutoPlayToggle])
  useEffect(() => {
    onAutoSlideshowToggleRef.current = onAutoSlideshowToggle
  }, [onAutoSlideshowToggle])
  useEffect(() => {
    onScrollSpeedChangeRef.current = onScrollSpeedChange
  }, [onScrollSpeedChange])

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME)
    channelRef.current = channel

    channel.onmessage = (event: MessageEvent<PresenterViewMessage>) => {
      const msg = event.data
      if (msg.type === 'presenterViewReady') {
        setIsOpen(true)
        const message: PresenterViewMessage = { type: 'slideChanged', payload: { currentIndex: 0, slides } }
        channel.postMessage(message)
        // 初期制御状態を送信
        if (latestControlStateRef.current) {
          const controlMessage: PresenterViewMessage = { type: 'controlStateChanged', payload: latestControlStateRef.current }
          channel.postMessage(controlMessage)
        }
      } else if (msg.type === 'presenterViewClosed') {
        setIsOpen(false)
        windowRef.current = null
      } else if (msg.type === 'navigate') {
        onNavigateRef.current?.(msg.payload.direction)
      } else if (msg.type === 'audioToggle') {
        onAudioToggleRef.current?.()
      } else if (msg.type === 'autoPlayToggle') {
        onAutoPlayToggleRef.current?.()
      } else if (msg.type === 'autoSlideshowToggle') {
        onAutoSlideshowToggleRef.current?.()
      } else if (msg.type === 'scrollSpeedChange') {
        onScrollSpeedChangeRef.current?.(msg.payload.speed)
      }
    }

    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [])

  const sendSlideState = useCallback(
    (currentIndex: number) => {
      if (channelRef.current && isOpen) {
        const message: PresenterViewMessage = { type: 'slideChanged', payload: { currentIndex, slides } }
        channelRef.current.postMessage(message)
      }
    },
    [isOpen, slides],
  )

  const sendControlState = useCallback(
    (state: PresenterControlState) => {
      latestControlStateRef.current = state
      if (channelRef.current && isOpen) {
        const message: PresenterViewMessage = { type: 'controlStateChanged', payload: state }
        channelRef.current.postMessage(message)
      }
    },
    [isOpen],
  )

  const sendProgressState = useCallback(
    (progress: number, visible: boolean, animationDuration?: number) => {
      if (channelRef.current && isOpen) {
        const message: PresenterViewMessage = { type: 'progressChanged', payload: { progress, visible, animationDuration } }
        channelRef.current.postMessage(message)
      }
    },
    [isOpen],
  )

  const openPresenterView = useCallback(() => {
    if (isOpen && windowRef.current && !windowRef.current.closed) {
      windowRef.current.focus()
      return
    }

    const newWindow = window.open('/presenter-view.html', 'presenterView')
    if (newWindow) {
      windowRef.current = newWindow
    } else {
      console.warn('[presenter-view] ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。')
    }
  }, [isOpen])

  return { openPresenterView, isOpen, sendSlideState, sendControlState, sendProgressState }
}
