import { useTranslation } from '../i18n'
import styles from './SettingsButton.module.css'

type HomeButtonProps = {
  onClick: () => void
}

export function HomeButton({ onClick }: HomeButtonProps) {
  const { t } = useTranslation()
  const label = t('home.goHome')
  return (
    <div className={styles.wrapper}>
      <button onClick={onClick} title={label} className={styles.button} aria-label={label}>
        <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
        </svg>
      </button>
    </div>
  )
}
