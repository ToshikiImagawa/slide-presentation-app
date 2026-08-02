import Box from '@mui/material/Box'
import type { LogoConfig, MasterRenderContext, SlideMeta, ThemeData } from '../data'
import { SlideFrame } from './SlideFrame'

type Props = { id: string; layout: string; meta?: SlideMeta; logo?: LogoConfig; theme?: ThemeData; ctx: MasterRenderContext; children: React.ReactNode }

export function TitleLayout({ id, layout, meta, logo, theme, ctx, children }: Props) {
  return (
    <SlideFrame id={id} layout={layout} meta={meta} logo={logo} theme={theme} ctx={ctx}>
      <Box className="title-layout">{children}</Box>
    </SlideFrame>
  )
}
