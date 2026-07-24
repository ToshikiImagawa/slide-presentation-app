import { useEffect, useMemo, useRef, useState } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { editorUiTheme, theme } from '../theme'
import { useTranslation } from '../i18n'
import { applyTheme, applyThemeData, resetThemeOverrides } from '../applyTheme'
import { getPackageAddonNames, resolveLocalAssetPaths } from '../localSlideLoader'
import type { PresentationData, SlideData } from '../data'
import { parseSlides, serializeSlides } from './slidesSerialize'
import { SlideJsonEditor } from './SlideJsonEditor'
import { SlideMetaForm } from './SlideMetaForm'
import { SlidePreview } from './SlidePreview'
import { addBuiltinAddon, chooseExportDir, chooseSlidesSavePath, exportSlidePackage, listBuiltinAddons, removeBuiltinAddon, saveSlidesJson } from '../editModeSave'

/** 編集対象データの供給元。相対パスの生 JSON を土台にし、プレビューだけ baseDir 基準でアセット解決する */
export interface EditSource {
  /** 書換前の元 slides.json テキスト（相対アセットパス） */
  rawText: string
  /** 相対アセットの基準ディレクトリ。サンプル/新規など無い場合は空文字 */
  baseDir: string
  /** 保存ダイアログの初期パス（読込元）。サンプル/新規は undefined */
  sourcePath?: string
}

type StatusState = { kind: 'idle' | 'ok' | 'error'; message: string }

/** meta.title からパッケージ名（@slides/{name}）の初期値を生成する */
function slugify(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'slides'
}

const JSON_SYNTAX_ERROR_MARK = 'JSON 構文エラー'

/**
 * 編集画面のルート。JSON エディタ・確定フィールドのフォーム・本番同一レンダラのライブプレビューを束ね、
 * 保存 / .tgz 書き出しを行う。編集対象は相対パスの生 JSON（source.rawText）で、プレビュー表示のみ
 * baseDir 基準でアセット解決する（保存・書き出しは相対パスのまま＝可搬・無損失）。
 */
export function SlideEditor({ source, onExit }: { source: EditSource; onExit: () => void }) {
  const { t } = useTranslation()
  const [text, setText] = useState(source.rawText)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [name, setName] = useState(() => slugify(parseSlides(source.rawText).data.meta?.title ?? 'slides'))
  const [version, setVersion] = useState('1.0.0')
  const [status, setStatus] = useState<StatusState>({ kind: 'idle', message: '' })
  // 層B: 同梱可能なアドオンと、export に含める選択
  const [availableAddons, setAvailableAddons] = useState<string[]>([])
  const [selectedAddons, setSelectedAddons] = useState<string[]>([])
  // 層A: 組み込みアドオン（dev 限定・要再ビルド）
  const isDev = import.meta.env.DEV
  const [builtinAddons, setBuiltinAddons] = useState<string[]>([])
  const [newBuiltinName, setNewBuiltinName] = useState('')

  const { data, errors } = useMemo(() => parseSlides(text), [text])
  const hasSyntaxError = errors.some((e) => e.message.includes(JSON_SYNTAX_ERROR_MARK))

  // 直近の妥当データ（構文エラー編集中もプレビューを維持する＝差分描画・全再マウントなし）
  const lastValidRef = useRef<PresentationData>(data)
  if (!hasSyntaxError) lastValidRef.current = data
  const validData = lastValidRef.current

  // プレビュー用にテーマを適用（設計 §9.1 の初期方針: 同一 document。テーマ編集で live 反映）
  const themeKey = JSON.stringify({ theme: validData.theme, themeColors: validData.meta?.themeColors })
  useEffect(() => {
    resetThemeOverrides()
    void applyTheme(validData.meta?.themeColors)
    if (validData.theme) applyThemeData(validData.theme)
    // themeKey が変わったときだけ再適用する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeKey])

  // 層B: 同梱可能なアドオン一覧を baseDir/addons/manifest.json から読み、既定で全選択にする（従来の全同梱と同挙動）
  useEffect(() => {
    void getPackageAddonNames(source.baseDir).then((names) => {
      setAvailableAddons(names)
      setSelectedAddons(names)
    })
  }, [source.baseDir])

  // 層A: dev 環境でのみ組み込みアドオン一覧を読み込む（本番配布では非表示・DC-004）
  useEffect(() => {
    if (!isDev) return
    void listBuiltinAddons()
      .then(setBuiltinAddons)
      .catch(() => setBuiltinAddons([]))
  }, [isDev])

  const refreshBuiltins = () => {
    void listBuiltinAddons()
      .then(setBuiltinAddons)
      .catch(() => setBuiltinAddons([]))
  }

  const handleAddBuiltin = async () => {
    try {
      await addBuiltinAddon(newBuiltinName)
      setNewBuiltinName('')
      refreshBuiltins()
      setStatus({ kind: 'ok', message: t('edit.builtinAdded', '組み込みアドオンを追加しました（npm run build:addons で再ビルドしてください）') })
    } catch (e) {
      setStatus({ kind: 'error', message: `${t('edit.builtinAddFailed', '追加に失敗しました')}: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  const handleRemoveBuiltin = async (addon: string) => {
    try {
      await removeBuiltinAddon(addon)
      refreshBuiltins()
      setStatus({ kind: 'ok', message: t('edit.builtinRemoved', '組み込みアドオンを削除しました（要再ビルド）') })
    } catch (e) {
      setStatus({ kind: 'error', message: `${t('edit.builtinRemoveFailed', '削除に失敗しました')}: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  // プレビュー表示用のアセット解決（パッケージのみ。サンプル/新規は相対のまま app 配下で解決される）
  const previewData = useMemo<PresentationData>(() => (source.baseDir ? resolveLocalAssetPaths(validData, source.baseDir) : validData), [validData, source.baseDir])
  const slides = previewData.slides ?? []
  const clampedIndex = slides.length > 0 ? Math.min(selectedIndex, slides.length - 1) : 0
  const currentSlide: SlideData | undefined = slides[clampedIndex]

  // 保存前バリデーション: 構文・スキーマエラーがあれば書き込みを止める（FR-005）
  const canWrite = errors.length === 0
  // プレビューはデータが妥当なときだけ表示する（JSON/スキーマエラー時は不要）
  const showPreview = errors.length === 0

  const handleSave = async () => {
    if (!canWrite) {
      setStatus({ kind: 'error', message: t('edit.saveBlocked', '検証エラーがあるため保存できません') })
      return
    }
    try {
      const path = await chooseSlidesSavePath(source.sourcePath)
      if (!path) return
      await saveSlidesJson(path, text)
      setStatus({ kind: 'ok', message: `${t('edit.saved', '保存しました')}: ${path}` })
    } catch (e) {
      setStatus({ kind: 'error', message: `${t('edit.saveFailed', '保存に失敗しました')}: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  const handleExport = async () => {
    if (!canWrite) {
      setStatus({ kind: 'error', message: t('edit.exportBlocked', '検証エラーがあるため書き出せません') })
      return
    }
    try {
      const outDir = await chooseExportDir()
      if (!outDir) return
      const tgz = await exportSlidePackage(text, { outDir, name: name || 'slides', version: version || '1.0.0', baseDir: source.baseDir, includedAddons: selectedAddons })
      setStatus({ kind: 'ok', message: `${t('edit.exported', '書き出しました')}: ${tgz}` })
    } catch (e) {
      setStatus({ kind: 'error', message: `${t('edit.exportFailed', '書き出しに失敗しました')}: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  return (
    <ThemeProvider theme={editorUiTheme}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: 'var(--theme-background)', color: 'var(--theme-text-body)' }}>
        {/* ツールバー */}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1, borderBottom: '1px solid var(--theme-border)', flexWrap: 'wrap' }}>
          <Button variant="outlined" size="small" onClick={onExit}>
            {t('edit.exit', '編集を終了')}
          </Button>
          <Box sx={{ flex: 1 }} />
          <TextField label={t('edit.packageName', 'パッケージ名')} value={name} onChange={(e) => setName(e.target.value)} size="small" sx={{ width: 180 }} />
          <TextField label={t('edit.version', 'バージョン')} value={version} onChange={(e) => setVersion(e.target.value)} size="small" sx={{ width: 110 }} />
          <Button variant="outlined" size="small" onClick={handleSave} disabled={!canWrite}>
            {t('edit.save', '保存')}
          </Button>
          <Button variant="contained" size="small" onClick={handleExport} disabled={!canWrite}>
            {t('edit.export', '.tgz 書き出し')}
          </Button>
        </Stack>

        {status.kind !== 'idle' && (
          <Box role="status" sx={{ px: 2, py: 0.5, fontSize: 13, wordBreak: 'break-all', color: status.kind === 'error' ? 'var(--theme-primary)' : 'var(--theme-success)', backgroundColor: 'var(--theme-background-alt)' }}>
            {status.message}
          </Box>
        )}

        {/* 層B: 同梱アドオンの個別選択（同梱可能なアドオンがある場合のみ） */}
        {availableAddons.length > 0 && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1, py: 0.5, borderBottom: '1px solid var(--theme-border)', flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ color: 'var(--theme-text-muted)' }}>
              {t('edit.includeAddons', '同梱アドオン')}:
            </Typography>
            {availableAddons.map((addon) => (
              <FormControlLabel
                key={addon}
                control={<Checkbox size="small" checked={selectedAddons.includes(addon)} onChange={(e) => setSelectedAddons((prev) => (e.target.checked ? [...prev, addon] : prev.filter((a) => a !== addon)))} />}
                label={addon}
              />
            ))}
          </Stack>
        )}

        {/* 層A: 組み込みアドオンの増減（dev 限定・要再ビルド・DC-004。本番配布では非表示） */}
        {isDev && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1, py: 0.5, borderBottom: '1px solid var(--theme-border)', flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ color: 'var(--theme-text-muted)' }}>
              {t('edit.builtinAddons', '組み込みアドオン (dev)')}:
            </Typography>
            {builtinAddons.map((addon) => (
              <Stack key={addon} direction="row" spacing={0.5} alignItems="center" sx={{ border: '1px solid var(--theme-border)', borderRadius: 1, pl: 1 }}>
                <Typography variant="body2">{addon}</Typography>
                <Button size="small" color="inherit" onClick={() => void handleRemoveBuiltin(addon)} aria-label={t('edit.builtinRemoveAria', '{name} を削除').replace('{name}', addon)}>
                  ×
                </Button>
              </Stack>
            ))}
            <TextField size="small" placeholder={t('edit.builtinNamePlaceholder', '新規アドオン名')} value={newBuiltinName} onChange={(e) => setNewBuiltinName(e.target.value)} sx={{ width: 160 }} />
            <Button size="small" variant="outlined" onClick={() => void handleAddBuiltin()} disabled={!newBuiltinName.trim()}>
              {t('edit.builtinAdd', '追加')}
            </Button>
            <Typography variant="caption" sx={{ color: 'var(--theme-text-muted)' }}>
              {t('edit.builtinRebuildNote', '変更後は npm run build:addons が必要')}
            </Typography>
          </Stack>
        )}

        {/* 本体: 上段=フォーム(70%)＋プレビュー(30%) / 下段=slides.json（全幅）。
            プレゼン資料は横長のためプレビューは上段の 30% 側に置き、JSON 編集は下段で全幅を使う。
            JSON/スキーマエラー時はプレビューを非表示にし、フォームを全幅にする（プレビューは不要なため）。 */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minHeight: 0, p: 1 }}>
          {/* 上段: 7:3（フォーム : プレビュー）。プレビュー表示時のみ高さを固定して余白（デッドスペース）を抑える */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: showPreview ? 'minmax(0, 7fr) minmax(0, 3fr)' : '1fr' },
              gap: 1,
              flexShrink: 0,
              minHeight: 0,
              ...(showPreview ? { height: '42%' } : {}),
            }}
          >
            {/* フォーム（確定フィールド）。上段が固定高さのとき、はみ出せばこの中でスクロールする */}
            <Box sx={{ minWidth: 0, minHeight: 0, overflow: 'auto' }}>
              {hasSyntaxError ? (
                <Typography variant="body2" sx={{ p: 1, color: 'var(--theme-primary)' }}>
                  {t('edit.formDisabled', 'JSON に構文エラーがあるためフォーム編集は無効です')}
                </Typography>
              ) : (
                <SlideMetaForm value={validData} onChange={(next) => setText(serializeSlides(next))} />
              )}
            </Box>

            {/* プレビュー（従）。JSON/スキーマエラー時は非表示にしフォームを全幅にする */}
            {showPreview && (
              <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, gap: 0.5 }}>
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                  <Button size="small" onClick={() => setSelectedIndex((i) => Math.max(0, i - 1))} disabled={clampedIndex <= 0}>
                    ‹
                  </Button>
                  <Typography variant="body2">{slides.length > 0 ? `${clampedIndex + 1} / ${slides.length}` : '0 / 0'}</Typography>
                  <Button size="small" onClick={() => setSelectedIndex((i) => Math.min(slides.length - 1, i + 1))} disabled={clampedIndex >= slides.length - 1}>
                    ›
                  </Button>
                </Stack>
                <Box sx={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Box sx={{ width: '100%', aspectRatio: '16 / 9', maxHeight: '100%', border: '1px solid var(--theme-border)', borderRadius: 1, overflow: 'hidden', backgroundColor: 'var(--theme-background-alt)' }}>
                    {currentSlide ? (
                      // プレビューだけはプレゼン用テーマ（スライド本来のフォントサイズ）で描画する。編集 chrome は editorUiTheme のまま
                      <ThemeProvider theme={theme}>
                        <SlidePreview slide={currentSlide} />
                      </ThemeProvider>
                    ) : (
                      <Box sx={{ p: 2, color: 'var(--theme-text-muted)' }}>{t('edit.noSlides', 'スライドがありません')}</Box>
                    )}
                  </Box>
                </Box>
              </Box>
            )}
          </Box>

          {/* 下段: slides.json（全幅・残り高さいっぱい・内部スクロール） */}
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <SlideJsonEditor value={text} onChange={setText} errors={errors} />
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  )
}
