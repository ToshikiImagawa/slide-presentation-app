import { useTranslation } from '../i18n'
import styles from './PresenterViewButton.module.css'

type PresenterViewButtonProps = {
  onClick: () => void
  isOpen: boolean
}

export function PresenterViewButton({ onClick, isOpen }: PresenterViewButtonProps) {
  const { t } = useTranslation()

  return (
    <div className={styles.wrapper}>
      <button onClick={onClick} disabled={isOpen} title={isOpen ? t('presenterView.alreadyOpen') : t('presenterView.open')} className={`${styles.button} ${isOpen ? styles.buttonOpen : ''}`}>
        <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
        <span className={styles.label}>{isOpen ? t('presenterView.opened') : t('presenterView.open')}</span>
      </button>
    </div>
  )
}
