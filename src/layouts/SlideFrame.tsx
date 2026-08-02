import type { ReactNode } from 'react'
import { FallbackImage } from '../components/FallbackImage'
import type { LogoConfig, MasterRenderContext, SlideMeta, ThemeData } from '../data'
import { resolveMaster } from '../masters'
import { SlideMasterLayer } from './SlideMasterLayer'

type Props = {
  id: string
  /** SlideData.layout の値。masterMap 解決に使う */
  layout: string
  meta?: SlideMeta
  logo?: LogoConfig
  theme?: ThemeData
  ctx: MasterRenderContext
  /** .master-body を余白なしの2カラムgridにする（未指定なら通常のflex中央寄せ） */
  bleed?: boolean
  children: ReactNode
}

/** 5レイアウト共通の section 生成を担う。.master-layer-back/front には masterMap 経由で解決した
 * master の装飾（SlideMasterLayer）を描く。master が未解決（masterMap未指定・masterKey不明・extends循環）
 * の場合は現行と完全同一のDOMになる。.master-layer-front はロゴ（.slide-logo-inline）も持つ。
 * 余白は section ではなく .master-body に持たせることで、本編・発表者ビュー・編集プレビュー・PDF書き出しの
 * 4経路の見た目を一致させる */
export function SlideFrame({ id, layout, meta, logo, theme, ctx, bleed, children }: Props) {
  const resolved = resolveMaster(theme, layout)

  return (
    <section className="slide-container" id={id} data-master={resolved?.masterKey} data-transition={meta?.transition} data-background-image={meta?.backgroundImage} data-background-color={meta?.backgroundColor}>
      <div className="master-layer-back">{resolved && <SlideMasterLayer decorations={resolved.decorations} layer="back" ctx={ctx} />}</div>
      <div className={bleed ? 'master-body bleed-image-layout' : 'master-body'}>{children}</div>
      <div className="master-layer-front">
        {resolved && <SlideMasterLayer decorations={resolved.decorations} layer="front" ctx={ctx} />}
        {logo && (
          <div className="slide-logo-inline">
            <FallbackImage src={logo.src} width={logo.width ?? 120} height={logo.height ?? 40} alt="Logo" />
          </div>
        )}
      </div>
    </section>
  )
}
