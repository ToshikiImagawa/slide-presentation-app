import { useI18n, useTranslation } from '../i18n'
import styles from './SettingsWindow.module.css'

type SettingsWindowProps = {
  open: boolean
  onClose: () => void
  scrollSpeed: number
  setScrollSpeed: (speed: number) => void
}

export function SettingsWindow({ open, onClose, scrollSpeed, setScrollSpeed }: SettingsWindowProps) {
  const { locale, locales, setLocale } = useI18n()
  const { t } = useTranslation()

  if (!open) return null

  return (
    <div className={styles.overlay} onClick={onClose} onKeyDown={(e) => e.stopPropagation()}>
      <div className={styles.window} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{t('settings.title')}</h2>
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
