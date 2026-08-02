import { ReactNode } from 'react'
import { SlideFrame } from './SlideFrame'
import type { SlideFrameCommonProps } from './SlideFrame'

type Props = SlideFrameCommonProps & { left: ReactNode; right: ReactNode }

export function BleedLayout({ left, right, ...frameProps }: Props) {
  return (
    <SlideFrame {...frameProps} bleed>
      <div className="bleed-content">{left}</div>
      {right}
    </SlideFrame>
  )
}
