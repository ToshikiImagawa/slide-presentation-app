import Backdrop from '@mui/material/Backdrop'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { useTranslation } from '../i18n'

type PdfExportOverlayProps = {
  open: boolean
}

/**
 * PDF書き出し中はスライドを1枚ずつ .present 化して撮影する（src/pdfExport.ts）ため、
 * 実際の画面上でスライドが切り替わって見える。ユーザーにその内部動作を見せないための遮蔽。
 */
export function PdfExportOverlay({ open }: PdfExportOverlayProps) {
  const { t } = useTranslation()

  return (
    // .toolbar が z-index: 9999（global.css）のため、それより確実に高くしてクリックを遮る
    <Backdrop open={open} sx={{ position: 'fixed', zIndex: 10000, flexDirection: 'column', gap: 2, color: '#fff' }}>
      <CircularProgress color="inherit" />
      <Typography>{t('toolbar.pdfExporting')}</Typography>
    </Backdrop>
  )
}
