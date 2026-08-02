import { ReactNode } from 'react'
import type { LogoConfig, SlideMeta } from '../data'
import { SlideFrame } from './SlideFrame'

type Props = {
  id: string
  left: ReactNode
  right: ReactNode
  meta?: SlideMeta
  logo?: LogoConfig
}

export function BleedLayout({ id, left, right, meta, logo }: Props) {
  return (
    <SlideFrame id={id} meta={meta} logo={logo} bodyVariant="bleed">
      <div className="bleed-content">{left}</div>
      {right}
    </SlideFrame>
  )
}
