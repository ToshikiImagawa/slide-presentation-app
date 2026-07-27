import { useTranslation } from '../i18n'
import { DialogFrame } from './DialogFrame'
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

const SECTIONS: { titleKey: string; fallback: string; entries: ShortcutEntry[] }[] = [
  { titleKey: 'shortcuts.viewerSection', fallback: 'プレゼンビューア', entries: VIEWER_SHORTCUTS },
  { titleKey: 'shortcuts.editSection', fallback: '編集モード', entries: EDIT_SHORTCUTS },
]

type ShortcutsDialogProps = {
  open: boolean
  onClose: () => void
}

export function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps) {
  const { t } = useTranslation()

  return (
    <DialogFrame
      open={open}
      onClose={onClose}
      titleId="shortcuts-dialog-title"
      title={t('shortcuts.title', 'キーボードショートカット')}
      closeLabel={t('settings.close')}
      testId="shortcuts-dialog"
      paperStyle={{ maxWidth: 560 }}
      bodyStyle={{ gap: 20, maxHeight: '70vh', overflowY: 'auto' }}
    >
      {SECTIONS.map((section) => (
        <div className={styles.section} key={section.titleKey}>
          <h3 className={styles.sectionTitle}>{t(section.titleKey, section.fallback)}</h3>
          <div className={styles.list}>
            {section.entries.map((entry) => (
              <div className={styles.row} key={entry.keys}>
                <span className={styles.keys}>{entry.keys}</span>
                <span className={styles.description}>{t(entry.descKey, entry.fallback)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </DialogFrame>
  )
}
