import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { json } from '@codemirror/lang-json'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import FindReplaceIcon from '@mui/icons-material/FindReplace'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import SearchIcon from '@mui/icons-material/Search'
import type { ValidationError } from '../data/types'
import { useTranslation } from '../i18n'
import { ValidationErrorList } from './ValidationErrorList'
import { findMatches, replaceAllMatches } from './textSearch'
import { jsonEditorTheme } from './jsonEditorTheme'

interface SlideJsonEditorProps {
  /** 現在の JSON テキスト（無損失往復の土台） */
  value: string
  /** テキスト変更通知（親が parseSlides で検証しプレビューへ反映する） */
  onChange: (value: string) => void
  /** 構文・スキーマ検証エラー（parseSlides の結果を外部表示する） */
  errors: ValidationError[]
}

/**
 * slides.json を編集する CodeMirror ベースのエディタ。
 * 行番号・JSON シンタックスハイライトを持ち、検証エラー一覧の行番号クリックで該当箇所へジャンプできる（DC-005 からの転換・#90）。
 * 検索(Ctrl/Cmd+F)・置換はオフセットベースの選択操作（view.dispatch）で実装し、独自オーバーレイ描画は行わない。
 * CodeMirror 内蔵の検索キーマップ（Mod-f）は既存のカスタム検索 UI と競合するため無効化する。
 */
export function SlideJsonEditor({ value, onChange, errors }: SlideJsonEditorProps) {
  const { t } = useTranslation()
  const editorRef = useRef<ReactCodeMirrorRef | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [showReplace, setShowReplace] = useState(false)
  const [query, setQuery] = useState('')
  const [replaceValue, setReplaceValue] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)

  const matches = useMemo(() => findMatches(value, query), [value, query])
  // matches の増減に応じてラップさせた「表示上の現在位置」（クランプ用の別 effect は不要）
  const activeIndex = matches.length === 0 ? -1 : ((currentIndex % matches.length) + matches.length) % matches.length

  // 現在のマッチをエディタ上で選択状態にし、該当行が見える位置までスクロールする
  useEffect(() => {
    if (!searchOpen || activeIndex < 0) return
    const view = editorRef.current?.view
    if (!view) return
    const { start, end } = matches[activeIndex]
    view.dispatch({ selection: { anchor: start, head: end }, scrollIntoView: true })
  }, [activeIndex, matches, searchOpen])

  /** 指定オフセットへカーソルを移動しスクロールする（検証エラーの行番号ジャンプ用・#90） */
  function jumpToOffset(offset: number) {
    const view = editorRef.current?.view
    if (!view) return
    view.dispatch({ selection: { anchor: offset }, scrollIntoView: true })
    view.focus()
  }

  function handleQueryChange(next: string) {
    setQuery(next)
    setCurrentIndex(0)
  }

  function closeSearch() {
    setSearchOpen(false)
    setShowReplace(false)
    setQuery('')
    setReplaceValue('')
    setCurrentIndex(0)
    editorRef.current?.view?.focus()
  }

  function goNext() {
    if (matches.length === 0) return
    setCurrentIndex((i) => i + 1)
  }

  function goPrev() {
    if (matches.length === 0) return
    setCurrentIndex((i) => i - 1)
  }

  function handleReplaceCurrent() {
    if (activeIndex < 0) return
    const { start, end } = matches[activeIndex]
    onChange(value.slice(0, start) + replaceValue + value.slice(end))
  }

  function handleReplaceAll() {
    if (matches.length === 0) return
    onChange(replaceAllMatches(value, matches, replaceValue))
  }

  function handleContainerKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const isFindShortcut = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f'
    if (isFindShortcut) {
      e.preventDefault()
      setSearchOpen(true)
      return
    }
    if (!searchOpen) return
    if (e.key === 'Escape') {
      e.preventDefault()
      closeSearch()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) goPrev()
      else goNext()
    }
  }

  const jsonLabel = t('edit.jsonLabel', 'slides.json')

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 0.5, position: 'relative' }} onKeyDown={handleContainerKeyDown}>
      <Typography variant="caption" sx={{ color: 'var(--fixed-text-muted)' }}>
        {jsonLabel}
      </Typography>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <CodeMirror
          ref={editorRef}
          value={value}
          onChange={onChange}
          height="100%"
          style={{ height: '100%' }}
          basicSetup={{ searchKeymap: false }}
          extensions={[json(), jsonEditorTheme, EditorView.contentAttributes.of({ 'aria-label': jsonLabel })]}
        />
      </Box>
      {!searchOpen && (
        <Button size="small" onClick={() => setSearchOpen(true)} aria-label={t('edit.searchOpen', '検索')} sx={{ position: 'absolute', top: 24, right: 8, minWidth: 0, p: 0.5, zIndex: 1 }}>
          <SearchIcon fontSize="small" />
        </Button>
      )}
      {searchOpen && (
        <Box
          sx={{
            position: 'absolute',
            top: 24,
            right: 8,
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.5,
            p: 1,
            borderRadius: 1,
            backgroundColor: 'var(--fixed-background-alt)',
            border: '1px solid var(--fixed-border)',
            boxShadow: 3,
          }}
        >
          <Stack direction="row" spacing={0.5} alignItems="center">
            <TextField size="small" autoFocus value={query} onChange={(e) => handleQueryChange(e.target.value)} placeholder={t('edit.searchPlaceholder', '検索...')} aria-label={t('edit.searchPlaceholder', '検索...')} sx={{ width: 160 }} />
            <Typography variant="caption" sx={{ color: 'var(--fixed-text-body)', minWidth: 40, textAlign: 'center' }}>
              {matches.length > 0 ? `${activeIndex + 1}/${matches.length}` : '0/0'}
            </Typography>
            <Button size="small" onClick={goPrev} disabled={matches.length === 0} aria-label={t('edit.searchPrevious', '前のマッチへ')} sx={{ minWidth: 0, p: 0.5 }}>
              <KeyboardArrowUpIcon fontSize="small" />
            </Button>
            <Button size="small" onClick={goNext} disabled={matches.length === 0} aria-label={t('edit.searchNext', '次のマッチへ')} sx={{ minWidth: 0, p: 0.5 }}>
              <KeyboardArrowDownIcon fontSize="small" />
            </Button>
            <Button size="small" onClick={() => setShowReplace((v) => !v)} aria-label={t('edit.searchToggleReplace', '置換を表示')} aria-pressed={showReplace} sx={{ minWidth: 0, p: 0.5 }}>
              <FindReplaceIcon fontSize="small" />
            </Button>
            <Button size="small" onClick={closeSearch} aria-label={t('edit.searchClose', '検索を閉じる')} sx={{ minWidth: 0, p: 0.5 }}>
              <CloseIcon fontSize="small" />
            </Button>
          </Stack>
          {showReplace && (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <TextField
                size="small"
                value={replaceValue}
                onChange={(e) => setReplaceValue(e.target.value)}
                placeholder={t('edit.searchReplacePlaceholder', '置換後の文字列')}
                aria-label={t('edit.searchReplacePlaceholder', '置換後の文字列')}
                sx={{ width: 160 }}
              />
              <Button size="small" onClick={handleReplaceCurrent} disabled={matches.length === 0}>
                {t('edit.searchReplace', '置換')}
              </Button>
              <Button size="small" onClick={handleReplaceAll} disabled={matches.length === 0}>
                {t('edit.searchReplaceAll', 'すべて置換')}
              </Button>
            </Stack>
          )}
        </Box>
      )}
      <ValidationErrorList errors={errors} text={value} onJumpToOffset={jumpToOffset} sx={{ flexShrink: 0 }} />
    </Box>
  )
}
