import type { ReactNode } from 'react'
import styles from './Timeline.module.css'

type Props = {
  items: ReactNode[]
}

export function Timeline({ items }: Props) {
  return (
    <div className={styles.layout}>
      <div className={styles.line} />
      {items.map((item, i) => (
        <div key={i} className={styles.item}>
          {item}
        </div>
      ))}
    </div>
  )
}
