import type { ReactNode } from 'react'
import Typography from '@mui/material/Typography'
import { FallbackImage } from './FallbackImage'
import { UnderlinedHeading } from './UnderlinedHeading'
import { densityFromRows, type Density } from './multiColumnDensity'
import styles from './ImageFigureGrid.module.css'

type ImageFigureData = {
  src: string
  alt?: string
  /** 画像の下に描画するキャプション */
  caption?: ReactNode
}

/** 分類ごとに見出しを付けて画像を並べるグループ形（#326）。判別は images キーの有無で行う（type 判別フィールドは足さない） */
type ImageGroupData = {
  label: string
  images: ImageFigureData[]
}

type Props = {
  images: ImageFigureData[] | ImageGroupData[]
  /** 列数の外部指定（#326）。1〜6 の範囲外は丸める。省略時は現行どおり Math.min(枚数, MAX_COLUMNS) */
  imageColumns?: number
}

/** 1枚あたりが読めない大きさになるのを防ぐ列数の既定上限（imageColumns 未指定時のみ使う。既存デッキの見た目を変えないため） */
const MAX_COLUMNS = 3
const MIN_IMAGE_COLUMNS = 1
const MAX_IMAGE_COLUMNS = 6

/** SlideRenderer（JSON由来のフラットな入力型）からも同じ判別式を使うため export する（#326） */
export function isGroupedImages(images: Props['images']): images is ImageGroupData[] {
  return images.length > 0 && 'images' in images[0]
}

/** imageColumns を1〜6に丸める。範囲がTimeline/Toc（1〜3）と異なるため、multiColumnDensity.clampColumnsは
 * 拡張せずこの関数内で自己完結させる（#326の対象ファイル契約はこのファイル/SlideRenderer.tsx等に限定されており、
 * Wave3で並列実行中の他issueが触れる可能性がある共有モジュールを変更しない） */
function resolveColumns(count: number, imageColumns?: number): number {
  if (imageColumns == null) return Math.min(count, MAX_COLUMNS)
  return Math.min(MAX_IMAGE_COLUMNS, Math.max(MIN_IMAGE_COLUMNS, Math.round(imageColumns)))
}

/** グループ形の密度（見出し・グリッドの行間の縮小段階）を、積み上げた見出し+グリッドの行数から決める
 * （densityFromRows と同じ考え方。1グループ=見出し1行+画像がimageColumns列で折返した行数） */
function resolveGroupDensity(groups: ImageGroupData[], imageColumns?: number): Density {
  const totalRows = groups.reduce((sum, group) => sum + 1 + Math.ceil(group.images.length / resolveColumns(group.images.length, imageColumns)), 0)
  return densityFromRows(totalRows, 1, { dense: 5, compact: 8 })
}

function ImageGrid({ images, columns }: { images: ImageFigureData[]; columns: number }) {
  return (
    <div className={`content-area-fill-item ${styles.grid}`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
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

/** 画像スライド本体（#198）。各画像を縦横比を保って本文領域に自動フィットさせ、キャプションを添える。
 * フィットの前提となる確定高さは ContentLayout の fill 変種（global.css の .content-area-fill-item・#225）から受け取る。
 *
 * images が `{ label, images }` の配列（グループ形・#326）の場合は、分類ごとに UnderlinedHeading + グリッドを縦に積む。
 * ラッパーが1段増えても高さ解決が途切れないのは、global.css の .content-area-fill :has(.content-area-fill-item) 規則が
 * 深さを問わず flex:1/min-height:0 を伝播させるため（#259の契約）。
 *
 * 密度に応じた見出しの縮小は UnderlinedHeading を変更せず（読み取り専用で流用）、CSS Module 側で自分がレンダリングする
 * h2/hr 要素セレクタに data-density を掛けて詰める（Checklist.module.css の data-density と同じ作法。UnderlinedHeading の
 * 内部実装＝MUIの生成クラス名に依存すると壊れやすいので、それには依存しない） */
export function ImageFigureGrid({ images, imageColumns }: Props) {
  if (!isGroupedImages(images)) {
    return <ImageGrid images={images} columns={resolveColumns(images.length, imageColumns)} />
  }

  const density = resolveGroupDensity(images, imageColumns)

  return (
    <div className={styles.groups} data-density={density}>
      {images.map((group, i) => (
        <div key={i} className={styles.group}>
          <UnderlinedHeading>{group.label}</UnderlinedHeading>
          <ImageGrid images={group.images} columns={resolveColumns(group.images.length, imageColumns)} />
        </div>
      ))}
    </div>
  )
}
