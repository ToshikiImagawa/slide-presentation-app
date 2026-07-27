import type { ComponentProps, CSSProperties, ReactNode } from 'react'
import Dialog from '@mui/material/Dialog'
import styles from './DialogFrame.module.css'

type DialogFrameProps = {
  open: boolean
  onClose: () => void
  titleId: string
  title: string
  closeLabel: string
  testId: string
  /** ウィンドウ枠（paper）の微調整（幅など）。ダイアログ固有の要求がある場合のみ指定する */
  paperStyle?: CSSProperties
  /** 本文（body）の微調整（gap・最大高さなど）。ダイアログ固有の要求がある場合のみ指定する */
  bodyStyle?: CSSProperties
  children: ReactNode
}

/** ヘッダー（タイトル＋閉じるボタン）とフッター（閉じるボタン）を共通化したダイアログ枠。本文は children で渡す */
export function DialogFrame({ open, onClose, titleId, title, closeLabel, testId, paperStyle, bodyStyle, children }: DialogFrameProps) {
  return (
    <Dialog open={open} onClose={onClose} aria-labelledby={titleId} slotProps={{ paper: { className: styles.window, style: paperStyle, 'data-testid': testId } as ComponentProps<'div'> }}>
      <div className={styles.header}>
        <h2 className={styles.title} id={titleId}>
          {title}
        </h2>
        <button className={styles.closeButton} onClick={onClose} aria-label={closeLabel}>
          <svg className={styles.closeIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className={styles.body} style={bodyStyle}>
        {children}
      </div>
      <div className={styles.footer}>
        <button className={styles.footerButton} onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </Dialog>
  )
}
