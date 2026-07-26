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
import type { GeneratedCandidate } from '../aiGenerate'
import { parseSlides, serializeSlides, prettyPrintJson } from './slidesSerialize'
import { AiGeneratePanel } from './AiGeneratePanel'
import { GeneratedDiffDialog } from './GeneratedDiffDialog'
import { ConfirmDialog } from './ConfirmDialog'
import { SlideJsonEditor } from './SlideJsonEditor'
import { SlideMetaForm } from './SlideMetaForm'
import { SlidePreview } from './SlidePreview'
import { addBuiltinAddon, buildBuiltinAddons, chooseExportDir, chooseSlidesSavePath, exportSlidePackage, listBuiltinAddons, listBuiltinDistAddons, removeBuiltinAddon, saveSlidesJson } from '../editModeSave'

/** 編集対象データの供給元。相対パスの生 JSON を土台にし、プレビューだけ baseDir 基準でアセット解決する */
export interface EditSource {
  /** 書換前の元 slides.json テキスト（相対アセットパス） */
  rawText: string
  /** 相対アセットの基準ディレクトリ。サンプル/新規など無い場合は空文字 */
  baseDir: string
  /** 保存ダイアログの初期パス（読込元）。サンプル/新規は undefined */
  sourcePath?: string
  /** AI 生成パネルを開いた状態で編集を開始するか（ホーム画面の「AIで新規作成」導線から遷移した場合のみ true） */
  aiPanelExpanded?: boolean
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
 * 保存 / .spkg 書き出しを行う。編集対象は相対パスの生 JSON（source.rawText）で、プレビュー表示のみ
 * baseDir 基準でアセット解決する（保存・書き出しは相対パスのまま＝可搬・無損失）。
 */
export function SlideEditor({ source, onExit }: { source: EditSource; onExit: () => void }) {
  const { t } = useTranslation()
  const [text, setText] = useState(source.rawText)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [name, setName] = useState(() => slugify(parseSlides(source.rawText).data.meta?.title ?? 'slides'))
  const [version, setVersion] = useState('1.0.0')
  const [status, setStatus] = useState<StatusState>({ kind: 'idle', message: '' })
  // AI 生成結果の適用待ち候補（差分確認ダイアログで承認するまで器に触れない・①/FR-008）。
  // validationErrors は exhausted で非空になりうる残存検証エラー（差分確認ダイアログへ渡す・#47）
  const [pendingGenerated, setPendingGenerated] = useState<GeneratedCandidate | null>(null)
  // 層B: パッケージ自身の同梱可能アドオン（baseDir/addons/manifest.json）と、export に含める選択
  const [packageAddons, setPackageAddons] = useState<string[]>([])
  const [selectedAddons, setSelectedAddons] = useState<string[]>([])
  // 層A: 組み込みアドオン（dev 限定・要再ビルド）。builtinAddons=ソース(addons/src・増減UI用)、
  // builtinDistAddons=ビルド済み(addons/dist・export の同梱候補＝実際に同梱できるものだけ)
  const isDev = import.meta.env.DEV
  const [builtinAddons, setBuiltinAddons] = useState<string[]>([])
  const [builtinDistAddons, setBuiltinDistAddons] = useState<string[]>([])
  const [newBuiltinName, setNewBuiltinName] = useState('')
  // 削除確認待ちの組み込みアドオン名（× は確認ダイアログ経由。誤クリックでの完全削除を防ぐ）
  const [pendingDeleteBuiltin, setPendingDeleteBuiltin] = useState<string | null>(null)
  // 組み込みアドオンのビルド中フラグ（ボタン二重押し防止）
  const [buildingAddons, setBuildingAddons] = useState(false)
  // 編集終了確認待ち（未保存の変更があるときのみ表示。破棄によるデータ損失を防ぐ・#44）
  const [pendingExit, setPendingExit] = useState(false)

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

  // 層B: パッケージ同梱アドオン一覧を baseDir/addons/manifest.json から読み、既定で全選択にする（従来の全同梱と同挙動）。
  // 層A（組み込み）は既定では未選択＝オプトインで同梱に加える（②）
  useEffect(() => {
    void getPackageAddonNames(source.baseDir).then((names) => {
      setPackageAddons(names)
      setSelectedAddons(names)
    })
  }, [source.baseDir])

  // 同梱候補 = 層B（パッケージ）∪ 層A の**ビルド済み**（dist・実際に同梱可能なものだけ）。name で重複排除（層B 優先の並び）。
  // 未ビルドの src だけの層Aは候補に出さない（選んでも黙って落ちる齟齬を防ぐ・レビュー#4/#6）
  const availableAddons = useMemo(() => Array.from(new Set([...packageAddons, ...builtinDistAddons])), [packageAddons, builtinDistAddons])

  // 層A: dev 環境でのみ組み込みアドオン一覧を読み込む（本番配布では非表示・DC-004）。
  // src（増減 UI 用）と dist（export 同梱候補用）を別々に保持する
  useEffect(() => {
    if (!isDev) return
    void listBuiltinAddons()
      .then(setBuiltinAddons)
      .catch(() => setBuiltinAddons([]))
    void listBuiltinDistAddons()
      .then(setBuiltinDistAddons)
      .catch(() => setBuiltinDistAddons([]))
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

  // アプリから組み込みアドオンを再ビルドし、同梱候補（dist）を即更新する（ターミナル不要）
  const handleBuildBuiltins = async () => {
    setBuildingAddons(true)
    setStatus({ kind: 'ok', message: t('edit.builtinBuilding', '組み込みアドオンをビルド中…') })
    try {
      await buildBuiltinAddons()
      refreshBuiltins()
      const dist = await listBuiltinDistAddons().catch(() => [])
      setBuiltinDistAddons(dist)
      setStatus({ kind: 'ok', message: t('edit.builtinBuilt', '組み込みアドオンをビルドしました（同梱候補を更新）') })
    } catch (e) {
      setStatus({ kind: 'error', message: `${t('edit.builtinBuildFailed', 'ビルドに失敗しました')}: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setBuildingAddons(false)
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
  // 未保存の変更があるか（保存済みの元テキストとの比較。#44: データ損失防止）
  const isDirty = text !== source.rawText

  // 未保存の変更があれば確認ダイアログを挟み、無ければ即終了する
  const handleExitClick = () => {
    if (isDirty) {
      setPendingExit(true)
      return
    }
    onExit()
  }

  const confirmExit = () => {
    setPendingExit(false)
    onExit()
  }

  const cancelExit = () => {
    setPendingExit(false)
  }

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

  // AI 生成結果の受け口（#14・FR-004/DC-005）。即時置換せず、まず差分確認ダイアログへ候補を渡す（①）。
  const applyGeneratedSlides = (candidate: GeneratedCandidate) => {
    setPendingGenerated(candidate)
  }

  // 差分確認で [適用する]。候補を 2 スペース整形して単一真実源 text へ全体置換（③）。
  // 以降は既存の useMemo(parseSlides) → プレビュー/フォームへ反映される（無損失・NFR-002）。
  const confirmApplyGenerated = () => {
    if (pendingGenerated === null) return
    setText(prettyPrintJson(pendingGenerated.slidesJson))
    setSelectedIndex(0)
    setPendingGenerated(null)
    setStatus({ kind: 'ok', message: t('aiGenerate.applied', '生成結果を反映しました') })
  }

  // 差分確認で [キャンセル]。候補を破棄し器に一切触れない（安全退避・FR-008）。
  const cancelApplyGenerated = () => {
    setPendingGenerated(null)
  }

  const handleExport = async () => {
    if (!canWrite) {
      setStatus({ kind: 'error', message: t('edit.exportBlocked', '検証エラーがあるため書き出せません') })
      return
    }
    try {
      const outDir = await chooseExportDir()
      if (!outDir) return
      const pkgPath = await exportSlidePackage(text, { outDir, name: name || 'slides', version: version || '1.0.0', baseDir: source.baseDir, includedAddons: selectedAddons })
      setStatus({ kind: 'ok', message: `${t('edit.exported', '書き出しました')}: ${pkgPath}` })
    } catch (e) {
      setStatus({ kind: 'error', message: `${t('edit.exportFailed', '書き出しに失敗しました')}: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  return (
    <ThemeProvider theme={editorUiTheme}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: 'var(--theme-background)', color: 'var(--theme-text-body)' }}>
        {/* ツールバー */}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1, borderBottom: '1px solid var(--theme-border)', flexWrap: 'wrap' }}>
          <Button variant="outlined" size="small" onClick={handleExitClick}>
            {t('edit.exit', '編集を終了')}
          </Button>
          <Box sx={{ flex: 1 }} />
          <TextField label={t('edit.packageName', 'パッケージ名')} value={name} onChange={(e) => setName(e.target.value)} size="small" sx={{ width: 180 }} />
          <TextField label={t('edit.version', 'バージョン')} value={version} onChange={(e) => setVersion(e.target.value)} size="small" sx={{ width: 110 }} />
          <Button variant="outlined" size="small" onClick={handleSave} disabled={!canWrite}>
            {t('edit.save', '保存')}
          </Button>
          <Button variant="contained" size="small" onClick={handleExport} disabled={!canWrite}>
            {t('edit.export', '.spkg 書き出し')}
          </Button>
        </Stack>

        {status.kind !== 'idle' && (
          <Box role="status" sx={{ px: 2, py: 0.5, fontSize: 13, wordBreak: 'break-all', color: status.kind === 'error' ? 'var(--theme-primary)' : 'var(--theme-success)', backgroundColor: 'var(--theme-background-alt)' }}>
            {status.message}
          </Box>
        )}

        {/* 生成結果の適用前 差分確認ダイアログ（①・案3）。承認で整形して全体置換、キャンセルで破棄 */}
        <GeneratedDiffDialog
          open={pendingGenerated !== null}
          beforeText={text}
          afterText={pendingGenerated?.slidesJson ?? ''}
          validationErrors={pendingGenerated?.validationErrors ?? []}
          onApply={confirmApplyGenerated}
          onCancel={cancelApplyGenerated}
        />

        {/* 未保存の変更を破棄して編集を終了する前の確認（#44: データ損失防止） */}
        <ConfirmDialog
          open={pendingExit}
          title={t('edit.exitConfirmTitle', '未保存の変更を破棄しますか？')}
          message={t('edit.exitConfirmMessage', '編集内容は保存されていません。破棄して編集を終了しますか？')}
          confirmLabel={t('edit.exitConfirmDiscard', '破棄して終了')}
          cancelLabel={t('edit.cancel', 'キャンセル')}
          onConfirm={confirmExit}
          onCancel={cancelExit}
        />

        {/* 組み込みアドオン削除の確認（× は確認経由。addons/src を完全削除し git 管理外＝復元不可のため誤クリック防止） */}
        <ConfirmDialog
          open={pendingDeleteBuiltin !== null}
          title={t('edit.builtinRemoveConfirmTitle', '組み込みアドオンを削除しますか？')}
          message={t('edit.builtinRemoveConfirmMessage', '{name} のソース（addons/src）を完全に削除します。取り消せません（git 管理外のため復元できません）。').replace('{name}', pendingDeleteBuiltin ?? '')}
          confirmLabel={t('edit.builtinRemoveConfirm', '削除する')}
          cancelLabel={t('edit.cancel', 'キャンセル')}
          onConfirm={() => {
            const target = pendingDeleteBuiltin
            setPendingDeleteBuiltin(null)
            if (target !== null) void handleRemoveBuiltin(target)
          }}
          onCancel={() => setPendingDeleteBuiltin(null)}
        />

        {/* 同梱アドオンの個別選択（層B∪層A）。候補が無くても非表示にせず状態を明示する（②）。
            ×ボタンを層A（builtinAddons）と同じ見た目で用意し削除導線を統一する（#36）。
            チェック解除と同じ効果の可逆操作（再チェックで復帰可）のため確認ダイアログは設けない。 */}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1, py: 0.5, borderBottom: '1px solid var(--theme-border)', flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ color: 'var(--theme-text-muted)' }}>
            {t('edit.includeAddons', '同梱アドオン')}:
          </Typography>
          {availableAddons.length === 0 ? (
            <Typography variant="body2" sx={{ color: 'var(--theme-text-muted)' }}>
              {t('edit.noAddons', '同梱できるアドオンがありません')}
            </Typography>
          ) : (
            <>
              {availableAddons.map((addon) => {
                const included = selectedAddons.includes(addon)
                const exclude = () => setSelectedAddons((prev) => prev.filter((a) => a !== addon))
                return (
                  <Stack key={addon} direction="row" spacing={0.5} alignItems="center" sx={{ border: '1px solid var(--theme-border)', borderRadius: 1, pl: 1, opacity: included ? 1 : 0.6 }}>
                    <FormControlLabel sx={{ mr: 0 }} control={<Checkbox size="small" checked={included} onChange={(e) => (e.target.checked ? setSelectedAddons((prev) => [...prev, addon]) : exclude())} />} label={addon} />
                    <Button size="small" color="inherit" onClick={exclude} disabled={!included} aria-label={t('edit.packageAddonRemoveAria', '{name} をパッケージから除外').replace('{name}', addon)}>
                      ×
                    </Button>
                  </Stack>
                )
              })}
              <Typography variant="caption" sx={{ color: 'var(--theme-text-muted)' }}>
                {t('edit.packageAddonRemoveNote', '×またはチェック解除でパッケージから除外されます（再チェックで復帰可）。反映には「.spkg 書き出し」が必要です')}
              </Typography>
            </>
          )}
        </Stack>

        {/* 層A: 組み込みアドオンの増減（dev 限定・要再ビルド・DC-004。本番配布では非表示） */}
        {isDev && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1, py: 0.5, borderBottom: '1px solid var(--theme-border)', flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ color: 'var(--theme-text-muted)' }}>
              {t('edit.builtinAddons', '組み込みアドオン (dev)')}:
            </Typography>
            {builtinAddons.map((addon) => (
              <Stack key={addon} direction="row" spacing={0.5} alignItems="center" sx={{ border: '1px solid var(--theme-border)', borderRadius: 1, pl: 1 }}>
                <Typography variant="body2">{addon}</Typography>
                <Button size="small" color="inherit" onClick={() => setPendingDeleteBuiltin(addon)} aria-label={t('edit.builtinRemoveAria', '{name} を削除').replace('{name}', addon)}>
                  ×
                </Button>
              </Stack>
            ))}
            <TextField size="small" placeholder={t('edit.builtinNamePlaceholder', '新規アドオン名')} value={newBuiltinName} onChange={(e) => setNewBuiltinName(e.target.value)} sx={{ width: 160 }} />
            <Button size="small" variant="outlined" onClick={() => void handleAddBuiltin()} disabled={!newBuiltinName.trim()}>
              {t('edit.builtinAdd', '追加')}
            </Button>
            <Button size="small" variant="contained" onClick={() => void handleBuildBuiltins()} disabled={buildingAddons}>
              {buildingAddons ? t('edit.builtinBuildingShort', 'ビルド中…') : t('edit.builtinBuild', 'ビルド')}
            </Button>
            <Typography variant="caption" sx={{ color: 'var(--theme-text-muted)' }}>
              {t('edit.builtinRebuildNote', '追加/削除後は「ビルド」で同梱候補に反映されます')}
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
            {/* フォーム（確定フィールド）。上段が固定高さのとき、はみ出せばこの中でスクロールする。
                AI 生成パネル（#14）はフォームの上（＝プレビューの左）に配置する（#33）。
                生成結果は applyGeneratedSlides で差分確認ダイアログへ渡す（①） */}
            <Box sx={{ minWidth: 0, minHeight: 0, overflow: 'auto' }}>
              <AiGeneratePanel currentText={text} onApply={applyGeneratedSlides} defaultExpanded={source.aiPanelExpanded} />
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
