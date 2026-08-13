#!/usr/bin/env node
/**
 * fixture（scripts/screenshot/fixtures/reference-deck.{ja,en}.json）と
 * resources/reference-deck/{ja,en}/ の PNG ファイル名の集合を照合する（#293）。
 *
 * capture-reference-deck.mjs は撮影後に孤児を削除するが、コミット漏れ・手動追加・他ブランチとの
 * マージ等で両者がずれる可能性は残る。ファイル名の集合演算だけで判定でき、撮影も
 * フォント描画も不要なため、reference-deck:inspect と同じ Linux CI ジョブで実行できる。
 *
 * 実行: node scripts/screenshot/check-reference-deck-files.mjs
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expectedFileNames, pngFileNames } from './reference-deck-fixture.mjs'
import { LOCALES } from './vite-runtime.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DECK_DIR = 'resources/reference-deck'

function main() {
  let hasFailure = false

  for (const { dir, lang } of LOCALES) {
    const expected = new Set(expectedFileNames(lang))
    const actual = new Set(pngFileNames(resolve(ROOT, DECK_DIR, dir)))
    const orphans = [...actual].filter((name) => !expected.has(name)).sort()
    const missing = [...expected].filter((name) => !actual.has(name)).sort()

    console.log(`## ${dir} (fixture ${expected.size}枚 / 実ファイル ${actual.size}枚)`)
    for (const name of orphans) console.log(`  ❌ ${name}: 孤児（fixture に対応するスライドが無い）`)
    for (const name of missing) console.log(`  ❌ ${name}: 欠落（fixture にあるが resources/reference-deck/${dir}/ に無い）`)
    if (!orphans.length && !missing.length) console.log('  ✅ 孤児・欠落なし')
    console.log('')

    if (orphans.length || missing.length) hasFailure = true
  }

  if (hasFailure) {
    console.error('[check-files] fixture と resources/reference-deck/ のファイル名が一致しません。')
    process.exitCode = 1
  } else {
    console.log('[check-files] fixture と resources/reference-deck/ のファイル名は一致しています。')
  }
}

main()
