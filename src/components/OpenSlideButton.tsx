import { useTranslation } from '../i18n'
import styles from './SettingsButton.module.css'

type OpenSlideButtonProps = {
  onClick: () => void
}

export function OpenSlideButton({ onClick }: OpenSlideButtonProps) {
  const { t } = useTranslation()
  const label = t('openSlide.open')
  return (
    <div className={styles.wrapper}>
      <button onClick={onClick} title={label} className={styles.button} aria-label={label}>
        <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    </div>
  )
}
