import { useTranslation } from '../i18n'
import styles from './SettingsButton.module.css'

type EditButtonProps = {
  onClick: () => void
}

/** 現在のプレゼンテーションを編集モードで開くツールバーボタン（HomeButton/SettingsButton と同じ体裁） */
export function EditButton({ onClick }: EditButtonProps) {
  const { t } = useTranslation()
  const label = t('edit.startEdit', '編集')
  return (
    <div className={styles.wrapper}>
      <button onClick={onClick} title={label} className={styles.button} aria-label={label}>
        <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>
    </div>
  )
}
