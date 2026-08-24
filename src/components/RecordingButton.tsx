import type { RecordingState } from '../hooks/useRecording'
import { useTranslation } from '../i18n'
import styles from './RecordingButton.module.css'

export interface RecordingButtonProps {
  state: RecordingState
  /** state に応じて start/stop のいずれかを呼ぶ */
  onToggle: () => void
}

const TITLE_KEY: Record<RecordingState, string> = {
  idle: 'recording.start',
  recording: 'recording.stop',
  saving: 'recording.saving',
  error: 'recording.unavailable',
}

const STATE_CLASSNAME: Record<RecordingState, string> = {
  idle: '',
  recording: styles.recording,
  saving: styles.saving,
  error: styles.error,
}

// 録画（円）アイコン。recording 中は CSS の pulse アニメーションで強調する
const RECORD_ICON = <circle cx="12" cy="12" r="7" />

export function RecordingButton({ state, onToggle }: RecordingButtonProps) {
  const { t } = useTranslation()
  const title = t(TITLE_KEY[state])
  const disabled = state === 'saving' || state === 'error'

  return (
    <button onClick={onToggle} disabled={disabled} title={title} aria-label={title} className={`${styles.button} ${STATE_CLASSNAME[state]}`.trim()} data-testid="recording-button">
      <svg className={styles.icon} viewBox="0 0 24 24" fill="currentColor">
        {RECORD_ICON}
      </svg>
    </button>
  )
}
