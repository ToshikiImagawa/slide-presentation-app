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
