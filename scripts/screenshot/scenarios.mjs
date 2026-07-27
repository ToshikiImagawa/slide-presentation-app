/**
 * 撮影シナリオ定義（slide-presentation-app 用）。
 *
 * 各シナリオは「どのパスを開き」「何を待って」「どの操作をして」撮影するかを宣言的に記述する。
 * Tauri IPC は `vite --mode screenshot` の alias で src/__screenshot__/ のモックに差し替わる。
 * スライド内容は fixture（scripts/screenshot/fixtures/slides.json）が /slides.json として配信される。
 *
 * フィールド:
 *   key      出力ファイル名（<key>.png）兼 VIEWPORTS のキー
 *   path     goto するパス（省略時は '/'）
 *   waitFor  goto 直後に出現を待つセレクタ（省略可）
 *   steps    撮影前の操作列（下記 step 語彙）
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

/** サンプルスライド（fixture デッキ）を開いてプレゼン画面を表示する共通ステップ */
const OPEN_SAMPLE = [{ click: '[data-testid="home-sample"]' }, { waitFor: '.reveal .slides section' }, { wait: 500 }]

/** fixture デッキの指定インデックスのスライドを表示して撮影するレイアウト用シナリオ */
function layoutScenario(key, index, extraWait = 0) {
  return {
    key,
    waitFor: '[data-testid="home-sample"]',
    steps: [...OPEN_SAMPLE, { hash: `#/${index}` }, { wait: 700 + extraWait }],
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

  // ロゴ表示（meta.logo。左下に表示される。まとめスライドで見せる）
  layoutScenario('logo', 7),
]
