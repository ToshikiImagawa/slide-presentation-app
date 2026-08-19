/**
 * 撮影シナリオ定義（slide-presentation-app 用）。
 *
 * 各シナリオは「どのパスを開き」「何を待って」「どの操作をして」撮影するかを宣言的に記述する。
 * Tauri IPC は `vite --mode screenshot` の alias で src/__screenshot__/ のモックに差し替わる。
 * スライド内容はロケール別 fixture（scripts/screenshot/fixtures/slides.{ja,en}.json）が /slides.json として配信される。
 *
 * フィールド:
 *   key      出力ファイル名（<key>.png）兼 VIEWPORTS のキー
 *   path     goto するパス（省略時は '/'）
 *   waitFor  goto 直後に出現を待つセレクタ（省略可）
 *   steps    撮影前の操作列（下記 step 語彙）
 *   assert   任意。撮影直前に「目的の画面が写っているか」を検証する関数 (lang: 'ja'|'en') => 期待テキスト。
 *            `.reveal .slides section.present` のテキストにこの文字列が含まれない場合は撮影を失敗させる
 *            （待受セレクタは満たしたが目的の画面が写っていない事故を検出する。#125）
 *
 * step の語彙:
 *   { click: selector }      要素をクリック
 *   { waitFor: selector }    要素出現を待つ
 *   { fill: selector, text } テキスト入力
 *   { press: key }           キー入力
 *   { hover: selector }      要素にホバー
 *   { hash: '#/2' }          Reveal のハッシュナビで任意スライドへジャンプ
 *   { addStyle: 'css' }      撮影用の一時 CSS を注入（シナリオ単位）
 *   { wait: ms }             指定ms待機
 *   { scrollIntoView: sel }  要素までスクロール
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

// assert の期待値をハードコードせず fixture から導出するため、ロケールごとに1回だけ読む
const fixtureSlidesCache = new Map()

/** ロケール別 fixture（撮影対象デッキ）からスライド一覧を読む */
function fixtureSlides(lang) {
  if (!fixtureSlidesCache.has(lang)) {
    const path = resolve(ROOT, `scripts/screenshot/fixtures/slides.${lang}.json`)
    fixtureSlidesCache.set(lang, JSON.parse(readFileSync(path, 'utf-8')).slides)
  }
  return fixtureSlidesCache.get(lang)
}

/** スライドの主タイトル（content.title、無ければ component.props.title。e2e/fixtures.ts の slideTitle と同じ規則） */
function slideTitle(slide) {
  const title = slide.content.title ?? slide.content.component?.props?.title
  if (!title) throw new Error(`fixture slide has no title: ${slide.id}`)
  return title
}

/** fixture の指定インデックスのスライドタイトルを期待値とする assert を作る */
function titleAssert(index) {
  return (lang) => slideTitle(fixtureSlides(lang)[index])
}

/** サンプルスライド（fixture デッキ）を開いてプレゼン画面を表示する共通ステップ */
const OPEN_SAMPLE = [{ click: '[data-testid="home-sample"]' }, { waitFor: '.reveal .slides section' }, { wait: 500 }]

/** fixture デッキの指定インデックスのスライドを表示して撮影するレイアウト用シナリオ。
 * 既定でそのスライドのタイトルが写っていることを assert する（`assert: false` で無効化できる）。
 */
function layoutScenario(key, index, extraWait = 0, assert = true) {
  return {
    key,
    waitFor: '[data-testid="home-sample"]',
    steps: [...OPEN_SAMPLE, { hash: `#/${index}` }, { wait: 700 + extraWait }],
    ...(assert ? { assert: titleAssert(index) } : {}),
  }
}

export const scenarios = [
  // ホーム画面（起動直後。plugin-store モックで「最近開いたスライド」は空表示）
  {
    key: 'home',
    waitFor: '[data-testid="home-screen"]',
    steps: [{ waitFor: '[data-testid="home-sample"]' }, { wait: 300 }],
  },

  // プレゼンテーション画面（サンプルスライドの表紙）
  {
    key: 'presentation',
    waitFor: '[data-testid="home-sample"]',
    steps: [...OPEN_SAMPLE],
  },

  // 設定ダイアログ（プレゼン画面の左ツールバーから開く）
  {
    key: 'settings',
    waitFor: '[data-testid="home-sample"]',
    steps: [...OPEN_SAMPLE, { click: '[data-testid="settings-open"]' }, { waitFor: '[data-testid="settings-dialog"]' }, { wait: 400 }],
  },

  // キーボードショートカット一覧（README に表を持たない代わりの唯一の一覧）。
  // 実機では ? キーでも開けるが、Playwright の press('?') は shiftKey なしで keyCode 191 を送るため
  // Reveal が「/」= 一時停止と解釈して pause オーバーレイが写り込む。撮影は設定ダイアログ経由で行う
  {
    key: 'shortcuts',
    waitFor: '[data-testid="home-sample"]',
    steps: [
      ...OPEN_SAMPLE,
      { click: '[data-testid="settings-open"]' },
      { waitFor: '[data-testid="settings-dialog"]' },
      { click: '[data-testid="shortcuts-open"]' },
      { waitFor: '[data-testid="shortcuts-dialog"]' },
      { wait: 400 },
    ],
  },

  // 編集モード（プレゼン画面の左ツールバーの編集ボタンから入る）。
  // enterEditMode() は Tauri IPC 不在で失敗するが catch して遷移は続くため（A-005）、screenshot モードでも到達できる。
  // dev サーバー上の撮影なので「組み込みアドオン (dev)」パネルも写る（配布ビルドには出ない）。
  {
    key: 'edit',
    waitFor: '[data-testid="home-sample"]',
    steps: [...OPEN_SAMPLE, { click: '[data-testid="edit-open"]' }, { waitFor: '[data-testid="slide-editor"]' }, { wait: 800 }],
  },

  // 発表者ビュー（別エントリを単独で開く。モックの event responder が /slides.json を注入する）
  // fixture の表紙にはスピーカーノート・要点サマリー・音声が入っているため実データ表示になる。
  {
    key: 'presenter-view',
    path: '/presenter-view.html',
    waitFor: '[data-testid="presenter-view"]',
    steps: [{ wait: 800 }],
  },

  // ツールバー（左: ホーム/設定、右: 音声再生/自動再生/自動スライドショー/発表者ビュー）。
  // 既定は opacity:0.15 なので、撮影用 CSS で不透明にして全ボタンを可視化する。
  // 表紙には voice があるため音声再生ボタンも表示される。
  {
    key: 'toolbar',
    waitFor: '[data-testid="home-sample"]',
    steps: [...OPEN_SAMPLE, { addStyle: '.toolbar { opacity: 1 !important }' }, { wait: 400 }],
  },

  // レイアウト・ギャラリー（fixture デッキの各レイアウトを個別に撮影）
  layoutScenario('layout-section', 1),
  layoutScenario('layout-content-steps', 2),
  layoutScenario('layout-content-tiles', 3),
  layoutScenario('layout-two-column', 4),
  layoutScenario('layout-bleed', 5, 1500),
  layoutScenario('layout-custom', 6, 1500),

  // ロゴ表示（meta.logo。左下に表示される。まとめスライドで見せる）。
  // 写り込み事故が起きた対象は layout-* 系のため、assert はまずそちらにだけ付ける（#125）
  layoutScenario('logo', 7, 0, false),
]
