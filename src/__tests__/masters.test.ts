import { describe, it, expect, beforeEach } from 'vitest'
import { resolveMaster, buildMasterCss, getMasterWarnings } from '../masters'
import { clearRegistry, registerDefaultComponent } from '../components/ComponentRegistry'
import type { ThemeData } from '../data'

describe('resolveMaster', () => {
  it('masterMap 未指定なら undefined を返す（現行と完全同一のDOMにフォールバック）', () => {
    expect(resolveMaster(undefined, 'content')).toBeUndefined()
    expect(resolveMaster({}, 'content')).toBeUndefined()
  })

  it('masterMap が参照する masterKey が masters に存在しないなら undefined を返す', () => {
    const theme: ThemeData = { masterMap: { content: 'missing' } }
    expect(resolveMaster(theme, 'content')).toBeUndefined()
  })

  it('masterMap 経由で masterKey と decorations を解決する', () => {
    const theme: ThemeData = {
      masters: { standard: { decorations: [{ type: 'logo', anchor: 'top-left', src: '/logo.png' }] } },
      masterMap: { content: 'standard' },
    }
    const resolved = resolveMaster(theme, 'content')
    expect(resolved?.masterKey).toBe('standard')
    expect(resolved?.decorations).toEqual([{ type: 'logo', anchor: 'top-left', src: '/logo.png' }])
  })

  it('layout に対応する masterMap エントリがない場合は undefined を返す', () => {
    const theme: ThemeData = {
      masters: { standard: { decorations: [] } },
      masterMap: { content: 'standard' },
    }
    expect(resolveMaster(theme, 'bleed')).toBeUndefined()
  })

  it('extends で親の decorations を継承する（親→子の順にマージ）', () => {
    const theme: ThemeData = {
      masters: {
        base: { decorations: [{ type: 'band', anchor: 'top-center' }] },
        standard: { extends: 'base', decorations: [{ type: 'logo', anchor: 'bottom-left', src: '/logo.png' }] },
      },
      masterMap: { content: 'standard' },
    }
    const resolved = resolveMaster(theme, 'content')
    expect(resolved?.decorations).toEqual([
      { type: 'band', anchor: 'top-center' },
      { type: 'logo', anchor: 'bottom-left', src: '/logo.png' },
    ])
  })

  it('extends が循環している場合は undefined を返す（無限ループにならず、現行と完全同一のDOMにフォールバック）', () => {
    const theme: ThemeData = {
      masters: {
        a: { extends: 'b', decorations: [{ type: 'band', anchor: 'top-center' }] },
        b: { extends: 'a', decorations: [{ type: 'rule', anchor: 'bottom-center' }] },
      },
      masterMap: { content: 'a' },
    }
    expect(resolveMaster(theme, 'content')).toBeUndefined()
  })

  it('extends が存在しない masterKey を指す場合はその部分の decorations を無視して解決する', () => {
    const theme: ThemeData = {
      masters: { standard: { extends: 'missing', decorations: [{ type: 'logo', anchor: 'top-left', src: '/logo.png' }] } },
      masterMap: { content: 'standard' },
    }
    const resolved = resolveMaster(theme, 'content')
    expect(resolved?.decorations).toEqual([{ type: 'logo', anchor: 'top-left', src: '/logo.png' }])
  })

  // #185: 解決順序（①opts.master → ②masterMap["layout/variant"] → ③masterMap["layout"] → ④解決なし）
  describe('解決順序（#185）', () => {
    const theme: ThemeData = {
      masters: {
        direct: { decorations: [{ type: 'logo', anchor: 'top-left', src: '/direct.png' }] },
        variantMaster: { decorations: [{ type: 'band', anchor: 'top-center' }] },
        layoutMaster: { decorations: [{ type: 'rule', anchor: 'bottom-center' }] },
      },
      masterMap: { 'center/section': 'variantMaster', center: 'layoutMaster' },
    }

    it('opts.master が最優先で解決される（masterMap を無視する）', () => {
      const resolved = resolveMaster(theme, 'center', { master: 'direct', variant: 'section' })
      expect(resolved?.masterKey).toBe('direct')
    })

    it('opts.master 未指定時は masterMap["layout/variant"] を優先する', () => {
      const resolved = resolveMaster(theme, 'center', { variant: 'section' })
      expect(resolved?.masterKey).toBe('variantMaster')
    })

    it('variant に対応する masterMap エントリがなければ masterMap["layout"] にフォールバックする', () => {
      const resolved = resolveMaster(theme, 'center', { variant: 'unknown' })
      expect(resolved?.masterKey).toBe('layoutMaster')
    })

    it('opts.master が存在しない masterKey の場合は次の候補（masterMap["layout/variant"]）へフォールバックする', () => {
      const resolved = resolveMaster(theme, 'center', { master: 'missing', variant: 'section' })
      expect(resolved?.masterKey).toBe('variantMaster')
    })

    it('variant 未指定なら masterMap["layout"] を使う（既存動作と同一）', () => {
      const resolved = resolveMaster(theme, 'center')
      expect(resolved?.masterKey).toBe('layoutMaster')
    })

    it('候補がすべて未解決なら undefined を返す', () => {
      expect(resolveMaster(theme, 'bleed')).toBeUndefined()
    })
  })
})

describe('buildMasterCss', () => {
  it('tokens 未指定なら空文字を返す', () => {
    expect(buildMasterCss(undefined)).toBe('')
  })

  it('masterKey ごとに section[data-master] スコープのCSS変数を出力する', () => {
    const css = buildMasterCss({ standard: { 'band-color': '#123456' } })
    expect(css).toBe('section[data-master="standard"] { --band-color: #123456; }')
  })

  it('vars が空の masterKey はスキップする', () => {
    expect(buildMasterCss({ empty: {} })).toBe('')
  })
})

describe('getMasterWarnings', () => {
  it('theme 未指定なら警告なし', () => {
    expect(getMasterWarnings(undefined)).toEqual([])
  })

  it('masters/masterMap/tokens 未指定なら警告なし', () => {
    expect(getMasterWarnings({})).toEqual([])
  })

  it('masterMap が存在しない masterKey を参照する場合に警告する', () => {
    const warnings = getMasterWarnings({ masterMap: { content: 'missing' } })
    expect(warnings).toContain('theme.masterMap.content: 存在しない masterKey "missing" を参照しています')
  })

  // #185: slide.meta.master（スライド個別指定）の検証
  it('slides を渡さない場合は slide.meta.master の検証をスキップする', () => {
    const theme: ThemeData = { masters: { standard: { decorations: [] } } }
    expect(getMasterWarnings(theme)).toEqual([])
  })

  it('slide.meta.master が存在しない masterKey を参照する場合に警告する', () => {
    const theme: ThemeData = { masters: { standard: { decorations: [] } } }
    const warnings = getMasterWarnings(theme, [{ id: 's1', layout: 'center', content: {}, meta: { master: 'missing' } }])
    expect(warnings).toContain('slides[0].meta.master: 存在しない masterKey "missing" を参照しています')
  })

  it('slide.meta.master が存在する masterKey を参照する場合は警告しない', () => {
    const theme: ThemeData = { masters: { standard: { decorations: [] } } }
    const warnings = getMasterWarnings(theme, [{ id: 's1', layout: 'center', content: {}, meta: { master: 'standard' } }])
    expect(warnings).toEqual([])
  })

  it('extends が存在しない masterKey を参照する場合に警告する', () => {
    const warnings = getMasterWarnings({ masters: { standard: { extends: 'missing', decorations: [] } } })
    expect(warnings).toContain('theme.masters.standard.extends: 存在しない masterKey "missing" を参照しています')
  })

  it('extends の循環を検出して警告する', () => {
    const warnings = getMasterWarnings({ masters: { a: { extends: 'b', decorations: [] }, b: { extends: 'a', decorations: [] } } })
    expect(warnings.some((w) => w.includes('extends が循環しています'))).toBe(true)
  })

  it('decoration.type の綴りミスを警告する', () => {
    const theme = { masters: { standard: { decorations: [{ type: 'logooo', anchor: 'top-left' }] } } } as unknown as ThemeData
    const warnings = getMasterWarnings(theme)
    expect(warnings.some((w) => w.includes('.type: 不明な種別'))).toBe(true)
  })

  it('anchor の綴りミスを警告する', () => {
    const theme = { masters: { standard: { decorations: [{ type: 'logo', anchor: 'top-lft', src: '/logo.png' }] } } } as unknown as ThemeData
    const warnings = getMasterWarnings(theme)
    expect(warnings.some((w) => w.includes('.anchor: 不明な値'))).toBe(true)
  })

  it('only/layer の綴りミスを警告する', () => {
    const theme = { masters: { standard: { decorations: [{ type: 'logo', anchor: 'top-left', src: '/logo.png', only: 'furst', layer: 'behind' }] } } } as unknown as ThemeData
    const warnings = getMasterWarnings(theme)
    expect(warnings.some((w) => w.includes('.only: 不明な値'))).toBe(true)
    expect(warnings.some((w) => w.includes('.layer: 不明な値'))).toBe(true)
  })

  it('tokens が存在しない masterKey を参照する場合に警告する', () => {
    const warnings = getMasterWarnings({ tokens: { missing: { color: '#fff' } } })
    expect(warnings).toContain('theme.tokens.missing: 存在しない masterKey です')
  })

  it('妥当な masters/masterMap/tokens では警告なし', () => {
    const theme: ThemeData = {
      masters: { standard: { decorations: [{ type: 'logo', anchor: 'top-left', src: '/logo.png' }] } },
      masterMap: { content: 'standard' },
      tokens: { standard: { color: '#fff' } },
    }
    expect(getMasterWarnings(theme)).toEqual([])
  })

  describe('component decoration の存在判定', () => {
    beforeEach(() => {
      clearRegistry()
    })

    it('未登録コンポーネントを参照する場合に警告する', () => {
      const theme: ThemeData = { masters: { standard: { decorations: [{ type: 'component', anchor: 'top-left', name: 'Unregistered' }] } } }
      const warnings = getMasterWarnings(theme)
      expect(warnings.some((w) => w.includes('.name: 未登録のコンポーネント "Unregistered"'))).toBe(true)
    })

    it('登録済みコンポーネントを参照する場合は警告しない', () => {
      registerDefaultComponent('Registered', () => null)
      const theme: ThemeData = { masters: { standard: { decorations: [{ type: 'component', anchor: 'top-left', name: 'Registered' }] } } }
      expect(getMasterWarnings(theme)).toEqual([])
    })
  })
})
