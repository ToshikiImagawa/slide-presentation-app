import { describe, it, expect } from 'vitest'
import ts from 'typescript'
import { extractTsCodeBlocks, extractDocTypeProperties, collectTypePropertyEntries, collectTypePropertyWarnings } from '../check-doc-references.mjs'

describe('extractTsCodeBlocks（#375: ```ts コードブロックのみを型プロパティチェックの対象にする）', () => {
  it('```ts ブロックの中身を抽出する', () => {
    const content = ['# doc', '```ts', 'type Foo = { a: string }', '```', 'text'].join('\n')
    expect(extractTsCodeBlocks(content)).toEqual(['type Foo = { a: string }'])
  })

  it('```tsx ブロックは対象外にする（JSX例示コードの疑似的な型を誤検知しないため）', () => {
    const content = ['```tsx', 'type Foo = { a: string }', '```'].join('\n')
    expect(extractTsCodeBlocks(content)).toEqual([])
  })

  it('```ts 以外の言語（```json 等）は対象外にする', () => {
    const content = ['```json', '{ "a": 1 }', '```'].join('\n')
    expect(extractTsCodeBlocks(content)).toEqual([])
  })

  it('フェンス開始行に doc-check-ignore が付いたブロックは除外する', () => {
    const content = ['```ts <!-- doc-check-ignore -->', 'type Foo = { a: string }', '```'].join('\n')
    expect(extractTsCodeBlocks(content)).toEqual([])
  })

  it('複数ブロックをすべて抽出する', () => {
    const content = ['```ts', 'type A = { x: number }', '```', 'text', '```ts', 'type B = { y: number }', '```'].join('\n')
    expect(extractTsCodeBlocks(content)).toEqual(['type A = { x: number }', 'type B = { y: number }'])
  })
})

describe('extractDocTypeProperties（#375: interface / type / 関数引数からプロパティ名を抽出する）', () => {
  it('interface のプロパティ名を抽出する', () => {
    const code = 'interface Foo {\n  a: string\n  b?: number\n}'
    expect(extractDocTypeProperties(code)).toEqual([{ typeName: 'Foo', properties: ['a', 'b'] }])
  })

  it('オブジェクトリテラル型の type エイリアスのプロパティ名を抽出する', () => {
    const code = 'type Foo = {\n  a: string\n  b: number\n}'
    expect(extractDocTypeProperties(code)).toEqual([{ typeName: 'Foo', properties: ['a', 'b'] }])
  })

  it('プリミティブ型の type エイリアス（オブジェクトリテラルでない）は対象外にする', () => {
    const code = 'type Foo = string'
    expect(extractDocTypeProperties(code)).toEqual([])
  })

  it('関数宣言のインラインオブジェクト引数からプロパティ名を抽出する', () => {
    const code = 'function foo({ a, b }: { a: string; b: number }) {}'
    expect(extractDocTypeProperties(code)).toEqual([{ typeName: 'foo', properties: ['a', 'b'] }])
  })

  it('メンバーが無い（空オブジェクト型）場合は結果に含めない', () => {
    const code = 'type Empty = {}'
    expect(extractDocTypeProperties(code)).toEqual([])
  })
})

describe('collectTypePropertyEntries（実装側の宣言からプロパティ名を集める低レベル関数）', () => {
  it('.tsx の JSX を含むソースからも interface を抽出できる', () => {
    const code = 'interface Props {\n  label: string\n}\nfunction C({ label }: Props) {\n  return <div>{label}</div>\n}'
    const sourceFile = ts.createSourceFile('sample.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    expect(collectTypePropertyEntries(sourceFile)).toEqual([{ typeName: 'Props', properties: ['label'] }])
  })
})

describe('collectTypePropertyWarnings（#375: 実装に存在しないプロパティ名だけを一方向で検出する）', () => {
  it('実装側の型にプロパティが存在する場合は警告なし', () => {
    const docTypeProperties = [{ doc: 'a.md', typeName: 'Foo', properties: ['a'] }]
    const implTypeProperties = new Map([['Foo', new Set(['a', 'b'])]])
    expect(collectTypePropertyWarnings(docTypeProperties, implTypeProperties, {})).toEqual([])
  })

  it('実装側の型に存在しないプロパティ名を警告として返す', () => {
    const docTypeProperties = [{ doc: 'a.md', typeName: 'Foo', properties: ['a', 'missing'] }]
    const implTypeProperties = new Map([['Foo', new Set(['a'])]])
    const warnings = collectTypePropertyWarnings(docTypeProperties, implTypeProperties, {})
    expect(warnings).toEqual(['a.md: 型 `Foo` のプロパティ `missing` が実装に見つかりません'])
  })

  it('型名自体が実装に存在しない場合は型同定できないため対象外にする', () => {
    const docTypeProperties = [{ doc: 'a.md', typeName: 'Unknown', properties: ['a'] }]
    const implTypeProperties = new Map([['Foo', new Set(['a'])]])
    expect(collectTypePropertyWarnings(docTypeProperties, implTypeProperties, {})).toEqual([])
  })

  it('allowlist に `型名.プロパティ名` が登録されていれば抑制する', () => {
    const docTypeProperties = [{ doc: 'a.md', typeName: 'Foo', properties: ['legacyProp'] }]
    const implTypeProperties = new Map([['Foo', new Set(['a'])]])
    const allowlist = { 'Foo.legacyProp': '旧プロパティへの言及' }
    expect(collectTypePropertyWarnings(docTypeProperties, implTypeProperties, allowlist)).toEqual([])
  })
})
