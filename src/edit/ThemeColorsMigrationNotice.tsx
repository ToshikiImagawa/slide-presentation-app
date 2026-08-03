import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import { useTranslation } from '../i18n'
import type { ColorPalette } from '../data'
import { listOverriddenThemeColorKeys } from '../brandMigration'

export interface ThemeColorsMigrationNoticeProps {
  /** meta.themeColors が参照する外部パレット（取得済み） */
  themeColorsPalette: ColorPalette
  /** 解決済みの meta.brandTheme の色（未設定・未解決なら undefined。委譲可否の判定に必要） */
  brandColors?: ColorPalette
  onDelegate: () => void
}

/**
 * meta.themeColors が指定する色キーのうち、組織/ブランドテーマ（meta.brandTheme）を導入しても
 * 永久に反映されない項目数を知らせ、委譲（#172）の起点となるボタンを提供する。
 * brand が未解決（meta.brandTheme 未設定・取得失敗）の間は、委譲可否を安全に判定できないためボタンを無効化する。
 */
export function ThemeColorsMigrationNotice({ themeColorsPalette, brandColors, onDelegate }: ThemeColorsMigrationNoticeProps) {
  const { t } = useTranslation()
  const overriddenKeys = listOverriddenThemeColorKeys(themeColorsPalette)
  if (overriddenKeys.length === 0) return null

  // brand との一致判定（委譲可否の分類）は SlideEditor 側の handleDelegateThemeColors → delegateThemeColors が行う。
  // ここでは「委譲を実行できるか」だけが必要なため、brand の解決有無のみを見る
  const canDelegate = brandColors !== undefined

  return (
    <Alert severity="warning" sx={{ mb: 1 }}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <span>{t('brandMigration.notice', 'このデッキが自前指定していて組織テーマが効かない項目: {count}件').replace('{count}', String(overriddenKeys.length))}</span>
        <Tooltip title={canDelegate ? '' : t('brandMigration.needsBrandTheme', 'meta.brandTheme を設定すると委譲できます')}>
          <span>
            <Button size="small" variant="outlined" disabled={!canDelegate} onClick={onDelegate}>
              {t('brandMigration.delegateButton', 'themeColors を委譲する')}
            </Button>
          </span>
        </Tooltip>
      </Stack>
    </Alert>
  )
}
