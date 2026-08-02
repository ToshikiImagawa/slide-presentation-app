import type { CSSProperties } from 'react'
import { FallbackImage } from '../components/FallbackImage'
import { hasComponent, renderRegisteredComponent } from '../components/ComponentRegistry'
import type { MasterAnchor, MasterDecoration, MasterDecorationLayer, MasterDecorationOnly, MasterRenderContext } from '../data'

type Props = {
  decorations: MasterDecoration[]
  layer: MasterDecorationLayer
  ctx: MasterRenderContext
}

/** master の decorations から指定レイヤー（back/front）に属し only 条件を満たすものだけを描画する */
export function SlideMasterLayer({ decorations, layer, ctx }: Props) {
  const visible = decorations.filter((d) => (d.layer ?? 'back') === layer && matchesOnly(d.only, ctx))
  return (
    <>
      {visible.map((decoration, i) => (
        <MasterDecorationElement key={i} decoration={decoration} ctx={ctx} />
      ))}
    </>
  )
}

function matchesOnly(only: MasterDecorationOnly | undefined, ctx: MasterRenderContext): boolean {
  switch (only) {
    case 'first':
      return ctx.index === 0
    case 'last':
      return ctx.index === ctx.total - 1
    case 'not-first':
      return ctx.index !== 0
    default:
      return true
  }
}

/**
 * anchor（9方向）+ offset から position: absolute 用のスタイルを組み立てる。
 * stretchAxis を指定した軸は、band が辺いっぱいに広がる際に center 系アンカー（transform: translate(-50%,...)）と
 * 衝突して画面外にずれるのを防ぐため、その軸のセンタリング transform を無効化する。
 */
function anchorStyle(anchor: MasterAnchor, offset?: { x?: number; y?: number }, stretchAxis?: 'horizontal' | 'vertical'): CSSProperties {
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
  style.transform = `translate(${translateX}%, ${translateY}%) translate(${offsetX}px, ${offsetY}px)`

  return style
}

/** band（length未指定=辺いっぱいに広がる）/ rule（length指定=区切り線）共通のサイズ組み立て */
function stripeSize(orientation: 'horizontal' | 'vertical' | undefined, thickness: number, length?: number): CSSProperties {
  const vertical = orientation === 'vertical'
  if (length === undefined) {
    return vertical ? { width: thickness, top: 0, bottom: 0, height: 'auto' } : { height: thickness, left: 0, right: 0, width: 'auto' }
  }
  return vertical ? { width: thickness, height: length } : { width: length, height: thickness }
}

/** content 内の {index}/{total} をページ番号として展開する */
function renderTextContent(content: string, ctx: MasterRenderContext): string {
  return content.replace(/\{index\}/g, String(ctx.index + 1)).replace(/\{total\}/g, String(ctx.total))
}

function MasterDecorationElement({ decoration, ctx }: { decoration: MasterDecoration; ctx: MasterRenderContext }) {
  switch (decoration.type) {
    case 'logo':
      return (
        <div style={anchorStyle(decoration.anchor, decoration.offset)}>
          <FallbackImage src={decoration.src} width={decoration.width ?? 120} height={decoration.height ?? 40} alt="Logo" />
        </div>
      )

    case 'image':
      return (
        <div style={anchorStyle(decoration.anchor, decoration.offset)}>
          <FallbackImage src={decoration.src} width={decoration.width ?? 120} height={decoration.height ?? 120} alt="" />
        </div>
      )

    case 'band': {
      const style = anchorStyle(decoration.anchor, decoration.offset, decoration.orientation ?? 'horizontal')
      const sizeStyle = stripeSize(decoration.orientation, decoration.thickness ?? 8)
      return <div style={{ ...style, ...sizeStyle, backgroundColor: decoration.color ?? 'var(--theme-primary)' }} />
    }

    case 'rule': {
      const style = anchorStyle(decoration.anchor, decoration.offset)
      const sizeStyle = stripeSize(decoration.orientation, decoration.thickness ?? 2, decoration.length ?? 200)
      return <div style={{ ...style, ...sizeStyle, backgroundColor: decoration.color ?? 'var(--theme-primary)' }} />
    }

    case 'text':
      return <div style={{ ...anchorStyle(decoration.anchor, decoration.offset), color: decoration.color ?? 'var(--theme-text-body)', fontSize: decoration.fontSize, whiteSpace: 'nowrap' }}>{renderTextContent(decoration.content, ctx)}</div>

    case 'component':
      // 未登録コンポーネントは FallbackComponent の破線枠が全スライドに並ぶのを避けるため、装飾自体を描画しない
      // （検証エラーは getMasterWarnings 経由で通常ロードのトーストに集約する）
      if (!hasComponent(decoration.name)) return null
      return <div style={anchorStyle(decoration.anchor, decoration.offset)}>{renderRegisteredComponent(decoration.name, decoration.props)}</div>
  }
}
