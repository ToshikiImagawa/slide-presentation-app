import Box from '@mui/material/Box'
import { SlideFrame } from './SlideFrame'
import type { SlideFrameCommonProps } from './SlideFrame'

type Props = SlideFrameCommonProps & { children: React.ReactNode }

export function SectionLayout({ children, ...frameProps }: Props) {
  return (
    <SlideFrame {...frameProps}>
      <Box className="section-title-layout">{children}</Box>
    </SlideFrame>
  )
}
