import { describe, it, expect } from 'vitest'
import { upsertRecentEntry, removeRecentEntry, extractAddonBundlePaths, resolveAddonTrust } from '../localSlideLoader'
import type { RecentSlidePackageEntry } from '../localSlideLoader'

function entry(path: string, openedAt = 0): RecentSlidePackageEntry {
  return { path, title: path, openedAt }
}

describe('upsertRecentEntry', () => {
  it('新しい entry を先頭に追加する', () => {
    const list = [entry('/a'), entry('/b')]
    const result = upsertRecentEntry(list, entry('/c'))
    expect(result.map((e) => e.path)).toEqual(['/c', '/a', '/b'])
  })

  it('同一 path が既にある場合は重複排除して先頭に移動する', () => {
    const list = [entry('/a'), entry('/b'), entry('/c')]
    const result = upsertRecentEntry(list, entry('/b', 99))
    expect(result.map((e) => e.path)).toEqual(['/b', '/a', '/c'])
    expect(result[0].openedAt).toBe(99)
  })

  it('上限件数を超えた古いエントリを切り落とす', () => {
    const list = [entry('/a'), entry('/b'), entry('/c')]
    const result = upsertRecentEntry(list, entry('/d'), 3)
    expect(result.map((e) => e.path)).toEqual(['/d', '/a', '/b'])
  })
})

describe('removeRecentEntry', () => {
  it('指定 path のエントリを取り除く', () => {
    const list = [entry('/a'), entry('/b'), entry('/c')]
    const result = removeRecentEntry(list, '/b')
    expect(result.map((e) => e.path)).toEqual(['/a', '/c'])
  })

  it('存在しない path を指定した場合は変化しない', () => {
    const list = [entry('/a'), entry('/b')]
    const result = removeRecentEntry(list, '/z')
    expect(result.map((e) => e.path)).toEqual(['/a', '/b'])
  })
})

describe('extractAddonBundlePaths', () => {
  it('addons/ 配下の bundle を相対パスで取り出す', () => {
    const manifest = { addons: [{ name: 'x', bundle: 'addons/addons.iife.js' }] }
    expect(extractAddonBundlePaths(manifest)).toEqual(['addons/addons.iife.js'])
  })

  it('先頭スラッシュ付きの絶対パスを正規化する', () => {
    const manifest = { addons: [{ name: 'x', bundle: '/addons/addons.iife.js' }] }
    expect(extractAddonBundlePaths(manifest)).toEqual(['addons/addons.iife.js'])
  })

  it('addons/ 以外（スコープ外）のパスを除外する', () => {
    const manifest = { addons: [{ bundle: 'addons/ok.js' }, { bundle: '../evil.js' }, { bundle: 'other/x.js' }] }
    expect(extractAddonBundlePaths(manifest)).toEqual(['addons/ok.js'])
  })

  it('addons 配列がない・不正な manifest では空配列を返す', () => {
    expect(extractAddonBundlePaths({})).toEqual([])
    expect(extractAddonBundlePaths(null)).toEqual([])
    expect(extractAddonBundlePaths('nope')).toEqual([])
    expect(extractAddonBundlePaths({ addons: 'x' })).toEqual([])
  })

  it('bundle が文字列でないエントリを除外する', () => {
    const manifest = { addons: [{ bundle: 42 }, { bundle: 'addons/ok.js' }, {}] }
    expect(extractAddonBundlePaths(manifest)).toEqual(['addons/ok.js'])
  })
})

describe('resolveAddonTrust', () => {
  it('一律無効化が ON なら判断内容に関わらず deny', () => {
    expect(resolveAddonTrust(true, undefined)).toBe('deny')
    expect(resolveAddonTrust(true, 'allowed')).toBe('deny')
  })

  it('許可済みは allow', () => {
    expect(resolveAddonTrust(false, 'allowed')).toBe('allow')
  })

  it('拒否済みは deny', () => {
    expect(resolveAddonTrust(false, 'denied')).toBe('deny')
  })

  it('未判断は prompt（既定は呼び出し側で拒否）', () => {
    expect(resolveAddonTrust(false, undefined)).toBe('prompt')
  })
})
