import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from '../i18n'
import type { RecentSlidePackageEntry } from '../localSlideLoader'
import styles from './HomeScreen.module.css'

type HomeScreenProps = {
  recentPackages: RecentSlidePackageEntry[]
  onOpenRecent: (path: string) => Promise<void>
  onRemoveRecent: (path: string) => void
  onOpenSample: () => Promise<void>
  onBrowse: () => Promise<void>
  onCreateWithAi: () => void
  onOpenUrl: (url: string) => Promise<void>
}

/** 読み込み中の操作。同時に複数の読み込みが走らないよう単一の状態で管理する */
type BusyState = { kind: 'browse' | 'sample' | 'url' } | { kind: 'recent'; path: string } | null

/** フォルダアイコン（ファイルを開く） */
function FolderIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}

/** きらめきアイコン（サンプル） */
function SparkleIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M18 15l.7 1.8L20.5 17.5l-1.8.7L18 20l-.7-1.8L15.5 17.5l1.8-.7z" />
    </svg>
  )
}

/** 魔法の杖アイコン（AIで新規作成） */
function WandIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20 16 8" />
      <path d="M15 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
      <path d="M19 11l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </svg>
  )
}

/** 書類アイコン（最近開いたスライド） */
function DocumentIcon() {
  return (
    <svg className={styles.recentIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  )
}

/** リンクアイコン（URLから開く） */
function LinkIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

/** ゴミ箱アイコン（最近開いたスライドの個別削除） */
function TrashIcon() {
  return (
    <svg className={styles.removeIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}

/** 読み込み中スピナー（読み込み系ボタンのアイコンを読み込み中は置き換える） */
function Spinner({ className }: { className: string }) {
  return (
    <svg className={`${className} ${styles.spinner}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  )
}

export function HomeScreen({ recentPackages, onOpenRecent, onRemoveRecent, onOpenSample, onBrowse, onCreateWithAi, onOpenUrl }: HomeScreenProps) {
  const { t } = useTranslation()
  const [isUrlFormOpen, setIsUrlFormOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<BusyState>(null)
  const isBusy = busy !== null

  /** busy 状態をセットして fn を実行し、完了後（成功・失敗問わず）busy を解除する。同時に複数の読み込みは走らせない */
  const runBusy = async (state: NonNullable<BusyState>, fn: () => Promise<void>) => {
    if (isBusy) return
    setBusy(state)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }

  const handleUrlSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    void runBusy({ kind: 'url' }, () => onOpenUrl(trimmed))
  }

  const handleBrowseClick = () => runBusy({ kind: 'browse' }, onBrowse)

  const handleOpenSampleClick = () => runBusy({ kind: 'sample' }, onOpenSample)

  const handleOpenRecentClick = (path: string) => runBusy({ kind: 'recent', path }, () => onOpenRecent(path))

  return (
    <div className={styles.container} data-testid="home-screen">
      <div className={styles.content}>
        <header className={styles.hero}>
          <h1 className={styles.title}>{t('home.appTitle', 'Slide Presentation App')}</h1>
          <p className={styles.tagline}>{t('home.tagline', 'Choose a slide deck to get started')}</p>
        </header>

        <div className={styles.actions}>
          <button className={styles.primaryCard} onClick={onCreateWithAi} disabled={isBusy} data-testid="home-create-ai">
            <span className={styles.primaryIcon}>
              <WandIcon />
            </span>
            <span className={styles.primaryText}>
              <span className={styles.primaryLabel}>{t('home.createWithAiButton')}</span>
              <span className={styles.primaryHint}>{t('home.createWithAiHint', 'ゼロからAIでスライドを生成')}</span>
            </span>
          </button>

          <button className={styles.primaryCard} onClick={handleBrowseClick} disabled={isBusy} data-testid="home-browse">
            <span className={styles.primaryIcon}>{busy?.kind === 'browse' ? <Spinner className={styles.icon} /> : <FolderIcon />}</span>
            <span className={styles.primaryText}>
              <span className={styles.primaryLabel}>{t('home.browseButton')}</span>
              <span className={styles.primaryHint}>{t('home.browseHint', '.json / .spkg')}</span>
            </span>
          </button>

          <div className={styles.secondaryRow}>
            <button className={styles.secondaryButton} onClick={handleOpenSampleClick} disabled={isBusy} data-testid="home-sample">
              {busy?.kind === 'sample' ? <Spinner className={styles.icon} /> : <SparkleIcon />}
              <span>{t('home.sampleButton')}</span>
            </button>
            <button className={styles.secondaryButton} onClick={() => setIsUrlFormOpen((open) => !open)} disabled={isBusy} data-testid="home-url-toggle" aria-expanded={isUrlFormOpen}>
              <LinkIcon />
              <span>{t('home.urlButton', 'URLから開く')}</span>
            </button>
          </div>

          {isUrlFormOpen && (
            <form className={styles.urlForm} onSubmit={handleUrlSubmit} data-testid="home-url-form">
              <input
                type="url"
                className={styles.urlInput}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t('home.urlPlaceholder', 'https://example.com/deck.spkg')}
                aria-label={t('home.urlInputLabel', 'スライドパッケージのURL')}
                disabled={isBusy}
                data-testid="home-url-input"
              />
              <button type="submit" className={styles.urlSubmitButton} disabled={!url.trim() || isBusy} data-testid="home-url-submit">
                {busy?.kind === 'url' ? t('home.urlOpening', '開いています…') : t('home.urlSubmit', '開く')}
              </button>
            </form>
          )}

          {isBusy && (
            <p className={styles.loadingStatus} role="status">
              {t('home.loading', '読み込んでいます…')}
            </p>
          )}
        </div>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('home.recentTitle')}</h2>
          {recentPackages.length === 0 ? (
            <p className={styles.emptyMessage}>{t('home.recentEmpty')}</p>
          ) : (
            <ul className={styles.recentList}>
              {recentPackages.map((entry) => (
                <li key={entry.path} className={styles.recentRow}>
                  <button className={styles.recentItem} onClick={() => handleOpenRecentClick(entry.path)} disabled={isBusy}>
                    {busy?.kind === 'recent' && busy.path === entry.path ? <Spinner className={styles.recentIcon} /> : <DocumentIcon />}
                    <span className={styles.recentItemText}>
                      <span className={styles.recentItemTitle}>{entry.title}</span>
                      <span className={styles.recentItemPath}>{entry.path}</span>
                    </span>
                  </button>
                  {/* 履歴からの除外のみで実ファイルは削除されないため、ConfirmDialog は使わず即時実行する */}
                  <button className={styles.removeButton} onClick={() => onRemoveRecent(entry.path)} disabled={isBusy} aria-label={t('home.removeRecentAria', '{title} を削除').replace('{title}', entry.title)}>
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
