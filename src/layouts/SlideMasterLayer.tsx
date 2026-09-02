import type { CSSProperties } from 'react'
import { FallbackImage } from '../components/FallbackImage'
import { hasComponent, renderRegisteredComponent } from '../components/ComponentRegistry'
import type { MasterBackground, MasterDecoration, MasterDecorationLayer, MasterGradient, MasterRenderContext, SlideMeta } from '../data'
import type { ResolvedMaster } from '../masters'
import { matchesDecorationOnly, renderMasterText } from '../masters'

/** SlideFrame が meta.logo を合成した装飾を末尾に足せるよう、ResolvedMaster から masterKey を落とした最小形。
 * masterKey はこのコンポーネント内で未使用（data-master 属性は SlideFrame 側が resolved から別途持つ）（#350） */
type MasterLike = Pick<ResolvedMaster, 'decorations' | 'background'>

type Props = {
  /** resolveMaster が解決したマスター、または meta.logo 合成済みの装飾セット。未解決（undefined）でも
   * meta 個別背景があれば描く */
  master: MasterLike | undefined
  layer: MasterDecorationLayer
  ctx: MasterRenderContext
  /** slides[].meta。backgroundColor/backgroundImage は back レイヤーで theme.masters[key].background より
   * 優先する（#236: スライド個別指定が勝つ。theme.tokens の masterKey スコープが全体スコープに勝つのと同型） */
  meta?: SlideMeta
}

/** マスター側が背景を明示しないときの既定値。デッキ既定の見た目（格子模様）を、body ではなく
 * <section> 内側の .master-background として描くための値。motion は意図的に指定しない
 * （grid/gradient は motion 省略時に既定で動く、という他の箇所と同じルールにそのまま乗せる。
 * ここだけ false を明示すると「motion 省略時の既定値」が2つに分かれて一貫しなくなる） */
const DEFAULT_MASTER_BACKGROUND: MasterBackground = { type: 'grid' }

/**
 * 指定レイヤー（back/front）の中身を組み立てる。back レイヤーは最背面に背景（#189・#236）を敷き、
 * その上に該当レイヤーの装飾（only 条件を満たすもの）を宣言順で描く。
 * レイヤー内の重なり順を知るのはこのコンポーネントだけで、SlideFrame は2つのレイヤー div を並べるだけ。
 * back レイヤーは常に何らかの背景要素を描く（meta 個別背景 → master.background → 既定 grid の優先順）。
 * front レイヤーは装飾のみのため、master が未解決なら描くものが無い。
 */
export function SlideMasterLayer({ master, layer, ctx, meta }: Props) {
  const metaBackgroundStyle = layer === 'back' ? metaBackgroundElementStyle(meta) : undefined
  if (layer === 'front' && !master) return null
  const visible = master?.decorations.filter((d) => (d.layer ?? 'back') === layer && matchesDecorationOnly(d.only, ctx)) ?? []
  const backgroundElement = layer === 'back' ? metaBackgroundStyle ? <div className="master-background" style={metaBackgroundStyle} /> : <MasterBackgroundElement background={master?.background ?? DEFAULT_MASTER_BACKGROUND} /> : null
  return (
    <>
      {backgroundElement}
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

/**
 * master の background（無地/格子/全面塗り/グラデーション/画像）を全面に敷く要素（#189）。
 * 既定の下地色（テーマ背景色）は .master-background（global.css）に持たせる（#239）。JSON側は
 * 明示指定（fill の color・grid の color 上書き）のときだけインラインで上書きし、plain・グラデーション・
 * 画像（cover 全面表示時は見えないが、image の fit: contain の余白と gradient の半透明部分では下地として
 * 透ける）は CSS の既定に委ねる。デッキ既定の格子を透かす旧来のグレーゾーン挙動より、常にテーマ背景色を
 * 下地にする方が「背景意匠の下は必ずテーマ背景色」という一貫した仕様になり、意図が説明しやすい
 */
/** motion（既定で有効・#189拡張。false を明示した場合のみ opt-out）が effect を持つのは grid/gradient のみ。
 * 他の種別では無視する */
function backgroundMotionClassName(background: MasterBackground): string | undefined {
  if (background.motion === false) return undefined
  if (background.type === 'grid') return 'master-background-motion-grid'
  if (background.type === 'gradient') return 'master-background-motion-gradient'
  return undefined
}

function MasterBackgroundElement({ background }: { background: MasterBackground }) {
  const className = ['master-background', background.type === 'grid' ? 'master-background-grid' : undefined, backgroundMotionClassName(background)].filter(Boolean).join(' ')
  return <div className={className} style={backgroundStyle(background)} />
}

function backgroundStyle(background: MasterBackground): CSSProperties {
  const base: CSSProperties = { opacity: background.opacity }
  switch (background.type) {
    case 'plain':
      return base

    case 'grid': {
      // 格子の意匠自体は .master-background-grid（global.css）に持たせ、密度だけCSS変数で上書きする。
      // color 指定時は上下フェードの色も同じ値に揃える（揃えないと下地色とフェードの境目に色差が出る）
      const density = background.size !== undefined ? ({ '--theme-background-grid-size': `${background.size}px` } as CSSProperties) : undefined
      const fadeColor = background.color ? ({ '--master-background-grid-fade-color': background.color } as CSSProperties) : undefined
      return { ...base, ...(background.color ? { backgroundColor: background.color } : {}), ...density, ...fadeColor }
    }

    case 'fill':
      return { ...base, backgroundColor: background.color }

    case 'gradient':
      // motion（既定で有効）時は masterGradientDrift（global.css）が background-position を揺らすため、
      // 動く余地を持たせて拡大する。false を明示した場合のみ拡大しない
      return { ...base, backgroundImage: linearGradient(background), ...(background.motion === false ? {} : { backgroundSize: '140% 140%' }) }

    case 'image':
      return { ...base, ...imageBackgroundStyle(background.src, background.fit) }
  }
}

/** 画像背景のCSS（master background の image 種別・meta.backgroundImage の両方で共有する） */
function imageBackgroundStyle(src: string, fit: 'cover' | 'contain' = 'cover'): CSSProperties {
  return { backgroundImage: `url(${src})`, backgroundSize: fit, backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }
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
    ...(meta.backgroundImage ? imageBackgroundStyle(meta.backgroundImage) : {}),
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
        <div style={decorationStyle(decoration)} data-testid="slide-logo">
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
      // 既定色（var(--theme-primary)）は .master-decoration-band（global.css）に持たせる（#239）。
      // JSON側は color/gradient を明示指定したときだけインラインで上書きする
      const style = decorationStyle(decoration, decoration.orientation ?? 'horizontal')
      const sizeStyle = stripeSize(decoration.orientation, decoration.thickness ?? 8)
      const paint = decoration.gradient ? { backgroundImage: linearGradient(decoration.gradient) } : decoration.color ? { backgroundColor: decoration.color } : {}
      return <div className="master-decoration-band" style={{ ...style, ...sizeStyle, ...paint }} />
    }

    case 'rule': {
      // 既定色は .master-decoration-rule（global.css）に持たせる（#239）
      const style = decorationStyle(decoration)
      const sizeStyle = stripeSize(decoration.orientation, decoration.thickness ?? 2, decoration.length ?? 200)
      const paint = decoration.color ? { backgroundColor: decoration.color } : {}
      // 負値は 0 にクランプする（getMasterWarnings が警告・#345）
      const borderRadius = decoration.borderRadius === undefined ? {} : { borderRadius: Math.max(0, decoration.borderRadius) }
      return <div className="master-decoration-rule" style={{ ...style, ...sizeStyle, ...paint, ...borderRadius }} />
    }

    case 'text':
      // 既定色は .master-decoration-text（global.css）に持たせる（#239）
      return (
        <div className="master-decoration-text" style={{ ...decorationStyle(decoration), ...(decoration.color ? { color: decoration.color } : {}), fontSize: decoration.fontSize, whiteSpace: 'nowrap' }}>
          {renderMasterText(decoration.content, ctx)}
        </div>
      )

    case 'component':
      // 未登録コンポーネントは FallbackComponent の破線枠が全スライドに並ぶのを避けるため、装飾自体を描画しない
      // （検証エラーは getMasterWarnings 経由で通常ロードのトーストに集約する）
      if (!hasComponent(decoration.name)) return null
      return <div style={decorationStyle(decoration)}>{renderRegisteredComponent(decoration.name, decoration.props)}</div>
  }
}
