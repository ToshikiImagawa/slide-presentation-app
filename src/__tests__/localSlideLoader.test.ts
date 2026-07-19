import { describe, it, expect } from 'vitest'
import { upsertRecentEntry, removeRecentEntry } from '../localSlideLoader'
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
