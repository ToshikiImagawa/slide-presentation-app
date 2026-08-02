import Box from '@mui/material/Box'
import type { LogoConfig, SlideMeta } from '../data'
import { SlideFrame } from './SlideFrame'

type Props = { id: string; meta?: SlideMeta; logo?: LogoConfig; children: React.ReactNode }

export function TitleLayout({ id, meta, logo, children }: Props) {
  return (
    <SlideFrame id={id} meta={meta} logo={logo}>
      <Box className="title-layout">{children}</Box>
    </SlideFrame>
  )
}
