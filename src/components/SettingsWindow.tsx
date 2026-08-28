import { useI18n, useTranslation } from '../i18n'
import type { AddonTrustDecision } from '../localSlideLoader'
import type { AddonTrustEntry } from '../hooks/useAddonSettings'
import { DialogFrame } from './DialogFrame'
import dialogFrameStyles from './DialogFrame.module.css'
import styles from './SettingsWindow.module.css'

/** どの画面からでも表示するグローバル設定（言語・ショートカット・アドオン）。個々の項目は既存通り optional で「未指定なら非表示」の規約を維持する（FR-LANG-011） */
type GlobalSettingsProps = {
  /** 同梱アドオンの一律無効化フラグ（未指定時はアドオン設定セクションを表示しない） */
  embeddedAddonsDisabled?: boolean
  /** 一律無効化トグルの変更ハンドラ */
  onToggleEmbeddedAddons?: (disabled: boolean) => void
  /** アドオン許可履歴のリセットハンドラ */
  onResetAddonTrust?: () => void
  /** 層C: 実行時信頼の個別付け外し対象（最近開いたパッケージ）。未指定/空なら表示しない */
  addonTrust?: AddonTrustEntry[]
  /** 層C: 個別 allow/deny の設定ハンドラ（decision が undefined なら「未設定」へ戻す） */
  onSetAddonTrust?: (path: string, decision: AddonTrustDecision | undefined) => void
  /** キーボードショートカット一覧ダイアログを開くハンドラ（未指定時はボタンを表示しない） */
  onOpenShortcuts?: () => void
  /** 更新の手動確認ハンドラ（未指定時はボタンを表示しない。#121 follow-up） */
  onCheckForUpdate?: () => void
  /** 確認中はボタンを disabled にする（多重クリック防止） */
  checkingUpdate?: boolean
}

/** プレゼンテーション画面専用の設定。渡された場合は scrollSpeed / setScrollSpeed が両方揃うことを型で強制する（FR-LANG-011） */
type PresentationSettingsProps = {
  scrollSpeed: number
  setScrollSpeed: (speed: number) => void
}

type SettingsWindowProps = {
  open: boolean
  onClose: () => void
  global: GlobalSettingsProps
  /** ホーム画面など、プレゼンテーション専用設定を出さない画面では渡さない */
  presentation?: PresentationSettingsProps
}

export function SettingsWindow({ open, onClose, global, presentation }: SettingsWindowProps) {
  const { embeddedAddonsDisabled, onToggleEmbeddedAddons, onResetAddonTrust, addonTrust, onSetAddonTrust, onOpenShortcuts, onCheckForUpdate, checkingUpdate } = global
  const { locale, locales, setLocale } = useI18n()
  const { t } = useTranslation()

  return (
    <DialogFrame open={open} onClose={onClose} titleId="settings-window-title" title={t('settings.title')} closeLabel={t('settings.close')} testId="settings-dialog">
      <div className={styles.settingRow}>
        <label className={styles.label} htmlFor="language-select">
          {t('settings.language')}
        </label>
        <select id="language-select" className={styles.select} value={locale} onChange={(e) => setLocale(e.target.value)}>
          {locales.map((l) => (
            <option key={l.languageCode} value={l.languageCode}>
              {l.languageName}
            </option>
          ))}
        </select>
      </div>
      {presentation && (
        <div className={styles.settingRow}>
          <label className={styles.label} htmlFor="scroll-speed-input">
            {t('settings.scrollSpeed')}
          </label>
          <input
            type="number"
            id="scroll-speed-input"
            className={styles.input}
            min={1}
            max={300}
            value={presentation.scrollSpeed}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (v >= 1 && v <= 300) presentation.setScrollSpeed(v)
            }}
          />
        </div>
      )}
      {onOpenShortcuts && (
        <div className={styles.settingRow}>
          <label className={styles.label}>{t('settings.shortcuts', 'キーボードショートカット')}</label>
          <button type="button" className={dialogFrameStyles.footerButton} onClick={onOpenShortcuts} data-testid="shortcuts-open">
            {t('settings.shortcutsOpen', '表示')}
          </button>
        </div>
      )}
      {onToggleEmbeddedAddons && (
        <>
          <div className={styles.settingRow}>
            <label className={styles.label} htmlFor="disable-addons-input">
              {t('settings.disableEmbeddedAddons')}
            </label>
            <input type="checkbox" id="disable-addons-input" checked={embeddedAddonsDisabled ?? false} onChange={(e) => onToggleEmbeddedAddons(e.target.checked)} />
          </div>
          {onResetAddonTrust && (
            <div className={styles.settingRow}>
              <label className={styles.label}>{t('settings.embeddedAddons')}</label>
              <button type="button" className={dialogFrameStyles.footerButton} onClick={onResetAddonTrust}>
                {t('settings.resetAddonTrust')}
              </button>
            </div>
          )}
          {onSetAddonTrust && addonTrust && addonTrust.length > 0 && (
            <div className={styles.addonTrustSection}>
              <label className={styles.label}>{t('settings.addonTrustList', 'アドオンの個別許可')}</label>
              {embeddedAddonsDisabled && <p className={styles.addonTrustNote}>{t('settings.addonTrustDisabledNote', '一律無効化が有効な間は個別設定より優先されます')}</p>}
              <div className={styles.addonTrustList}>
                {addonTrust.map((entry) => (
                  <div key={entry.path} className={styles.addonTrustItem}>
                    <span className={styles.addonTrustTitle} title={entry.path}>
                      {entry.title}
                    </span>
                    <select
                      className={styles.addonTrustSelect}
                      aria-label={`${entry.title}: ${t('settings.addonTrustList', 'アドオンの個別許可')}`}
                      value={entry.decision ?? ''}
                      disabled={embeddedAddonsDisabled}
                      onChange={(e) => onSetAddonTrust(entry.path, e.target.value === '' ? undefined : (e.target.value as AddonTrustDecision))}
                    >
                      <option value="">{t('settings.addonTrustUnset', '未設定')}</option>
                      <option value="allowed">{t('settings.addonTrustAllow', '許可')}</option>
                      <option value="denied">{t('settings.addonTrustDeny', '拒否')}</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {onCheckForUpdate && (
        <div className={styles.settingRow}>
          <label className={styles.label}>{t('settings.checkForUpdate', 'アプリの更新')}</label>
          <button type="button" className={dialogFrameStyles.footerButton} onClick={onCheckForUpdate} disabled={checkingUpdate} data-testid="check-for-update">
            {t('settings.checkForUpdateButton', '更新を確認')}
          </button>
        </div>
      )}
    </DialogFrame>
  )
}
