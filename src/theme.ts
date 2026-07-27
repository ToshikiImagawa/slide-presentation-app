import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#e07a5f' },
    background: {
      default: '#1c1917',
      paper: '#292524',
    },
    text: {
      primary: '#faf8f5',
      secondary: '#a8a29e',
    },
  },
  typography: {
    fontFamily: 'var(--theme-font-body)',
    h1: {
      fontSize: 'var(--theme-font-size-h1)',
      fontWeight: 700,
      lineHeight: 1.2,
      letterSpacing: '-0.02em',
      color: 'var(--theme-text-heading)',
    },
    h2: {
      fontSize: 'var(--theme-font-size-h2)',
      fontWeight: 700,
      lineHeight: 1.2,
      color: 'var(--theme-text-heading)',
    },
    h3: {
      fontSize: 'var(--theme-font-size-h3)',
      fontWeight: 700,
      lineHeight: 1.2,
      color: 'var(--theme-text-heading)',
    },
    h4: {
      fontSize: 'var(--theme-font-size-h4)',
      fontWeight: 700,
      lineHeight: 1.2,
      color: 'var(--theme-text-heading)',
    },
    body1: {
      fontSize: 'var(--theme-font-size-body1)',
      lineHeight: 1.6,
      color: 'var(--theme-text-body)',
    },
    body2: {
      fontSize: 'var(--theme-font-size-body2)',
      lineHeight: 1.6,
      color: 'var(--theme-text-body)',
    },
    subtitle1: {
      fontSize: 'var(--theme-font-size-subtitle1)',
      fontWeight: 400,
      lineHeight: 1.6,
      color: 'var(--theme-text-subtitle)',
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          background: 'var(--theme-background)',
          border: '1px solid var(--theme-border)',
          borderRadius: '16px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          transition: 'transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: 'var(--theme-border)',
        },
      },
    },
  },
})

/**
 * 編集画面の chrome（ツールバー・フォーム・JSON エディタ）専用の MUI テーマ。
 * 本番用 `theme` は typography を var(--theme-font-size-*)（＝スライド用の大きなサイズ）に
 * 束ねているため、同一 document で編集 UI に流用すると入力欄やラベルが巨大化する。
 * エディタ chrome は固定・コンパクトな UI サイズを使い、プレゼンのテーマはプレビューにだけ適用する
 * （設計 §9.1 のテーマ波及リスクへの対処）。パレット（ダーク・primary）は本番と揃える。
 */
export const editorUiTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#e07a5f' },
    background: {
      default: '#1c1917',
      paper: '#292524',
    },
    text: {
      primary: '#faf8f5',
      secondary: '#a8a29e',
    },
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: 13,
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
})
