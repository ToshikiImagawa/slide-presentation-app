import { useTranslation } from '../i18n'
import { DialogFrame } from './DialogFrame'
import styles from './UpdateDialog.module.css'

type UpdateDialogProps = {
  open: boolean
  onClose: () => void
  onInstall: () => void
  installing: boolean
  version: string
  body: string | null
}

/** 起動時チェックで更新が見つかったときに表示する、最小限の通知ダイアログ（進捗バー・自動チェック頻度設定は対象外） */
export function UpdateDialog({ open, onClose, onInstall, installing, version, body }: UpdateDialogProps) {
  const { t } = useTranslation()

  return (
    <DialogFrame open={open} onClose={onClose} titleId="update-dialog-title" title={t('updater.title', '新しいバージョンがあります')} closeLabel={t('updater.later', '後で')} testId="update-dialog">
      <p className={styles.version}>{t('updater.versionAvailable', 'バージョン {version} が利用可能です').replace('{version}', version)}</p>
      {body && <p className={styles.notes}>{body}</p>}
      <button className={styles.installButton} onClick={onInstall} disabled={installing}>
        {installing ? t('updater.installing', '更新中…') : t('updater.installNow', '今すぐ更新して再起動')}
      </button>
    </DialogFrame>
  )
}
