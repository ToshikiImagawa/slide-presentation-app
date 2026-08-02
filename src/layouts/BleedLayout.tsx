import { ReactNode, Ref } from 'react'
import type { LogoConfig, SlideMeta } from '../data'
import { SlideFrame } from './SlideFrame'

type Props = {
  id: string
  left: ReactNode
  right: ReactNode
  meta?: SlideMeta
  logo?: LogoConfig
  sectionRef?: Ref<HTMLElement>
}

export function BleedLayout({ id, left, right, meta, logo, sectionRef }: Props) {
  return (
    <SlideFrame id={id} meta={meta} logo={logo} bodyClassName="bleed-image-layout" sectionRef={sectionRef}>
      <div className="bleed-content">{left}</div>
      {right}
    </SlideFrame>
  )
}
