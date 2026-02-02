import { ReactNode, Ref } from 'react'
import type { SlideMeta } from '../data'

type Props = {
  id: string
  left: ReactNode
  right: ReactNode
  meta?: SlideMeta
  sectionRef?: Ref<HTMLElement>
}

export function BleedLayout({ id, left, right, meta, sectionRef }: Props) {
  return (
    <section ref={sectionRef} className="slide-container bleed-image-layout" id={id} data-transition={meta?.transition} data-background-image={meta?.backgroundImage} data-background-color={meta?.backgroundColor}>
      <div className="bleed-content">{left}</div>
      {right}
    </section>
  )
}
