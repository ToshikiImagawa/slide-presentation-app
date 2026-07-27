import { describe, it, expect } from 'vitest'
import { findMatches, replaceAllMatches } from '../textSearch'

describe('findMatches', () => {
  it('大文字小文字を無視して一致箇所を全て返す', () => {
    expect(findMatches('{"a":"Foo","b":"foo"}', 'foo')).toEqual([
      { start: 6, end: 9 },
      { start: 16, end: 19 },
    ])
  })

  it('一致がなければ空配列を返す', () => {
    expect(findMatches('{"a":1}', 'zzz')).toEqual([])
  })

  it('query が空文字なら空配列を返す', () => {
    expect(findMatches('{"a":1}', '')).toEqual([])
  })
})

describe('replaceAllMatches', () => {
  it('matches の位置情報に従って全て置換する', () => {
    const matches = findMatches('{"a":"foo","b":"foo"}', 'foo')
    expect(replaceAllMatches('{"a":"foo","b":"foo"}', matches, 'bar')).toBe('{"a":"bar","b":"bar"}')
  })

  it('matches が空なら text をそのまま返す', () => {
    expect(replaceAllMatches('{"a":1}', [], 'bar')).toBe('{"a":1}')
  })
})
