import type { ReactNode } from 'react'
import type { AudioPlaybackState } from '../data/types'
import { useTranslation } from '../i18n'
import styles from './AudioPlayButton.module.css'

type AudioPlayButtonProps = {
  playbackState: AudioPlaybackState
  hasError?: boolean
  onToggle: () => void
}

type AudioButtonVariant = 'error' | 'paused' | 'playing' | 'idle'

const VARIANT_TITLE_KEY: Record<AudioButtonVariant, string> = {
  error: 'audio.error',
  paused: 'audio.resume',
  playing: 'audio.pause',
  idle: 'audio.play',
}

const VARIANT_CLASSNAME: Record<AudioButtonVariant, string> = {
  error: styles.error,
  paused: styles.paused,
  playing: styles.playing,
  idle: '',
}

// 全バリアント共通のスピーカーアイコン。各バリアント固有の重ね合わせパスは VARIANT_ICON_OVERLAY で追加する
const SPEAKER_PATH = <path d="M3 9v6h4l5 5V4L7 9H3z" />

const VARIANT_ICON_OVERLAY: Record<AudioButtonVariant, ReactNode> = {
  error: <path d="M16.5 12l3.5-3.5-1.4-1.4L15.1 10.6 11.6 7.1 10.2 8.5l3.5 3.5-3.5 3.5 1.4 1.4 3.5-3.5 3.5 3.5 1.4-1.4z" />,
  paused: <path d="M13 8h2v8h-2zM17 8h2v8h-2z" />,
  playing: (
    <>
      <path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
      <path d="M14 7.97v8.06c1.48-.73 2.5-2.25 2.5-3.97 0-1.72-1.02-3.24-2.5-3.97V7.97z" />
    </>
  ),
  idle: null,
}

export function AudioPlayButton({ playbackState, hasError, onToggle }: AudioPlayButtonProps) {
  const { t } = useTranslation()
  const variant: AudioButtonVariant = hasError ? 'error' : playbackState === 'playing' ? 'playing' : playbackState === 'paused' ? 'paused' : 'idle'

  const title = t(VARIANT_TITLE_KEY[variant])
  const className = `${styles.button} ${VARIANT_CLASSNAME[variant]}`.trim()

  return (
    <button onClick={onToggle} title={title} className={className} aria-label={title} disabled={hasError}>
      <svg className={styles.icon} viewBox="0 0 24 24" fill="currentColor">
        {SPEAKER_PATH}
        {VARIANT_ICON_OVERLAY[variant]}
      </svg>
    </button>
  )
}
