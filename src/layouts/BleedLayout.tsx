import { ReactNode } from 'react'
import type { LogoConfig, MasterRenderContext, SlideMeta, ThemeData } from '../data'
import { SlideFrame } from './SlideFrame'

type Props = {
  id: string
  layout: string
  left: ReactNode
  right: ReactNode
  meta?: SlideMeta
  logo?: LogoConfig
  theme?: ThemeData
  ctx: MasterRenderContext
}

export function BleedLayout({ id, layout, left, right, meta, logo, theme, ctx }: Props) {
  return (
    <SlideFrame id={id} layout={layout} meta={meta} logo={logo} theme={theme} ctx={ctx} bleed>
      <div className="bleed-content">{left}</div>
      {right}
    </SlideFrame>
  )
}
