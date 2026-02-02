import styles from './FillProgress.module.css'

export interface FillProgressProps {
  /** 進行率（0.0〜1.0）。animationDuration 未指定時に使用 */
  progress: number
  /** 表示/非表示 */
  visible: boolean
  /** CSS アニメーションで 0→100% を補間する duration（秒）。指定時は progress を無視 */
  animationDuration?: number
  /** 変更するとアニメーションをリセットする key */
  resetKey?: string | number
}

export function FillProgress({ progress, visible, animationDuration, resetKey }: FillProgressProps) {
  if (!visible) return null

  if (animationDuration != null) {
    return <div key={resetKey} className={`${styles.fill} ${styles.animated}`} style={{ animationDuration: `${animationDuration}s` }} />
  }

  const clampedProgress = Math.min(Math.max(progress, 0), 1)

  return <div className={styles.fill} style={{ height: `${clampedProgress * 100}%` }} />
}
