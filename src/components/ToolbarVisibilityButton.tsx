import { useTranslation } from '../i18n'
import styles from './SettingsButton.module.css'

type ToolbarVisibilityButtonProps = {
  hidden: boolean
  onClick: () => void
}

export function ToolbarVisibilityButton({ hidden, onClick }: ToolbarVisibilityButtonProps) {
  const { t } = useTranslation()
  const label = hidden ? t('toolbar.show') : t('toolbar.hide')
  return (
    <div className={styles.wrapper}>
      <button onClick={onClick} title={label} className={styles.button} aria-label={label} data-testid="toolbar-visibility-toggle">
        {hidden ? (
          <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        ) : (
          <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <path d="M1 1l22 22" />
          </svg>
        )}
      </button>
    </div>
  )
}
