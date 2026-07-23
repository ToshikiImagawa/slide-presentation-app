/**
 * 撮影シナリオ定義。
 *
 * 各シナリオは「どのモック応答セットで」「どの画面へ遷移し」「どの操作をして」
 * 「何を待って」撮影するかを宣言的に記述する。
 *
 * step の語彙:
 *   { click: selector }      要素をクリック
 *   { waitFor: selector }    要素出現を待つ
 *   { fill: selector, text } テキスト入力
 *   { press: key }           キー入力
 *   { flushStream: key }     window.__SCREENSHOT__.flushStream(key) を実行
 *   { wait: ms }             指定ms待機
 *   { scrollIntoView: sel }  要素までスクロール
 *
 * nav: SideNav の aria-label 前方一致（クリックで画面遷移）。省略時は初期ルート(/dashboard)。
 */

const NAV = {
  dashboard: 'ダッシュボード',
  chat: 'AI チャット',
  aiTool: 'AIツール 管理',
  settings: '設定',
}

export const scenarios = [
  // === page レベル（高信頼）===
  {
    key: 'dashboard',
    scenario: 'dashboard',
    nav: NAV.dashboard,
    steps: [{ click: '[role="tab"]:has-text("チケット")' }, { waitFor: 'tr[role="button"]' }],
  },
  {
    key: 'hero',
    scenario: 'hero',
    nav: NAV.dashboard,
    steps: [{ click: '[role="tab"]:has-text("チケット")' }, { waitFor: 'tr[role="button"]' }],
  },
  {
    key: 'ai-chat',
    scenario: 'ai-chat',
    nav: NAV.chat,
    steps: [
      // 会話一覧の先頭を選択 → 本文表示
      { click: 'text=今スプリントのブロッカー確認' },
      { waitFor: 'text=次の3件です' },
    ],
  },
  {
    key: 'ai-tool-manager',
    scenario: 'ai-tool-manager',
    nav: NAV.aiTool,
    steps: [{ waitFor: 'text=ストーリーポイント推定' }],
  },

  // === ダッシュボード詳細パネル / AI 自動化ダイアログ系 ===
  {
    key: 'ai-tool-buttons',
    scenario: 'ai-tool-buttons',
    nav: NAV.dashboard,
    steps: [
      { click: '[role="tab"]:has-text("チケット")' },
      { waitFor: 'tr[role="button"]' },
      { click: 'tr[role="button"]:has-text("DEMO-119")' },
      { waitFor: 'text=AI 自動化' },
      { waitFor: '[data-testid="ai-tool-story-points-vertical-slice-button"]' },
    ],
  },
  {
    key: 'ai-tool-hint-dialog',
    scenario: 'ai-tool-hint-dialog',
    nav: NAV.dashboard,
    steps: [
      { click: '[role="tab"]:has-text("チケット")' },
      { waitFor: 'tr[role="button"]' },
      { click: 'tr[role="button"]:has-text("DEMO-119")' },
      { waitFor: '[data-testid="ai-tool-story-points-vertical-slice-button"]' },
      { click: '[data-testid="ai-tool-story-points-vertical-slice-button"]' },
      { waitFor: '[data-testid="ai-tool-hint-dialog"]' },
    ],
  },
  {
    key: 'ai-tool-sp',
    scenario: 'ai-tool-sp',
    nav: NAV.dashboard,
    steps: [
      { click: '[role="tab"]:has-text("チケット")' },
      { waitFor: 'tr[role="button"]' },
      { click: 'tr[role="button"]:has-text("DEMO-119")' },
      { waitFor: '[data-testid="ai-tool-story-points-vertical-slice-button"]' },
      { click: '[data-testid="ai-tool-story-points-vertical-slice-button"]' },
      { waitFor: '[data-testid="ai-tool-hint-skip-button"]' },
      { click: '[data-testid="ai-tool-hint-skip-button"]' },
      { waitFor: '[data-testid="ai-tool-approve-button"]' },
      { wait: 500 },
    ],
  },
  {
    key: 'ai-tool-pr',
    scenario: 'ai-tool-pr',
    nav: NAV.dashboard,
    steps: [
      { click: '[role="tab"]:has-text("チケット")' },
      { waitFor: 'tr[role="button"]' },
      { click: 'tr[role="button"]:has-text("DEMO-119")' },
      { waitFor: '[data-testid="ai-tool-pr-link-vertical-slice-button"]' },
      { click: '[data-testid="ai-tool-pr-link-vertical-slice-button"]' },
      { waitFor: '[data-testid="ai-tool-hint-skip-button"]' },
      { click: '[data-testid="ai-tool-hint-skip-button"]' },
      { waitFor: '[data-testid="ai-tool-approve-button"]' },
      { wait: 400 },
    ],
  },

  // === AIツール フォームエディタ / オーサリング ===
  {
    key: 'ai-tool-authoring',
    scenario: 'ai-tool-authoring',
    nav: NAV.aiTool,
    steps: [
      { waitFor: '[data-testid="ai-authoring-open-create"]' },
      { click: '[data-testid="ai-authoring-open-create"]' },
      { waitFor: '[data-testid="ai-authoring-prompt"]' },
      {
        fill: '[data-testid="ai-authoring-prompt"]',
        text: '未着手の高優先度チケットに、負荷の低い担当者を自動で割り当てる AIツール を作って',
      },
      { wait: 400 },
    ],
  },
  {
    key: 'ai-tool-form-editor',
    scenario: 'ai-tool-form-editor',
    nav: NAV.aiTool,
    steps: [
      { waitFor: 'button:has-text("編集")' },
      { click: 'button:has-text("編集")' },
      { waitFor: 'button:has-text("保存")' },
      { wait: 600 },
    ],
  },
  {
    key: 'ai-tool-jql-placeholder',
    scenario: 'ai-tool-jql-placeholder',
    nav: NAV.aiTool,
    steps: [
      { waitFor: 'button:has-text("編集")' },
      { click: 'button:has-text("編集")' },
      { waitFor: '[data-testid="jql-placeholder-hints"]' },
      { click: '[data-testid="jql-placeholder-hints"] summary' },
      { scrollIntoView: '[data-testid="jql-placeholder-hints"]' },
      { wait: 500 },
    ],
  },

  // === setup（オンボーディングダイアログ 3 ステップ）===
  // オンボーディングは設定タブ内ではなく、未設定時に起動直後ダッシュボード上へ
  // オーバーレイ表示される OnboardingDialog（#384）。default モックは未設定状態のため
  // goto 直後にダイアログが自動で開く。nav 遷移は不要（背景はダッシュボード）。
  {
    key: 'setup-credentials',
    scenario: 'default',
    steps: [{ waitFor: 'text=初回セットアップ' }, { waitFor: 'text=認証設定' }, { wait: 400 }],
  },
  {
    // ステップ未完了時は「次へ」が disabled になるため「スキップ」で進める
    key: 'setup-mcp',
    scenario: 'default',
    steps: [{ waitFor: 'text=初回セットアップ' }, { click: 'button:has-text("スキップ")' }, { wait: 600 }],
  },
  {
    key: 'setup-projects',
    scenario: 'default',
    steps: [
      { waitFor: 'text=初回セットアップ' },
      { click: 'button:has-text("スキップ")' },
      { wait: 400 },
      { click: 'button:has-text("スキップ")' },
      { wait: 600 },
    ],
  },
]
