# DEM-008: タイマーベース自動スクロール（Auto Scroll Timer）

**機能名:** auto-scroll-timer
**関連 Design Doc:** [auto-scroll-timer_design.md](../../specification/auto-scroll-timer_design.md)
**関連 Spec:** [auto-scroll-timer_spec.md](../../specification/auto-scroll-timer_spec.md)
**関連 PRD:** [auto-scroll-timer.md](../../requirement/auto-scroll-timer.md)

---

## 依存関係図

```mermaid
graph LR
    T1[1. 基盤: インターフェース拡張] --> T2[2. コア: タイマーロジック]
    T1 --> T3[3. コア: scrollSpeed 状態管理]
    T3 --> T2
    T2 --> T4[4. 統合: App.tsx 連携]
    T3 --> T4
    T4 --> T5[5. 統合: BroadcastChannel 拡張]
    T2 --> T6[6. テスト: useAutoSlideshow テスト]
    T3 --> T6
```

---

## タスク一覧

### 1. 基盤: useAutoSlideshow インターフェース拡張

**カテゴリ:** 基盤
**対象ファイル:** `src/hooks/useAutoSlideshow.ts`

**作業内容:**

- [x] `UseAutoSlideshowOptions` に `initialScrollSpeed?: number` を追加
- [x] `UseAutoSlideshowReturn` に `scrollSpeed: number` と `setScrollSpeed: (speed: number) => void` を追加
- [x] `DEFAULT_SCROLL_SPEED = 20` 定数を定義
- [x] 関数シグネチャを更新（引数の分割代入に `initialScrollSpeed` を追加）

**完了条件:**

- `useAutoSlideshow` の型定義が design doc のインターフェース定義（セクション6）と一致する
- `npm run typecheck` が通る
- 既存の autoPlay / autoSlideshow 機能が壊れていない

---

### 2. コア: scrollSpeed 状態管理

**カテゴリ:** コア
**依存:** タスク1
**対象ファイル:** `src/hooks/useAutoSlideshow.ts`

**作業内容:**

- [x] `useState` で `scrollSpeed` 状態を追加（初期値: `initialScrollSpeed ?? DEFAULT_SCROLL_SPEED`）
- [x] `setScrollSpeed` を return オブジェクトに追加
- [x] `scrollSpeed` を return オブジェクトに追加

**完了条件:**

- `scrollSpeed` のデフォルト値が 20 である
- `initialScrollSpeed` を渡した場合にその値が使用される
- `setScrollSpeed` で値を変更できる
- `npm run typecheck` が通る

---

### 3. コア: タイマーベース自動遷移ロジック

**カテゴリ:** コア
**依存:** タスク1, タスク2
**対象ファイル:** `src/hooks/useAutoSlideshow.ts`

**作業内容:**

- [x] タイマー管理用の `useEffect` を追加
  - 条件: `autoSlideshow === true` かつ現在のスライドの `voice` が未定義 かつ最終スライドでない
  - `setTimeout(goToNext, scrollSpeed * 1000)` でタイマーを開始
  - クリーンアップ関数で `clearTimeout` を実行
- [x] `useEffect` の依存配列: `[autoSlideshow, currentIndex, slides, scrollSpeed, goToNext]`
- [x] `getVoicePath` を使用して voice の有無を判定（既存の `noteHelpers` を再利用）

**完了条件:**

- voice 未定義スライドで `scrollSpeed` 秒後に `goToNext` が呼ばれる
- voice 定義済みスライドではタイマーが開始されない
- 最終スライドではタイマーが開始されない
- スライド変更時に既存タイマーがクリアされる（useEffect クリーンアップ）
- `autoSlideshow` が OFF の場合はタイマーが開始されない
- `scrollSpeed` 変更時にタイマーが再設定される
- `npm run typecheck` が通る

---

### 4. 統合: App.tsx での useAutoSlideshow 呼び出し更新

**カテゴリ:** 統合
**依存:** タスク2, タスク3
**対象ファイル:** `src/App.tsx`

**作業内容:**

- [x] `useAutoSlideshow` の呼び出しに `initialScrollSpeed` を追加（省略可、デフォルト値使用）
- [x] 戻り値の分割代入に `scrollSpeed`, `setScrollSpeed` を追加
- [x] `scrollSpeed` と `setScrollSpeed` を ref に保存（発表者ビュー同期用）

**完了条件:**

- `useAutoSlideshow` の新しい戻り値が正しく取得されている
- 既存の autoPlay / autoSlideshow 機能が壊れていない
- `npm run typecheck` が通る

---

### 5. 統合: BroadcastChannel スクロールスピード同期

**カテゴリ:** 統合
**依存:** タスク4
**対象ファイル:** `src/data/types.ts`, `src/hooks/usePresenterView.ts`, `src/App.tsx`

**作業内容:**

- [x] `PresenterViewMessage` 型に `{ type: 'scrollSpeedChange'; payload: { speed: number } }` を追加
- [x] `usePresenterView.ts` のメッセージハンドラに `scrollSpeedChange` の処理を追加
- [x] `PresenterControlState` に `scrollSpeed: number` を追加
- [x] `App.tsx` の `sendControlState` 呼び出しに `scrollSpeed` を追加
- [x] 発表者ビューからの `scrollSpeedChange` メッセージ受信時に `setScrollSpeed` を呼び出す

**完了条件:**

- 発表者ビューから送信された `scrollSpeedChange` メッセージでメインウィンドウの `scrollSpeed` が更新される
- メインウィンドウの `scrollSpeed` 変更が発表者ビューに同期される
- `npm run typecheck` が通る

---

### 6. テスト: useAutoSlideshow タイマー機能テスト

**カテゴリ:** テスト
**依存:** タスク2, タスク3
**対象ファイル:** `src/hooks/__tests__/useAutoSlideshow.test.ts`（新規作成）

**作業内容:**

- [x] テストファイルを作成
- [x] テストケース: voice 未定義時に scrollSpeed 秒後に goToNext が呼ばれる
- [x] テストケース: voice 定義済み時にタイマーが動作しない
- [x] テストケース: 最終スライドでタイマーが動作しない
- [x] テストケース: currentIndex 変更時にタイマーがリセットされる
- [x] テストケース: scrollSpeed 変更時にタイマーが再設定される
- [x] テストケース: autoSlideshow OFF 時にタイマーが動作しない
- [x] テストケース: scrollSpeed デフォルト値が 20 である

**完了条件:**

- 全テストケースが通る（`npm run test`）
- design doc セクション8 のテスト戦略をカバーしている

---

## 実装順序

| 順序 | タスク | カテゴリ | 依存 |
|:---|:---|:---|:---|
| 1 | インターフェース拡張 | 基盤 | なし |
| 2 | scrollSpeed 状態管理 | コア | 1 |
| 3 | タイマーベース自動遷移ロジック | コア | 1, 2 |
| 4 | App.tsx 連携 | 統合 | 2, 3 |
| 5 | BroadcastChannel 拡張 | 統合 | 4 |
| 6 | テスト | テスト | 2, 3 |

**並行可能なタスク:**

- タスク4 と タスク6 は、タスク3 完了後に並行して作業可能

---

## SettingsWindow について

language-settings 機能の実装完了に伴い、`SettingsWindow` にスクロールスピード設定UI（`<input type="number">`）を統合済み。`scrollSpeed` / `setScrollSpeed` を props 経由で `App.tsx` から渡している。

---

## 要求カバレッジ

| 要求ID | 要求内容 | 対応タスク |
|:---|:---|:---|
| FR_AST_001 | 自動スライドショーONかつ音声未定義で設定秒数後に自動遷移 | 3 |
| FR_AST_002 | 設定ウィンドウからスクロールスピード変更可能 | 2, SettingsWindow UI統合済み |
| FR_AST_003 | デフォルト値20秒 | 1, 2 |
| FR_AST_004 | 手動移動時のタイマーリセット | 3 |
| FR_AST_005 | 最終スライドでタイマー停止 | 3 |
| FR_AST_006 | 音声優先（タイマー不動作） | 3 |
| DC_AST_001 | タイマーライフサイクル管理（T-003 準拠） | 3 |
| DC_AST_002 | データ駆動型スクロールスピード（A-003 準拠） | 1, 2 |

**カバレッジ: 8/8 (100%)**
