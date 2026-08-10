import type { CSSProperties } from 'react'
import { FallbackImage } from '../components/FallbackImage'
import { hasComponent, renderRegisteredComponent } from '../components/ComponentRegistry'
import type { MasterBackground, MasterDecoration, MasterDecorationLayer, MasterGradient, MasterRenderContext, SlideMeta } from '../data'
import type { ResolvedMaster } from '../masters'
import { matchesDecorationOnly, renderMasterText } from '../masters'

type Props = {
  /** resolveMaster が解決したマスター。未解決（undefined）でも meta 個別背景があれば描く */
  master: ResolvedMaster | undefined
  layer: MasterDecorationLayer
  ctx: MasterRenderContext
  /** slides[].meta。backgroundColor/backgroundImage は back レイヤーで theme.masters[key].background より
   * 優先する（#236: スライド個別指定が勝つ。theme.tokens の masterKey スコープが全体スコープに勝つのと同型） */
  meta?: SlideMeta
}

/**
 * 指定レイヤー（back/front）の中身を組み立てる。back レイヤーは最背面に背景（#189・#236）を敷き、
 * その上に該当レイヤーの装飾（only 条件を満たすもの）を宣言順で描く。
 * レイヤー内の重なり順を知るのはこのコンポーネントだけで、SlideFrame は2つのレイヤー div を並べるだけ。
 */
export function SlideMasterLayer({ master, layer, ctx, meta }: Props) {
  const metaBackgroundStyle = layer === 'back' ? metaBackgroundElementStyle(meta) : undefined
  if (!master && !metaBackgroundStyle) return null
  const visible = master?.decorations.filter((d) => (d.layer ?? 'back') === layer && matchesDecorationOnly(d.only, ctx)) ?? []
  return (
    <>
      {layer === 'back' && (metaBackgroundStyle ? <div className="master-background" style={metaBackgroundStyle} /> : master?.background && <MasterBackgroundElement background={master.background} />)}
      {visible.map((decoration, i) => (
        <MasterDecorationElement key={i} decoration={decoration} ctx={ctx} />
      ))}
    </>
  )
}

/**
 * 装飾共通のスタイル（anchor 9方向 + offset の position: absolute 配置、opacity、rotate）を組み立てる。
 * stretchAxis を指定した軸は、band が辺いっぱいに広がる際に center 系アンカー（transform: translate(-50%,...)）と
 * 衝突して画面外にずれるのを防ぐため、その軸のセンタリング transform を無効化する。
 * rotate はアンカー位置を動かさないよう translate の後段に置き、要素自身の中心を軸に回す（#189）。
 */
function decorationStyle(decoration: MasterDecoration, stretchAxis?: 'horizontal' | 'vertical'): CSSProperties {
  const { anchor, offset } = decoration
  const [vertical, horizontal] = anchor.split('-') as ['top' | 'middle' | 'bottom', 'left' | 'center' | 'right']

  const style: CSSProperties = { position: 'absolute' }
  if (vertical === 'top') style.top = 0
  else if (vertical === 'bottom') style.bottom = 0
  else style.top = '50%'

  if (horizontal === 'left') style.left = 0
  else if (horizontal === 'right') style.right = 0
  else style.left = '50%'

  const translateX = horizontal === 'center' && stretchAxis !== 'horizontal' ? -50 : 0
  const translateY = vertical === 'middle' && stretchAxis !== 'vertical' ? -50 : 0
  const offsetX = offset?.x ?? 0
  const offsetY = offset?.y ?? 0
  const rotate = decoration.rotate ? ` rotate(${decoration.rotate}deg)` : ''
  style.transform = `translate(${translateX}%, ${translateY}%) translate(${offsetX}px, ${offsetY}px)${rotate}`
  style.opacity = decoration.opacity

  return style
}

/** 線形グラデーションのCSS値（マスター背景・帯装飾で共通）。angle 省略時は 180deg = 上→下 */
function linearGradient(gradient: MasterGradient): string {
  return `linear-gradient(${gradient.angle ?? 180}deg, ${gradient.from}, ${gradient.to})`
}

/** master の background（無地/格子/全面塗り/グラデーション/画像）を全面に敷く要素（#189） */
function MasterBackgroundElement({ background }: { background: MasterBackground }) {
  const className = background.type === 'grid' ? 'master-background master-background-grid' : 'master-background'
  return <div className={className} style={backgroundStyle(background)} />
}

function backgroundStyle(background: MasterBackground): CSSProperties {
  const base: CSSProperties = { opacity: background.opacity }
  switch (background.type) {
    case 'plain':
      return { ...base, backgroundColor: 'var(--theme-background)' }

    case 'grid': {
      // 格子の意匠自体は .master-background-grid（global.css）に持たせ、密度だけCSS変数で上書きする
      const density = background.size !== undefined ? ({ '--theme-background-grid-size': `${background.size}px` } as CSSProperties) : undefined
      return { ...base, backgroundColor: background.color ?? 'var(--theme-background)', ...density }
    }

    case 'fill':
      return { ...base, backgroundColor: background.color }

    case 'gradient':
      return { ...base, backgroundImage: linearGradient(background) }

    case 'image':
      return { ...base, backgroundImage: `url(${background.src})`, backgroundSize: background.fit ?? 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }
  }
}

/**
 * meta.backgroundColor / backgroundImage（スライド個別背景）の style を組み立てる。どちらも無ければ undefined
 * を返す（#236）。両方指定時は Reveal.js の従来挙動（色を下地に画像を重ねる）に合わせて両方を反映する。
 * fit は選択肢を持たないため既定の cover 固定（Reveal.js の data-background-image 既定と同じ）。
 * .master-background と同じ要素・レイヤーで描くことで、本編・発表者ビュー・編集プレビュー・PDF書き出しの
 * 4経路すべてで効くようにする（従来の data-background-* は Reveal.js の背景レイヤー経由のため4経路中1つしか効かなかった）
 */
function metaBackgroundElementStyle(meta: SlideMeta | undefined): CSSProperties | undefined {
  if (!meta?.backgroundColor && !meta?.backgroundImage) return undefined
  return {
    ...(meta.backgroundColor ? { backgroundColor: meta.backgroundColor } : {}),
    ...(meta.backgroundImage ? { backgroundImage: `url(${meta.backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' } : {}),
  }
}

/** band（length未指定=辺いっぱいに広がる）/ rule（length指定=区切り線）共通のサイズ組み立て */
function stripeSize(orientation: 'horizontal' | 'vertical' | undefined, thickness: number, length?: number): CSSProperties {
  const vertical = orientation === 'vertical'
  if (length === undefined) {
    return vertical ? { width: thickness, top: 0, bottom: 0, height: 'auto' } : { height: thickness, left: 0, right: 0, width: 'auto' }
  }
  return vertical ? { width: thickness, height: length } : { width: length, height: thickness }
}

function MasterDecorationElement({ decoration, ctx }: { decoration: MasterDecoration; ctx: MasterRenderContext }) {
  switch (decoration.type) {
    case 'logo':
      return (
        <div style={decorationStyle(decoration)}>
          <FallbackImage src={decoration.src} width={decoration.width ?? 120} height={decoration.height ?? 40} alt="Logo" />
        </div>
      )

    case 'image':
      return (
        <div style={decorationStyle(decoration)}>
          <FallbackImage src={decoration.src} width={decoration.width ?? 120} height={decoration.height ?? 120} alt="" />
        </div>
      )

    case 'band': {
      const style = decorationStyle(decoration, decoration.orientation ?? 'horizontal')
      const sizeStyle = stripeSize(decoration.orientation, decoration.thickness ?? 8)
      const paint = decoration.gradient ? { backgroundImage: linearGradient(decoration.gradient) } : { backgroundColor: decoration.color ?? 'var(--theme-primary)' }
      return <div style={{ ...style, ...sizeStyle, ...paint }} />
    }

    case 'rule': {
      const style = decorationStyle(decoration)
      const sizeStyle = stripeSize(decoration.orientation, decoration.thickness ?? 2, decoration.length ?? 200)
      return <div style={{ ...style, ...sizeStyle, backgroundColor: decoration.color ?? 'var(--theme-primary)' }} />
    }

    case 'text':
      return <div style={{ ...decorationStyle(decoration), color: decoration.color ?? 'var(--theme-text-body)', fontSize: decoration.fontSize, whiteSpace: 'nowrap' }}>{renderMasterText(decoration.content, ctx)}</div>

    case 'component':
      // 未登録コンポーネントは FallbackComponent の破線枠が全スライドに並ぶのを避けるため、装飾自体を描画しない
      // （検証エラーは getMasterWarnings 経由で通常ロードのトーストに集約する）
      if (!hasComponent(decoration.name)) return null
      return <div style={decorationStyle(decoration)}>{renderRegisteredComponent(decoration.name, decoration.props)}</div>
  }
}
