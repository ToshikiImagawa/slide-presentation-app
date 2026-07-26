import { useEffect, useRef } from 'react'
import { useI18n, useTranslation } from '../i18n'
import type { AddonTrustDecision } from '../localSlideLoader'
import styles from './SettingsWindow.module.css'

const FOCUSABLE_SELECTOR = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  // querySelectorAll はセレクタリストの記述順でグルーピングされる場合があるため、ドキュメント順に明示的に並べ替える
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
}

/** 層C: 実行時信頼の個別付け外し対象（パッケージ単位） */
export type AddonTrustEntry = { path: string; title: string; decision: AddonTrustDecision | undefined }

type SettingsWindowProps = {
  open: boolean
  onClose: () => void
  scrollSpeed: number
  setScrollSpeed: (speed: number) => void
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
}

export function SettingsWindow({ open, onClose, scrollSpeed, setScrollSpeed, embeddedAddonsDisabled, onToggleEmbeddedAddons, onResetAddonTrust, addonTrust, onSetAddonTrust }: SettingsWindowProps) {
  const { locale, locales, setLocale } = useI18n()
  const { t } = useTranslation()
  const windowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    const windowEl = windowRef.current
    if (windowEl) getFocusableElements(windowEl)[0]?.focus()
    return () => previousFocus?.focus()
  }, [open])

  if (!open) return null

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (e.key === 'Escape') {
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const windowEl = windowRef.current
    if (!windowEl) return
    const focusables = getFocusableElements(windowEl)
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose} onKeyDown={handleKeyDown}>
      <div ref={windowRef} className={styles.window} role="dialog" aria-modal="true" aria-labelledby="settings-window-title" onClick={(e) => e.stopPropagation()} data-testid="settings-dialog">
        <div className={styles.header}>
          <h2 className={styles.title} id="settings-window-title">
            {t('settings.title')}
          </h2>
          <button className={styles.closeButton} onClick={onClose} aria-label={t('settings.close')}>
            <svg className={styles.closeIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className={styles.body}>
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
              value={scrollSpeed}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (v >= 1 && v <= 300) setScrollSpeed(v)
              }}
            />
          </div>
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
                  <button type="button" className={styles.footerButton} onClick={onResetAddonTrust}>
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
        </div>
        <div className={styles.footer}>
          <button className={styles.footerButton} onClick={onClose}>
            {t('settings.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
