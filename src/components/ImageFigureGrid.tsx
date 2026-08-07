import type { ReactNode } from 'react'
import Typography from '@mui/material/Typography'
import { FallbackImage } from './FallbackImage'
import styles from './ImageFigureGrid.module.css'

type ImageFigureData = {
  src: string
  alt?: string
  /** 画像の下に描画するキャプション */
  caption?: ReactNode
}

type Props = {
  images: ImageFigureData[]
}

/** 1枚あたりが読めない大きさになるのを防ぐ列数の上限。tiles の tileColumns と違い外部指定は持たない */
const MAX_COLUMNS = 3

/** 画像スライド本体（#198）。各画像を縦横比を保って本文領域に自動フィットさせ、キャプションを添える */
export function ImageFigureGrid({ images }: Props) {
  const columns = Math.min(images.length, MAX_COLUMNS)

  return (
    <div className={styles.grid} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {images.map((image, i) => (
        <figure key={i} className={styles.figure}>
          <div className={styles.imageArea}>
            <FallbackImage src={image.src} alt={image.alt} className={styles.image} />
          </div>
          {image.caption && (
            <Typography variant="body2" component="figcaption" sx={{ textAlign: 'center', color: 'var(--theme-text-muted)' }}>
              {image.caption}
            </Typography>
          )}
        </figure>
      ))}
    </div>
  )
}
