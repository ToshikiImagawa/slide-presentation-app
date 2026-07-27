import { describe, it, expect } from 'vitest'
import { locateErrorOffset } from '../jsonPathLocator'

describe('locateErrorOffset', () => {
  it('トップレベルプロパティの path からオフセットを求める', () => {
    const text = '{\n  "meta": { "title": "" },\n  "slides": []\n}'
    const offset = locateErrorOffset(text, 'meta.title')
    expect(offset).not.toBeNull()
    expect(text.slice(offset!, offset! + 2)).toBe('""')
  })

  it('配列インデックスを含む path からオフセットを求める', () => {
    const text = '{\n  "slides": [\n    { "id": "" }\n  ]\n}'
    const offset = locateErrorOffset(text, 'slides[0].id')
    expect(offset).not.toBeNull()
    expect(text.slice(offset!, offset! + 2)).toBe('""')
  })

  it('空の path はルート要素のオフセットを返す', () => {
    const text = '  {"a":1}'
    expect(locateErrorOffset(text, '')).toBe(2)
  })

  it('path に対応する値が存在しない場合は null を返す', () => {
    const text = '{"meta": {}}'
    expect(locateErrorOffset(text, 'meta.title')).toBeNull()
  })

  it('構文エラーのテキストでは null を返す', () => {
    expect(locateErrorOffset('{ invalid', 'meta.title')).toBeNull()
  })
})
