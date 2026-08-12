import { expect } from 'vitest'

// #283: 実行時定数（masters.ts の MASTER_* や SlideRenderer.tsx の CENTER_VARIANT_NAMES）と
// schema/slide-content-schema.json の同名 enum は手作業で同期しており、ドリフト検知テストが
// src/components/__tests__ と src/data/__tests__ の2箇所に増えたため共有ヘルパーへ抽出した。
// 配置場所は両テストディレクトリの共通の親である src 直下（test-setup.ts と同階層）にし、
// どちらのテストからも `../../` で参照できるようにする。専用ディレクトリを新設すると
// 呼び出し元2箇所に対して非対称に重い構成になるため見送った（YAGNI）。
// 命名は「何と何を比較するテストのための道具か」がテスト名から検索しやすいよう
// schemaEnumTestUtils とし、比較関数名も expectRuntimeMatchesSchemaEnum とアサーションの主張を
// そのまま関数名にした（「ヘルパー」のような抽象的な語を避ける）。

/**
 * 実行時定数と JSON Schema の enum が、順序を無視して同じ集合であることを検証する。
 * 両者は別ファイルで手作業同期しているため、片方だけ更新すると失敗して更新漏れに気づける。
 * `toEqual` にそのまま渡すので、失敗時は vitest の配列 diff から食い違った要素が分かる
 * （呼び出し元のテスト名で「どの定数か」を示すこと）
 */
export function expectRuntimeMatchesSchemaEnum(runtimeValues: readonly string[], schemaEnum: readonly string[]): void {
  expect([...runtimeValues].sort()).toEqual([...schemaEnum].sort())
}
