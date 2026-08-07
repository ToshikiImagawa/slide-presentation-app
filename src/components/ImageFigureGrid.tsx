import type { ReactNode } from 'react'
import { FallbackImage } from './FallbackImage'
import styles from './ImageFigureGrid.module.css'

export type ImageFigureData = {
  src: string
  alt?: string
  /** 画像の下に描画するキャプション */
  caption?: ReactNode
}

type Props = {
  images: ImageFigureData[]
}

/** 3枚を超える画像は折り返す（1枚あたりが読めない大きさになるのを防ぐ） */
const MAX_COLUMNS = 3

/** 画像スライド本体（#198）。各画像を縦横比を保って本文領域に自動フィットさせ、キャプションを添える。
 * 1枚なら本文領域いっぱい、2〜3枚なら横並びグリッドになる（枚数から列数を決めるのは FeatureTileGrid と同じ規則） */
export function ImageFigureGrid({ images }: Props) {
  const columns = Math.min(images.length, MAX_COLUMNS)

  return (
    <div className={styles.grid} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {images.map((image, i) => (
        <figure key={`${i}-${image.src}`} className={styles.figure}>
          <div className={styles.imageArea}>
            <FallbackImage src={image.src} alt={image.alt ?? ''} className={styles.image} fit />
          </div>
          {image.caption && <figcaption className={styles.caption}>{image.caption}</figcaption>}
        </figure>
      ))}
    </div>
  )
}
