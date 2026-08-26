import { describe, it, expect, beforeEach } from 'vitest'
import { resolveMaster, buildMasterCss, getMasterWarnings, renderMasterText } from '../masters'
import { clearRegistry, registerDefaultComponent } from '../components/ComponentRegistry'
import type { MasterRenderContext, SectionInfo, ThemeData } from '../data'

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

  // #189: 背景意匠。マスターごとに別の背景を割り当てられ、未指定なら undefined（背景要素を描かない）
  describe('background の解決（#189）', () => {
    it('background 未指定なら undefined を返す（デッキ既定の背景がそのまま見える）', () => {
      const theme: ThemeData = { masters: { standard: { decorations: [] } }, masterMap: { content: 'standard' } }
      expect(resolveMaster(theme, 'content')?.background).toBeUndefined()
    })

    it('マスターごとに別の背景を解決する', () => {
      const theme: ThemeData = {
        masters: {
          title: { background: { type: 'fill', color: 'var(--theme-primary)' } },
          body: { background: { type: 'grid', size: 24 } },
        },
        masterMap: { center: 'title', content: 'body' },
      }
      expect(resolveMaster(theme, 'center')?.background).toEqual({ type: 'fill', color: 'var(--theme-primary)' })
      expect(resolveMaster(theme, 'content')?.background).toEqual({ type: 'grid', size: 24 })
    })

    it('extends 先の background を継承する', () => {
      const theme: ThemeData = {
        masters: {
          base: { background: { type: 'plain' }, decorations: [] },
          standard: { extends: 'base', decorations: [] },
        },
        masterMap: { content: 'standard' },
      }
      expect(resolveMaster(theme, 'content')?.background).toEqual({ type: 'plain' })
    })

    it('background は重ねられないため、自身の定義が extends 先より勝つ', () => {
      const theme: ThemeData = {
        masters: {
          base: { background: { type: 'plain' } },
          standard: { extends: 'base', background: { type: 'grid' } },
        },
        masterMap: { content: 'standard' },
      }
      expect(resolveMaster(theme, 'content')?.background).toEqual({ type: 'grid' })
    })
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

  it('予約キー "*" は :root スコープで出力する（意匠トークンの全体指定。#190）', () => {
    const css = buildMasterCss({ '*': { 'theme-radius-lg': '4px' } })
    expect(css).toBe(':root { --theme-radius-lg: 4px; }')
  })

  it('全体スコープと masterKey スコープを併記できる', () => {
    const css = buildMasterCss({ '*': { 'theme-border-width': '2px' }, standard: { 'theme-border-width': '3px' } })
    expect(css).toBe(':root { --theme-border-width: 2px; }\nsection[data-master="standard"] { --theme-border-width: 3px; }')
  })
})

// #191: text 装飾のテンプレート変数展開（ページ番号 + 章情報 + ゼロ詰め書式）
describe('renderMasterText', () => {
  const section: SectionInfo = { title: '設計', number: 3, startIndex: 4, slideCount: 2 }
  const ctx: MasterRenderContext = { index: 5, total: 10, section }

  it('{index} は1始まりのページ番号、{total} は総ページ数に展開する（既存動作）', () => {
    expect(renderMasterText('{index} / {total}', ctx)).toBe('6 / 10')
  })

  it('章番号・章タイトル・章内連番・章内枚数に展開する', () => {
    expect(renderMasterText('{sectionNumber} {sectionTitle} {sectionIndex}/{sectionTotal}', ctx)).toBe('3 設計 2/2')
  })

  it(':0N を付けた変数をN桁ゼロ詰めにする', () => {
    expect(renderMasterText('第 {sectionNumber:02} 章', ctx)).toBe('第 03 章')
    expect(renderMasterText('{index:03}', ctx)).toBe('006')
  })

  it('桁数を超える値はゼロ詰めせずそのまま出す', () => {
    expect(renderMasterText('{total:02}', { index: 0, total: 123 })).toBe('123')
  })

  it('章に属さないスライドでは章の変数を空文字にする', () => {
    expect(renderMasterText('{sectionTitle}', { index: 0, total: 3 })).toBe('')
    expect(renderMasterText('第 {sectionNumber:02} 章', { index: 0, total: 3 })).toBe('第  章')
  })

  it('未知の変数名は本文の波括弧を壊さないためそのまま残す（Object.prototype のキー名も変数として扱わない）', () => {
    expect(renderMasterText('{sectinTitle} {foo:02} {toString}', ctx)).toBe('{sectinTitle} {foo:02} {toString}')
  })
})

describe('getMasterWarnings', () => {
  /** masters.standard に定義1つだけを置いた theme の警告を返す（JSON 由来の型不一致も渡せるよう unknown で受ける）。
   * 「警告が出ない」ことを確かめる正例は、リテラル自体が DSL の型検査になるので ThemeData 注釈付きで書く */
  const warningsFor = (definition: unknown): string[] => getMasterWarnings({ masters: { standard: definition } } as unknown as ThemeData)

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

  // #350: meta.logo（LogoMasterDecoration へ合成される）の anchor/only の値検証
  describe('meta.logo の検証（#350）', () => {
    it('theme 未指定でも meta.logo.anchor の綴りミスを警告する', () => {
      const warnings = getMasterWarnings(undefined, undefined, { src: '/logo.png', anchor: 'top-lft' as never })
      expect(warnings).toContain('meta.logo.anchor: 不明な値 "top-lft" です')
    })

    it('meta.logo.only の綴りミスを警告する', () => {
      const warnings = getMasterWarnings({}, undefined, { src: '/logo.png', only: 'furst' as never })
      expect(warnings).toContain('meta.logo.only: 不明な値 "furst" です')
    })

    it('anchor/only が正しい値なら警告しない', () => {
      const warnings = getMasterWarnings({}, undefined, { src: '/logo.png', anchor: 'top-left', only: 'not-first' })
      expect(warnings).toEqual([])
    })

    it('logo 未指定なら警告しない', () => {
      expect(getMasterWarnings(undefined, undefined, undefined)).toEqual([])
    })
  })

  // #394: meta.confidential（TextMasterDecoration へ合成される）の anchor/only の値検証
  describe('meta.confidential の検証（#394）', () => {
    it('theme 未指定でも meta.confidential.anchor の綴りミスを警告する', () => {
      const warnings = getMasterWarnings(undefined, undefined, undefined, { text: 'Confidential', anchor: 'top-lft' as never })
      expect(warnings).toContain('meta.confidential.anchor: 不明な値 "top-lft" です')
    })

    it('meta.confidential.only の綴りミスを警告する', () => {
      const warnings = getMasterWarnings({}, undefined, undefined, { text: 'Confidential', only: 'furst' as never })
      expect(warnings).toContain('meta.confidential.only: 不明な値 "furst" です')
    })

    it('anchor/only が正しい値なら警告しない', () => {
      const warnings = getMasterWarnings({}, undefined, undefined, { text: 'Confidential', anchor: 'top-left', only: 'not-first' })
      expect(warnings).toEqual([])
    })

    it('confidential 未指定なら警告しない', () => {
      expect(getMasterWarnings(undefined, undefined, undefined, undefined)).toEqual([])
    })
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
    const warnings = warningsFor({ decorations: [{ type: 'logooo', anchor: 'top-left' }] })
    expect(warnings.some((w) => w.includes('.type: 不明な種別'))).toBe(true)
  })

  it('anchor の綴りミスを警告する', () => {
    const warnings = warningsFor({ decorations: [{ type: 'logo', anchor: 'top-lft', src: '/logo.png' }] })
    expect(warnings.some((w) => w.includes('.anchor: 不明な値'))).toBe(true)
  })

  it('only/layer の綴りミスを警告する', () => {
    const warnings = warningsFor({ decorations: [{ type: 'logo', anchor: 'top-left', src: '/logo.png', only: 'furst', layer: 'behind' }] })
    expect(warnings.some((w) => w.includes('.only: 不明な値'))).toBe(true)
    expect(warnings.some((w) => w.includes('.layer: 不明な値'))).toBe(true)
  })

  // #191: only の語彙拡張と text 装飾のテンプレート変数
  it('拡張した only の値（middle / section-first / not-section-first）は警告しない', () => {
    const theme: ThemeData = {
      masters: {
        standard: {
          decorations: [
            { type: 'band', anchor: 'top-center', only: 'middle' },
            { type: 'band', anchor: 'top-center', only: 'section-first' },
            { type: 'band', anchor: 'top-center', only: 'not-section-first' },
          ],
        },
      },
    }
    expect(getMasterWarnings(theme)).toEqual([])
  })

  it('text 装飾の content のテンプレート変数の綴りミスを警告する', () => {
    const theme: ThemeData = { masters: { standard: { decorations: [{ type: 'text', anchor: 'bottom-left', content: '第 {sectinNumber} 章' }] } } }
    const warnings = getMasterWarnings(theme)
    expect(warnings).toContain('theme.masters.standard.decorations[0].content: 不明なテンプレート変数 "{sectinNumber}" です（index/total/sectionNumber/sectionTitle/sectionIndex/sectionTotal のいずれかを指定してください）')
  })

  it('同じ綴りミスが複数回登場しても警告は1件にまとめる', () => {
    const theme: ThemeData = { masters: { standard: { decorations: [{ type: 'text', anchor: 'bottom-left', content: '{foo} {foo:02}' }] } } }
    expect(getMasterWarnings(theme)).toHaveLength(1)
  })

  it('既知のテンプレート変数（ゼロ詰め書式つきを含む）では警告しない', () => {
    const theme: ThemeData = { masters: { standard: { decorations: [{ type: 'text', anchor: 'bottom-left', content: '第 {sectionNumber:02} 章 {sectionTitle} — {index}/{total}' }] } } }
    expect(getMasterWarnings(theme)).toEqual([])
  })

  // #189: 背景意匠と装飾共通プロパティ（opacity / rotate）の値検証
  describe('background / opacity / rotate の検証（#189）', () => {
    it('background.type の綴りミスを警告する', () => {
      expect(warningsFor({ background: { type: 'gird' } })).toContain('theme.masters.standard.background.type: 不明な種別 "gird" です（plain/grid/fill/gradient/image のいずれかを指定してください）')
    })

    it('種別が不明な場合は以降のプロパティ検証をしない（警告は1件）', () => {
      expect(warningsFor({ background: { type: 'gird', opacity: 5 } })).toHaveLength(1)
    })

    it('background.opacity が 0〜1 の範囲外なら警告する', () => {
      expect(warningsFor({ background: { type: 'plain', opacity: 1.5 } })).toContain('theme.masters.standard.background.opacity: 0〜1 の数値を指定してください（"1.5"）')
    })

    it('grid.size が 0 以下・数値以外なら警告する', () => {
      expect(warningsFor({ background: { type: 'grid', size: 0 } }).some((w) => w.includes('.size: 0 より大きい数値'))).toBe(true)
      expect(warningsFor({ background: { type: 'grid', size: '24px' } }).some((w) => w.includes('.size: 0 より大きい数値'))).toBe(true)
    })

    it('fill に color がない場合は plain を勧めて警告する', () => {
      expect(warningsFor({ background: { type: 'fill' } }).some((w) => w.includes('type: "plain" を使ってください'))).toBe(true)
    })

    it('gradient に from / to が揃っていない場合は警告する（背景・帯装飾で共通の検証）', () => {
      expect(warningsFor({ background: { type: 'gradient', from: '#000' } })).toContain('theme.masters.standard.background: gradient には from / to の両方が必要です')
      expect(warningsFor({ decorations: [{ type: 'band', anchor: 'top-center', gradient: { from: '#000' } }] })).toContain('theme.masters.standard.decorations[0].gradient: gradient には from / to の両方が必要です')
    })

    it('image の src 欠落と fit の綴りミスを警告する', () => {
      const warnings = warningsFor({ background: { type: 'image', fit: 'fill' } })
      expect(warnings.some((w) => w.includes('.src: image には画像パスが必要です'))).toBe(true)
      expect(warnings.some((w) => w.includes('.fit: 不明な値'))).toBe(true)
    })

    it('装飾の opacity が 0〜1 の範囲外・数値以外なら警告する', () => {
      expect(warningsFor({ decorations: [{ type: 'text', anchor: 'middle-center', content: 'c', opacity: '0.5' }] })).toContain('theme.masters.standard.decorations[0].opacity: 0〜1 の数値を指定してください（"0.5"）')
    })

    it('装飾の rotate が数値でないなら警告する', () => {
      expect(warningsFor({ decorations: [{ type: 'band', anchor: 'top-center', rotate: '45deg' }] })).toContain('theme.masters.standard.decorations[0].rotate: 数値（deg）を指定してください（"45deg"）')
    })

    // #345: rule.borderRadius に負値を指定すると警告する（描画側は0にクランプするが、意図しない指定に気づけるようにする）
    it('rule の borderRadius が負値なら警告する', () => {
      expect(warningsFor({ decorations: [{ type: 'rule', anchor: 'bottom-center', borderRadius: -8 }] })).toContain('theme.masters.standard.decorations[0].borderRadius: 0 以上の数値を指定してください（"-8"。0 にクランプして描画します）')
    })

    it('rule の borderRadius が 0 以上なら警告しない', () => {
      expect(warningsFor({ decorations: [{ type: 'rule', anchor: 'bottom-center', borderRadius: 12 }] })).toEqual([])
      expect(warningsFor({ decorations: [{ type: 'rule', anchor: 'bottom-center' }] })).toEqual([])
    })

    it('妥当な background / opacity / rotate では警告しない', () => {
      const theme: ThemeData = {
        masters: {
          title: { background: { type: 'gradient', from: 'var(--theme-primary)', to: 'var(--theme-background)', angle: 135 } },
          body: {
            background: { type: 'grid', size: 24, opacity: 0.6 },
            decorations: [
              { type: 'text', anchor: 'middle-center', content: 'CONFIDENTIAL', opacity: 0, rotate: -30 },
              { type: 'band', anchor: 'top-center', gradient: { from: 'var(--theme-primary)', to: 'var(--theme-accent)' } },
            ],
          },
          cover: { background: { type: 'image', src: 'image/cover.png', fit: 'contain' } },
        },
      }
      expect(getMasterWarnings(theme)).toEqual([])
    })
  })

  it('tokens が存在しない masterKey を参照する場合に警告する', () => {
    const warnings = getMasterWarnings({ tokens: { missing: { color: '#fff' } } })
    expect(warnings).toContain('theme.tokens.missing: 存在しない masterKey です')
  })

  it('tokens の予約キー "*"（全体スコープ）は masterKey として扱わないので警告しない（#190）', () => {
    expect(getMasterWarnings({ tokens: { '*': { 'theme-radius-lg': '4px' } } })).toEqual([])
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
