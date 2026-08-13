/**
 * 基準見本デッキ fixture（scripts/screenshot/fixtures/reference-deck.{ja,en}.json）と、
 * そこから導出する期待ファイル名（`${index}-${slide.id}.png`）の単一の入り口（#293）。
 *
 * 撮影（capture-reference-deck.mjs）・比較（diff-reference-deck.mjs）・CI 検知
 * （check-reference-deck-files.mjs）の3者がこの導出規則を共有する。書き写すと
 * スライドの挿入・削除・リネームで3箇所がずれ、孤児・欠落を静かに見逃す（#293 の発生源）。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

// 撮影・比較・CI検知が同じロケールの fixture を複数回読むため、ロケールごとに1回だけ読む
const fixtureCache = new Map()

/** ロケール別 fixture からスライド一覧を読む */
export function fixtureSlides(lang) {
  if (!fixtureCache.has(lang)) {
    const path = resolve(ROOT, `scripts/screenshot/fixtures/reference-deck.${lang}.json`)
    fixtureCache.set(lang, JSON.parse(readFileSync(path, 'utf-8')).slides)
  }
  return fixtureCache.get(lang)
}

/** 撮影時の命名と同じ規則で期待ファイル名を導出する */
export function expectedFileName(index, slide) {
  return `${String(index).padStart(2, '0')}-${slide.id}.png`
}

/** ロケール別 fixture から期待ファイル名の一覧を導出する（撮影枚数・比較対象の単一真実源） */
export function expectedFileNames(lang) {
  return fixtureSlides(lang).map((slide, index) => expectedFileName(index, slide))
}

/** 指定ディレクトリに存在する PNG ファイル名一覧（撮影出力先の孤児削除・CI検知の実ファイル列挙が共有） */
export function pngFileNames(dir) {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')) : []
}
