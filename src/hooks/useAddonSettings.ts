import { useCallback, useEffect, useState } from 'react'
import { clearAddonTrustDecision, getAddonTrustMap, getRecentSlidePackages, isEmbeddedAddonsDisabled, resetAddonTrust, setAddonTrustDecision, setEmbeddedAddonsDisabled } from '../localSlideLoader'
import type { AddonTrustDecision } from '../localSlideLoader'
import type { AddonTrustEntry } from '../components/SettingsWindow'

export interface UseAddonSettingsReturn {
  addonsDisabled: boolean
  addonTrustList: AddonTrustEntry[]
  handleToggleAddonsDisabled: (disabled: boolean) => void
  handleResetAddonTrust: () => void
  handleSetAddonTrust: (path: string, decision: AddonTrustDecision | undefined) => void
}

/**
 * 同梱アドオンの信頼設定（一律無効化フラグ・パッケージ単位の許可/拒否）を永続ストア越しに読み書きする。
 *
 * 設定ダイアログはホーム画面・プレゼンテーション画面の双方から開くため、所有者は両者の共通祖先（Root）側になる。
 * `settingsOpen` を受け取り、ダイアログを開くたびに信頼一覧を作り直す（FR-008）
 */
export function useAddonSettings(settingsOpen: boolean): UseAddonSettingsReturn {
  const [addonsDisabled, setAddonsDisabled] = useState(false)
  // 層C: 実行時信頼の個別付け外し対象（最近開いたパッケージ × 現在の信頼判断）
  const [addonTrustList, setAddonTrustList] = useState<AddonTrustEntry[]>([])

  // 同梱アドオンの一律無効化フラグを永続ストアから復元する
  useEffect(() => {
    void isEmbeddedAddonsDisabled().then(setAddonsDisabled)
  }, [])

  // 設定ダイアログを開くたびに、信頼判断を持つパッケージ（trustMap 全キー）を一覧化する（層C・FR-008）。
  // trustMap を基点にすることで、最近リストの上限を超えて追い出された「許可済み」パッケージも一覧に残り、
  // 個別に取り消せる一方、信頼判断が一度も記録されていないパッケージは表示されない。title は recent から補完する
  useEffect(() => {
    if (!settingsOpen) return
    void Promise.all([getRecentSlidePackages(), getAddonTrustMap()]).then(([recent, trustMap]) => {
      const titleByPath = new Map(recent.map((r) => [r.path, r.title]))
      setAddonTrustList(Object.keys(trustMap).map((path) => ({ path, title: titleByPath.get(path) ?? path, decision: trustMap[path] })))
    })
  }, [settingsOpen])

  const handleToggleAddonsDisabled = useCallback((disabled: boolean) => {
    setAddonsDisabled(disabled)
    void setEmbeddedAddonsDisabled(disabled)
  }, [])

  // 永続化失敗時に楽観更新した一覧を実態へ戻す（await して store の save 失敗を握りつぶさない）
  const reloadTrustList = useCallback(() => {
    void getAddonTrustMap().then((trustMap) => {
      setAddonTrustList((list) => list.map((e) => ({ ...e, decision: trustMap[e.path] })))
    })
  }, [])

  const handleResetAddonTrust = useCallback(() => {
    // 失効に合わせてローカル一覧の判断も未設定へ戻す（失敗時は実態へロールバック）
    setAddonTrustList((list) => list.map((e) => ({ ...e, decision: undefined })))
    resetAddonTrust().catch((err) => {
      console.error('[useAddonSettings] アドオン許可履歴のリセットに失敗しました', err)
      reloadTrustList()
    })
  }, [reloadTrustList])

  // decision が undefined のときは「未設定」へ戻す（trustMap からキー削除）
  const handleSetAddonTrust = useCallback(
    (path: string, decision: AddonTrustDecision | undefined) => {
      setAddonTrustList((list) => list.map((e) => (e.path === path ? { ...e, decision } : e)))
      const op = decision === undefined ? clearAddonTrustDecision(path) : setAddonTrustDecision(path, decision)
      op.catch((err) => {
        console.error('[useAddonSettings] アドオン信頼の保存に失敗しました', err)
        reloadTrustList()
      })
    },
    [reloadTrustList],
  )

  return { addonsDisabled, addonTrustList, handleToggleAddonsDisabled, handleResetAddonTrust, handleSetAddonTrust }
}
