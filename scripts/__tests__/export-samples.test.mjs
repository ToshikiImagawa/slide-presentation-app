import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { validateManifest, getAssetName } from '../export-samples.mjs'

const projectRoot = resolve(import.meta.dirname, '../..')
const manifest = JSON.parse(readFileSync(resolve(projectRoot, 'samples/manifest.json'), 'utf-8'))

describe('getAssetName', () => {
  it('Releases のアセット名はバージョンを含まない（latest/download で参照するため）', () => {
    expect(getAssetName('template-guide-ja')).toBe('template-guide-ja.spkg')
  })
})

describe('validateManifest', () => {
  it('リポジトリの samples/manifest.json は妥当である', () => {
    const packages = validateManifest(manifest)
    expect(packages.length).toBeGreaterThan(0)
  })

  it('宣言された slides ファイルがすべて実在する', () => {
    for (const pkg of manifest.packages) {
      const path = resolve(projectRoot, manifest.source, pkg.slides)
      expect(() => readFileSync(path, 'utf-8'), `${pkg.locale}: ${path}`).not.toThrow()
    }
  })

  it('source が未指定ならエラーにする', () => {
    expect(() => validateManifest({ packages: [{ locale: 'ja', slides: 's.json', name: 'n' }], fallbackLocale: 'ja' })).toThrow(/source/)
  })

  it('packages が空ならエラーにする', () => {
    expect(() => validateManifest({ source: 'samples/x', packages: [], fallbackLocale: 'en' })).toThrow(/packages/)
  })

  it('locale の重複をエラーにする', () => {
    const dup = {
      source: 'samples/x',
      fallbackLocale: 'ja',
      packages: [
        { locale: 'ja', slides: 'a.json', name: 'a' },
        { locale: 'ja', slides: 'b.json', name: 'b' },
      ],
    }
    expect(() => validateManifest(dup)).toThrow(/重複/)
  })

  it('fallbackLocale が packages に無ければエラーにする', () => {
    const orphan = { source: 'samples/x', fallbackLocale: 'de', packages: [{ locale: 'ja', slides: 'a.json', name: 'a' }] }
    expect(() => validateManifest(orphan)).toThrow(/fallbackLocale/)
  })

  it('name が欠けていればエラーにする', () => {
    const broken = { source: 'samples/x', fallbackLocale: 'ja', packages: [{ locale: 'ja', slides: 'a.json' }] }
    expect(() => validateManifest(broken)).toThrow(/name/)
  })
})
