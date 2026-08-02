import type { ReactNode } from 'react'
import { FallbackImage } from '../components/FallbackImage'
import type { LogoConfig, SlideMeta } from '../data'

type Props = {
  id: string
  meta?: SlideMeta
  logo?: LogoConfig
  /** .master-body のレイアウトモード（bleed: 余白なしの2カラムgrid。未指定なら通常のflex中央寄せ） */
  bodyVariant?: 'bleed'
  children: ReactNode
}

/** 5レイアウト共通の section 生成を担う。装飾用の .master-layer-back / .master-layer-front は
 * 本チケットでは空のプレースホルダ（実装は別チケット）。余白は section ではなく .master-body に
 * 持たせることで、本編・発表者ビュー・編集プレビュー・PDF書き出しの4経路の見た目を一致させる */
export function SlideFrame({ id, meta, logo, bodyVariant, children }: Props) {
  return (
    <section className="slide-container" id={id} data-transition={meta?.transition} data-background-image={meta?.backgroundImage} data-background-color={meta?.backgroundColor}>
      <div className="master-layer-back" />
      <div className={bodyVariant === 'bleed' ? 'master-body bleed-image-layout' : 'master-body'}>{children}</div>
      <div className="master-layer-front">
        {logo && (
          <div className="slide-logo-inline">
            <FallbackImage src={logo.src} width={logo.width ?? 120} height={logo.height ?? 40} alt="Logo" />
          </div>
        )}
      </div>
    </section>
  )
}
