import styles from './CircularProgress.module.css'

export interface CircularProgressProps {
  /** 進行率（0.0〜1.0）。animationDuration 未指定時に使用 */
  progress: number
  /** 表示/非表示 */
  visible: boolean
  /** CSS アニメーションで 0→100% を補間する duration（秒）。指定時は progress を無視 */
  animationDuration?: number
  /** 変更するとアニメーションをリセットする key */
  resetKey?: string | number
}

const RING_RADIUS = 18
const RING_SIZE = RING_RADIUS * 2 + 2
const RING_CENTER = RING_RADIUS + 1
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

export function CircularProgress({ progress, visible, animationDuration, resetKey }: CircularProgressProps) {
  if (!visible) return null

  if (animationDuration != null) {
    return (
      <svg key={resetKey} className={styles.ring} width={RING_SIZE} height={RING_SIZE} style={{ '--circumference': CIRCUMFERENCE } as React.CSSProperties}>
        <circle
          className={styles.animated}
          cx={RING_CENTER}
          cy={RING_CENTER}
          r={RING_RADIUS}
          fill="none"
          stroke="var(--theme-primary)"
          strokeWidth={2}
          strokeDasharray={CIRCUMFERENCE}
          strokeLinecap="round"
          transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
          style={{ animationDuration: `${animationDuration}s` }}
        />
      </svg>
    )
  }

  const clampedProgress = Math.min(Math.max(progress, 0), 1)
  const offset = CIRCUMFERENCE * (1 - clampedProgress)

  return (
    <svg className={styles.ring} width={RING_SIZE} height={RING_SIZE}>
      <circle
        cx={RING_CENTER}
        cy={RING_CENTER}
        r={RING_RADIUS}
        fill="none"
        stroke="var(--theme-primary)"
        strokeWidth={2}
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
      />
    </svg>
  )
}
