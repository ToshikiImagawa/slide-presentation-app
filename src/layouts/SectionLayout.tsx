import Box from '@mui/material/Box'
import type { LogoConfig, MasterRenderContext, SlideMeta, ThemeData } from '../data'
import { SlideFrame } from './SlideFrame'

type Props = { id: string; layout: string; meta?: SlideMeta; logo?: LogoConfig; theme?: ThemeData; ctx: MasterRenderContext; children: React.ReactNode }

export function SectionLayout({ id, layout, meta, logo, theme, ctx, children }: Props) {
  return (
    <SlideFrame id={id} layout={layout} meta={meta} logo={logo} theme={theme} ctx={ctx}>
      <Box className="section-title-layout">{children}</Box>
    </SlideFrame>
  )
}
