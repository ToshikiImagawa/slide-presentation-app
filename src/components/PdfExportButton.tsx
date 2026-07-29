import { useTranslation } from '../i18n'
import styles from './PresenterViewButton.module.css'

export type PdfExportState = 'idle' | 'exporting' | 'error'

type PdfExportButtonProps = {
  onClick: () => void
  state: PdfExportState
}

const LABEL_KEY: Record<PdfExportState, string> = {
  idle: 'toolbar.pdfExport',
  exporting: 'toolbar.pdfExporting',
  error: 'toolbar.pdfExportError',
}

export function PdfExportButton({ onClick, state }: PdfExportButtonProps) {
  const { t } = useTranslation()
  const label = t(LABEL_KEY[state])

  return (
    <div className={styles.wrapper}>
      <button onClick={onClick} disabled={state === 'exporting'} title={label} className={`${styles.button} ${state === 'exporting' ? styles.buttonOpen : ''}`.trim()} data-testid="pdf-export">
        <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9V2h9l5 5v2" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <path d="M6 14h12v8H6z" />
        </svg>
        <span className={styles.label}>{label}</span>
      </button>
    </div>
  )
}
