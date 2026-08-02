import type { CSSProperties } from 'react'
import { FallbackImage } from '../components/FallbackImage'
import { resolveComponent } from '../components/ComponentRegistry'
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

/** anchor（9方向）+ offset から position: absolute 用のスタイルを組み立てる */
function anchorStyle(anchor: MasterAnchor, offset?: { x?: number; y?: number }): CSSProperties {
  const [vertical, horizontal] = anchor.split('-') as ['top' | 'middle' | 'bottom', 'left' | 'center' | 'right']

  const style: CSSProperties = { position: 'absolute' }
  if (vertical === 'top') style.top = 0
  else if (vertical === 'bottom') style.bottom = 0
  else style.top = '50%'

  if (horizontal === 'left') style.left = 0
  else if (horizontal === 'right') style.right = 0
  else style.left = '50%'

  const translateX = horizontal === 'center' ? -50 : 0
  const translateY = vertical === 'middle' ? -50 : 0
  const offsetX = offset?.x ?? 0
  const offsetY = offset?.y ?? 0
  style.transform = `translate(${translateX}%, ${translateY}%) translate(${offsetX}px, ${offsetY}px)`

  return style
}

/** content 内の {index}/{total} をページ番号として展開する */
function renderTextContent(content: string, ctx: MasterRenderContext): string {
  return content.replace(/\{index\}/g, String(ctx.index + 1)).replace(/\{total\}/g, String(ctx.total))
}

function MasterDecorationElement({ decoration, ctx }: { decoration: MasterDecoration; ctx: MasterRenderContext }) {
  const style = anchorStyle(decoration.anchor, decoration.offset)

  switch (decoration.type) {
    case 'logo':
      return (
        <div style={style}>
          <FallbackImage src={decoration.src} width={decoration.width ?? 120} height={decoration.height ?? 40} alt="Logo" />
        </div>
      )

    case 'image':
      return (
        <div style={style}>
          <FallbackImage src={decoration.src} width={decoration.width ?? 120} height={decoration.height ?? 120} alt="" />
        </div>
      )

    case 'band': {
      const thickness = decoration.thickness ?? 8
      const sizeStyle: CSSProperties = decoration.orientation === 'vertical' ? { width: thickness, top: 0, bottom: 0, height: 'auto' } : { height: thickness, left: 0, right: 0, width: 'auto' }
      return <div style={{ ...style, ...sizeStyle, backgroundColor: decoration.color ?? 'var(--theme-primary)' }} />
    }

    case 'rule': {
      const thickness = decoration.thickness ?? 2
      const length = decoration.length ?? 200
      const sizeStyle: CSSProperties = decoration.orientation === 'vertical' ? { width: thickness, height: length } : { width: length, height: thickness }
      return <div style={{ ...style, ...sizeStyle, backgroundColor: decoration.color ?? 'var(--theme-primary)' }} />
    }

    case 'text':
      return <div style={{ ...style, color: decoration.color ?? 'var(--theme-text-body)', fontSize: decoration.fontSize, whiteSpace: 'nowrap' }}>{renderTextContent(decoration.content, ctx)}</div>

    case 'component': {
      const Component = resolveComponent(decoration.name)
      return (
        <div style={style}>
          <Component {...(decoration.props ?? {})} name={decoration.name} />
        </div>
      )
    }
  }
}
