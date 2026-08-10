import type { ReactNode } from 'react'
import styles from './Quote.module.css'

type Props = {
  /** 引用文（改行の解釈は呼び出し側の renderWithLineBreaks が済ませた ReactNode） */
  children: ReactNode
  /** 出典（人名・書名・URL 等）。省略時は引用文だけを見せる */
  citation?: ReactNode
}

/**
 * 引用スライドの本体（#197）。大きな引用符 + 引用文 + 出典を中央主役で見せる。
 * 引用符は意味を持たない装飾なので aria-hidden にし、支援技術には blockquote と cite だけを伝える。
 */
export function Quote({ children, citation }: Props) {
  return (
    <figure className={styles.quote} data-testid="quote">
      <span className={styles.mark} aria-hidden="true">
        &ldquo;
      </span>
      <blockquote className={styles.text}>{children}</blockquote>
      {citation && (
        <figcaption className={styles.citation}>
          <cite>{citation}</cite>
        </figcaption>
      )}
    </figure>
  )
}
