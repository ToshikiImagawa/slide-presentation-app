import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { LogoConfig, SlideMeta } from '../data'
import { SlideFrame } from './SlideFrame'

type Props = { id: string; title: string; meta?: SlideMeta; logo?: LogoConfig; children: React.ReactNode }

export function ContentLayout({ id, title, meta, logo, children }: Props) {
  return (
    <SlideFrame id={id} meta={meta} logo={logo}>
      <Typography variant="h2" className="slide-title">
        {title}
      </Typography>
      <Box className="content-area">{children}</Box>
    </SlideFrame>
  )
}
