import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { SlideFrame } from './SlideFrame'
import type { SlideFrameCommonProps } from './SlideFrame'

type Props = SlideFrameCommonProps & { title: string; children: React.ReactNode }

export function ContentLayout({ title, children, ...frameProps }: Props) {
  return (
    <SlideFrame {...frameProps}>
      <Typography variant="h2" className="slide-title">
        {title}
      </Typography>
      <Box className="content-area">{children}</Box>
    </SlideFrame>
  )
}
