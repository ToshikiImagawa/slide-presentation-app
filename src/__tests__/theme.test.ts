import { describe, it, expect } from 'vitest'
import { theme } from '../theme'

describe('theme（見出しフォントの反映・#162）', () => {
  it('h1-h4 に --theme-font-heading を fontFamily として設定する', () => {
    expect(theme.typography.h1?.fontFamily).toBe('var(--theme-font-heading)')
    expect(theme.typography.h2?.fontFamily).toBe('var(--theme-font-heading)')
    expect(theme.typography.h3?.fontFamily).toBe('var(--theme-font-heading)')
    expect(theme.typography.h4?.fontFamily).toBe('var(--theme-font-heading)')
  })

  it('body1/body2 は --theme-font-heading を使わず本文フォント（--theme-font-body）のままである', () => {
    expect(theme.typography.body1?.fontFamily).toBe('var(--theme-font-body)')
    expect(theme.typography.body2?.fontFamily).toBe('var(--theme-font-body)')
  })
})
