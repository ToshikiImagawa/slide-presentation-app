import { useTranslation } from '../i18n'
import type { RecentSlidePackageEntry } from '../localSlideLoader'
import styles from './HomeScreen.module.css'

type HomeScreenProps = {
  recentPackages: RecentSlidePackageEntry[]
  onOpenRecent: (path: string) => void
  onOpenSample: () => void
  onBrowse: () => void
}

export function HomeScreen({ recentPackages, onOpenRecent, onOpenSample, onBrowse }: HomeScreenProps) {
  const { t } = useTranslation()

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('home.recentTitle')}</h2>
          {recentPackages.length === 0 ? (
            <p className={styles.emptyMessage}>{t('home.recentEmpty')}</p>
          ) : (
            <ul className={styles.recentList}>
              {recentPackages.map((entry) => (
                <li key={entry.path}>
                  <button className={styles.recentItem} onClick={() => onOpenRecent(entry.path)}>
                    <span className={styles.recentItemTitle}>{entry.title}</span>
                    <span className={styles.recentItemPath}>{entry.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('home.sampleTitle')}</h2>
          <button className={styles.actionButton} onClick={onOpenSample}>
            {t('home.sampleButton')}
          </button>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('home.browseTitle')}</h2>
          <button className={styles.actionButton} onClick={onBrowse}>
            {t('home.browseButton')}
          </button>
        </section>
      </div>
    </div>
  )
}
