import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'

/**
 * E2E の共有ヘルパー。
 *
 * 期待値はソースの真実（i18n リソースと撮影用 fixture）から読み込むため、文言を
 * ハードコードせず、内容が変わってもテストが自動追従する。
 */
type Lang = 'en' | 'ja'
const LOCALE_FILE: Record<Lang, string> = { en: 'en-US', ja: 'ja-JP' }

const ROOT = process.cwd()
const readJson = (p: string): Record<string, unknown> => JSON.parse(readFileSync(resolve(ROOT, p), 'utf-8'))

/** Playwright プロジェクト名（'en' / 'ja'）を言語コードに正規化する */
export function lang(projectName: string): Lang {
  return projectName === 'ja' ? 'ja' : 'en'
}

interface SlideFixture {
  id: string
  layout: string
  content: {
    title?: string
    subtitle?: string
    steps?: Array<{ title: string }>
    tiles?: Array<{ title: string }>
    component?: { props?: { title?: string } }
  }
  meta?: { notes?: { speakerNotes?: string; summary?: string[] } }
}

/** 指定プロジェクトのロケールに対応する UI 文言と fixture スライドを返す */
export function expected(projectName: string): { l: Lang; ui: any; slides: SlideFixture[] } {
  const l = lang(projectName)
  const ui = (readJson(`assets/locales/${LOCALE_FILE[l]}.json`) as { ui: unknown }).ui
  const slides = (readJson(`scripts/screenshot/fixtures/slides.${l}.json`) as { slides: SlideFixture[] }).slides
  return { l, ui, slides }
}

/** id からスライド fixture を取得する */
export function slide(projectName: string, id: string): SlideFixture {
  const found = expected(projectName).slides.find((s) => s.id === id)
  if (!found) throw new Error(`fixture slide not found: ${id}`)
  return found
}

/** スライドの主タイトル（content.title、無ければ component.props.title）を返す */
export function slideTitle(s: SlideFixture): string {
  const title = s.content.title ?? s.content.component?.props?.title
  if (!title) throw new Error(`slide has no title: ${s.id}`)
  return title
}

/** ホーム画面からサンプルデッキを開き、Reveal のスライドが描画されるまで待つ */
export async function openSample(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByTestId('home-sample').click()
  await page.waitForSelector('.reveal .slides section')
}

/** Reveal のハッシュナビで指定インデックスのスライドへ移動する */
export async function gotoSlide(page: Page, index: number): Promise<void> {
  await page.evaluate((i) => {
    window.location.hash = `#/${i}`
  }, index)
  await page.waitForTimeout(500)
}
