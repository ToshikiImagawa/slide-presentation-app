import { describe, it, expect, vi } from 'vitest'
import { parseArgs, resolveExportedAssets, bakeBaseUrl } from '../export-theme.mjs'

describe('parseArgs', () => {
  it('--name / --theme を解釈する', () => {
    const r = parseArgs(['--name', 'acme-brand', '--theme', 'theme/acme.json'])
    expect(r.name).toBe('acme-brand')
    expect(r.theme).toBe('theme/acme.json')
  })

  it('--source 未指定時は public を既定とする', () => {
    expect(parseArgs(['--name', 'acme-brand', '--theme', 'theme/acme.json']).source).toBe('public')
  })

  it('--base-url / --strict を解釈する', () => {
    const r = parseArgs(['--name', 'acme-brand', '--theme', 'theme/acme.json', '--base-url', 'https://example.com/themes/acme/', '--strict'])
    expect(r.baseUrl).toBe('https://example.com/themes/acme/')
    expect(r.strict).toBe(true)
  })

  it('--base-url / --strict 未指定時は既定値のまま', () => {
    const r = parseArgs(['--name', 'acme-brand', '--theme', 'theme/acme.json'])
    expect(r.baseUrl).toBeNull()
    expect(r.strict).toBe(false)
  })
})

describe('resolveExportedAssets（#171: 再配布禁止フォントの除外をテーマ単体配布にも適用する）', () => {
  it('image/voice/theme/font 参照を抽出する', () => {
    const themeData = { colors: { primary: '#112233' }, icons: { logo: 'image/logo.png' } }
    expect(resolveExportedAssets(themeData)).toEqual(['image/logo.png'])
  })

  it('redistribution: "prohibited" な fonts.sources.src を除外する', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const themeData = {
      fonts: {
        sources: [
          { family: 'Corp', src: 'font/corp.woff2', redistribution: 'prohibited' },
          { family: 'Open', src: 'font/open.woff2', redistribution: 'permitted' },
        ],
      },
    }

    expect(resolveExportedAssets(themeData)).toEqual(['font/open.woff2'])
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('font/corp.woff2'))
    warnSpy.mockRestore()
  })

  it('アセット参照が無ければ空配列を返す', () => {
    expect(resolveExportedAssets({ colors: { primary: '#112233' } })).toEqual([])
  })
})

describe('bakeBaseUrl（配布先URL基準の絶対URL焼き込み。src/applyTheme.ts の resolveRemoteAssetPaths と対称）', () => {
  it('image/voice/theme/font 参照を baseUrl 基準の絶対URLへ書き換える', () => {
    const themeData = { icons: { logo: 'image/logo.png' }, fonts: { sources: [{ family: 'Corp', src: 'font/corp.woff2' }] } }

    const result = bakeBaseUrl(themeData, 'https://example.com/themes/acme/')

    expect(result.icons.logo).toBe('https://example.com/themes/acme/image/logo.png')
    expect(result.fonts.sources[0].src).toBe('https://example.com/themes/acme/font/corp.woff2')
  })

  it('接頭辞に一致しない文字列はそのまま保つ', () => {
    const themeData = { fonts: { heading: 'Corp Sans' } }
    expect(bakeBaseUrl(themeData, 'https://example.com/themes/acme/')).toEqual(themeData)
  })

  it('先頭スラッシュ付きの参照も正規化して書き換える', () => {
    const result = bakeBaseUrl({ icons: { logo: '/image/logo.png' } }, 'https://example.com/themes/acme/')
    expect(result.icons.logo).toBe('https://example.com/themes/acme/image/logo.png')
  })
})
