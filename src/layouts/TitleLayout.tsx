import Box from '@mui/material/Box'
import { SlideFrame } from './SlideFrame'
import type { SlideFrameCommonProps } from './SlideFrame'

type Props = SlideFrameCommonProps & { children: React.ReactNode }

export function TitleLayout({ children, ...frameProps }: Props) {
  return (
    <SlideFrame {...frameProps}>
      <Box className="title-layout">{children}</Box>
    </SlideFrame>
  )
}
