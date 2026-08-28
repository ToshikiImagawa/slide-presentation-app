import { useCallback, useEffect, useState } from 'react'
import { checkForUpdate, checkForUpdateManual, installUpdate } from '../update'
import type { UpdateInfo } from '../update'
import { useTranslation } from '../i18n'
import { useToast } from '../toast'

export interface UseUpdateCheckReturn {
  updateInfo: UpdateInfo | null
  updateDialogOpen: boolean
  installingUpdate: boolean
  closeUpdateDialog: () => void
  handleInstallUpdate: () => void
  /** 設定画面の「更新を確認」ボタンから呼ぶ手動確認。クールダウンの対象外（#121 follow-up） */
  checkForUpdateManually: () => void
  checkingUpdate: boolean
}

/**
 * 自動アップデート（#121）。起動時に1回だけ更新を確認し、通知ダイアログの開閉・インストール実行を管理する。
 * オフライン・GitHub API のレート制限・latest.json 未添付はすべて無言で諦める（利用を妨げない）。
 *
 * `screenKey` が変わったら（発表・編集開始などの画面遷移）ダイアログを閉じる。呼び出し側（main.tsx の
 * RootContent）は現在の画面を表す値をそのまま渡すだけでよく、これにより発表・編集中への割り込みを避ける
 */
export function useUpdateCheck(screenKey: unknown): UseUpdateCheckReturn {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false)
  const [installingUpdate, setInstallingUpdate] = useState(false)
  const [checkingUpdate, setCheckingUpdate] = useState(false)

  useEffect(() => {
    checkForUpdate()
      .then((info) => {
        if (!info) return
        setUpdateInfo(info)
        setUpdateDialogOpen(true)
      })
      .catch((error) => console.debug('[useUpdateCheck] 更新の確認に失敗しました', error))
  }, [])

  useEffect(() => {
    setUpdateDialogOpen(false)
  }, [screenKey])

  const closeUpdateDialog = useCallback(() => setUpdateDialogOpen(false), [])

  const handleInstallUpdate = useCallback(() => {
    setInstallingUpdate(true)
    // 成功時はアプリが再起動するため、そのまま到達しない想定
    installUpdate().catch((error) => {
      console.error('[useUpdateCheck] 更新の適用に失敗しました', error)
      setInstallingUpdate(false)
      showToast(t('updater.installFailed', '更新の適用に失敗しました'))
    })
  }, [showToast, t])

  const checkForUpdateManually = useCallback(() => {
    setCheckingUpdate(true)
    checkForUpdateManual()
      .then((info) => {
        if (!info) {
          showToast(t('updater.upToDate', 'お使いのバージョンは最新です'))
          return
        }
        setUpdateInfo(info)
        setUpdateDialogOpen(true)
      })
      .catch((error) => {
        console.error('[useUpdateCheck] 更新の確認に失敗しました', error)
        showToast(t('updater.checkFailed', '更新の確認に失敗しました'))
      })
      .finally(() => setCheckingUpdate(false))
  }, [showToast, t])

  return { updateInfo, updateDialogOpen, installingUpdate, closeUpdateDialog, handleInstallUpdate, checkForUpdateManually, checkingUpdate }
}
