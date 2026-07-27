import type { ComponentProps } from 'react'
import Dialog from '@mui/material/Dialog'
import { useTranslation } from '../i18n'
import styles from './ShortcutsDialog.module.css'

type ShortcutEntry = { keys: string; descKey: string; fallback: string }

// navigationMode: 'linear'（useReveal.ts）時の Reveal.js デフォルトキーバインド（node_modules/reveal.js/js/controllers/keyboard.js の configure() を根拠とする）
const VIEWER_SHORTCUTS: ShortcutEntry[] = [
  { keys: 'T', descKey: 'shortcuts.toggleToolbar', fallback: 'ツールバーの表示/非表示' },
  { keys: '?', descKey: 'shortcuts.openHelp', fallback: 'このショートカット一覧を表示' },
  { keys: '→ / ↓ / Space / N / L / J', descKey: 'shortcuts.nextSlide', fallback: '次のスライド' },
  { keys: '← / ↑ / P / H / K', descKey: 'shortcuts.prevSlide', fallback: '前のスライド' },
  { keys: 'Shift + ← / →', descKey: 'shortcuts.jumpFirstLast', fallback: '最初 / 最後のスライドへ移動' },
  { keys: 'Alt + ← / ↑ / → / ↓', descKey: 'shortcuts.ignoreFragments', fallback: 'フラグメントを無視して移動' },
  { keys: 'B / .', descKey: 'shortcuts.pause', fallback: '一時停止（ブラックアウト）' },
  { keys: 'F', descKey: 'shortcuts.fullscreen', fallback: 'フルスクリーン表示' },
  { keys: 'G', descKey: 'shortcuts.jumpToSlide', fallback: '指定したスライド番号へ移動' },
  { keys: 'Esc / O', descKey: 'shortcuts.overview', fallback: 'スライド概要の表示切替' },
]

// 編集モードの既存ショートカット（src/edit/SlideEditor.tsx・SlideJsonEditor.tsx）
const EDIT_SHORTCUTS: ShortcutEntry[] = [
  { keys: 'Ctrl / Cmd + S', descKey: 'shortcuts.save', fallback: '保存' },
  { keys: 'Esc', descKey: 'shortcuts.exitEdit', fallback: '編集を終了' },
  { keys: 'Ctrl / Cmd + F', descKey: 'shortcuts.search', fallback: 'JSON内を検索' },
  { keys: 'Enter / Shift + Enter', descKey: 'shortcuts.searchNav', fallback: '次 / 前の検索結果へ移動' },
]

type ShortcutsDialogProps = {
  open: boolean
  onClose: () => void
}

export function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onClose={onClose} aria-labelledby="shortcuts-dialog-title" slotProps={{ paper: { className: styles.window, 'data-testid': 'shortcuts-dialog' } as ComponentProps<'div'> }}>
      <div className={styles.header}>
        <h2 className={styles.title} id="shortcuts-dialog-title">
          {t('shortcuts.title', 'キーボードショートカット')}
        </h2>
        <button className={styles.closeButton} onClick={onClose} aria-label={t('settings.close')}>
          <svg className={styles.closeIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className={styles.body}>
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('shortcuts.viewerSection', 'プレゼンビューア')}</h3>
          <div className={styles.list}>
            {VIEWER_SHORTCUTS.map((entry) => (
              <div className={styles.row} key={entry.keys}>
                <span className={styles.keys}>{entry.keys}</span>
                <span className={styles.description}>{t(entry.descKey, entry.fallback)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('shortcuts.editSection', '編集モード')}</h3>
          <div className={styles.list}>
            {EDIT_SHORTCUTS.map((entry) => (
              <div className={styles.row} key={entry.keys}>
                <span className={styles.keys}>{entry.keys}</span>
                <span className={styles.description}>{t(entry.descKey, entry.fallback)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.footer}>
        <button className={styles.footerButton} onClick={onClose}>
          {t('settings.close')}
        </button>
      </div>
    </Dialog>
  )
}
