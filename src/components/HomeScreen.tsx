import { useTranslation } from '../i18n'
import type { RecentSlidePackageEntry } from '../localSlideLoader'
import styles from './HomeScreen.module.css'

type HomeScreenProps = {
  recentPackages: RecentSlidePackageEntry[]
  onOpenRecent: (path: string) => void
  onOpenSample: () => void
  onBrowse: () => void
}

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

/** 書類アイコン（最近開いたスライド） */
function DocumentIcon() {
  return (
    <svg className={styles.recentIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  )
}

export function HomeScreen({ recentPackages, onOpenRecent, onOpenSample, onBrowse }: HomeScreenProps) {
  const { t } = useTranslation()

  return (
    <div className={styles.container} data-testid="home-screen">
      <div className={styles.content}>
        <header className={styles.hero}>
          <h1 className={styles.title}>{t('home.appTitle', 'Slide Presentation App')}</h1>
          <p className={styles.tagline}>{t('home.tagline', 'Choose a slide deck to get started')}</p>
        </header>

        <div className={styles.actions}>
          <button className={styles.primaryCard} onClick={onBrowse} data-testid="home-browse">
            <span className={styles.primaryIcon}>
              <FolderIcon />
            </span>
            <span className={styles.primaryText}>
              <span className={styles.primaryLabel}>{t('home.browseButton')}</span>
              <span className={styles.primaryHint}>{t('home.browseHint', '.json / .tgz')}</span>
            </span>
          </button>

          <button className={styles.secondaryButton} onClick={onOpenSample} data-testid="home-sample">
            <SparkleIcon />
            <span>{t('home.sampleButton')}</span>
          </button>
        </div>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('home.recentTitle')}</h2>
          {recentPackages.length === 0 ? (
            <p className={styles.emptyMessage}>{t('home.recentEmpty')}</p>
          ) : (
            <ul className={styles.recentList}>
              {recentPackages.map((entry) => (
                <li key={entry.path}>
                  <button className={styles.recentItem} onClick={() => onOpenRecent(entry.path)}>
                    <DocumentIcon />
                    <span className={styles.recentItemText}>
                      <span className={styles.recentItemTitle}>{entry.title}</span>
                      <span className={styles.recentItemPath}>{entry.path}</span>
                    </span>
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
