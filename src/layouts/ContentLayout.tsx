import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { LogoConfig, MasterRenderContext, SlideMeta, ThemeData } from '../data'
import { SlideFrame } from './SlideFrame'

type Props = { id: string; layout: string; title: string; meta?: SlideMeta; logo?: LogoConfig; theme?: ThemeData; ctx: MasterRenderContext; children: React.ReactNode }

export function ContentLayout({ id, layout, title, meta, logo, theme, ctx, children }: Props) {
  return (
    <SlideFrame id={id} layout={layout} meta={meta} logo={logo} theme={theme} ctx={ctx}>
      <Typography variant="h2" className="slide-title">
        {title}
      </Typography>
      <Box className="content-area">{children}</Box>
    </SlideFrame>
  )
}
