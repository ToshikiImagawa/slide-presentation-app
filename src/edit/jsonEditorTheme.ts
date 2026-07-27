import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { tags } from '@lezer/highlight'

/** エディタ chrome の固定パレット（--fixed-*）のみで構成する CodeMirror の見た目（A-002 準拠） */
const baseTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--fixed-background)',
      color: 'var(--fixed-text-body)',
      fontSize: '13px',
      border: '1px solid var(--fixed-border)',
      borderRadius: '4px',
    },
    '&.cm-focused': {
      outline: 'none',
      borderColor: 'var(--fixed-primary)',
    },
    '.cm-content': {
      fontFamily: 'var(--fixed-font-code)',
      caretColor: 'var(--fixed-text-heading)',
    },
    '.cm-scroller': {
      overflow: 'auto',
      lineHeight: 1.5,
    },
    '.cm-gutters': {
      backgroundColor: 'var(--fixed-background-alt)',
      color: 'var(--fixed-text-muted)',
      borderRight: '1px solid var(--fixed-border)',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--fixed-background-alt)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--fixed-background-alt)',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'var(--fixed-border)',
    },
  },
  { dark: true },
)

/** JSON トークン別の配色（@lezer/json の highlight.js が付与するタグに対応） */
const jsonHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: 'var(--fixed-primary)' },
  { tag: tags.string, color: 'var(--fixed-success)' },
  { tag: [tags.number, tags.bool], color: 'var(--fixed-text-heading)' },
  { tag: tags.null, color: 'var(--fixed-text-muted)' },
  { tag: [tags.separator, tags.squareBracket, tags.brace], color: 'var(--fixed-text-muted)' },
])

export const jsonEditorTheme: Extension = [baseTheme, syntaxHighlighting(jsonHighlightStyle)]
