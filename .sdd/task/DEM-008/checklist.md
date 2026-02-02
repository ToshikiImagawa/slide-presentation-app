# 品質チェックリスト: auto-scroll-timer

## メタ情報

| 項目 | 内容 |
|:---|:---|
| 機能名 | auto-scroll-timer |
| チケット番号 | DEM-008 |
| PRD | `.sdd/requirement/auto-scroll-timer.md` |
| 仕様書 | `.sdd/specification/auto-scroll-timer_spec.md` |
| 設計書 | `.sdd/specification/auto-scroll-timer_design.md` |
| 生成日 | 2026-02-02 |
| チェックリストバージョン | 1.2 |
| 最終確認日 | 2026-02-02 |

## チェックリストサマリー

| カテゴリ | 総項目数 | P1 🔴 | P2 🟡 | P3 🟢 |
|:---|:---|:---|:---|:---|
| 要件レビュー | 4 | 3 | 1 | 0 |
| 仕様レビュー | 4 | 3 | 1 | 0 |
| 設計レビュー | 4 | 2 | 1 | 1 |
| 実装レビュー | 5 | 3 | 2 | 0 |
| テストレビュー | 4 | 3 | 1 | 0 |
| ドキュメントレビュー | 3 | 0 | 2 | 1 |
| **合計** | **24** | **14** | **8** | **2** |

---

## 要件レビュー

### CHK-101 [P1] 🔴 機能要件カバレッジ ✅

- [x] FR_AST_001: 自動スライドショーONかつ音声未定義で設定秒数後に自動遷移する — `useAutoSlideshow.ts:56-67`
- [x] FR_AST_002: 設定ウィンドウからスクロールスピードを変更できる — `SettingsWindow.tsx:42-58`
- [x] FR_AST_003: デフォルト値が20秒である — `useAutoSlideshow.ts:6` `DEFAULT_SCROLL_SPEED = 20`
- [x] FR_AST_004: 手動スライド移動時にタイマーがリセットされる — `useAutoSlideshow.ts:67` 依存配列に `currentIndex`
- [x] FR_AST_005: 最終スライドではタイマーが動作しない — `useAutoSlideshow.ts:62-63`
- [x] FR_AST_006: 音声定義済みスライドではタイマーが動作しない — `useAutoSlideshow.ts:60-61`

**検証方法**:
- PRDをレビュー: `.sdd/requirement/auto-scroll-timer.md`
- `/check_spec auto-scroll-timer` で整合性を検証

**関連要件**: FR_AST_001〜FR_AST_006

---

### CHK-102 [P1] 🔴 設計制約カバレッジ ✅

- [x] DC_AST_001: タイマーのライフサイクルが useEffect で管理されている（T-003 準拠） — `useAutoSlideshow.ts:56,66` useEffect + clearTimeout クリーンアップ
- [x] DC_AST_002: スクロールスピードがデータ駆動で管理されている（A-003 準拠） — `useAutoSlideshow.ts:6,28` 定数 + useState

**検証方法**:
- `useAutoSlideshow.ts` のタイマー useEffect にクリーンアップ関数があること
- `DEFAULT_SCROLL_SPEED` 定数と useState で管理されていること

**関連要件**: DC_AST_001, DC_AST_002

---

### CHK-103 [P1] 🔴 関連PRDとのトレーサビリティ ✅

- [x] FR_AST_001 → FR_SNA_006（自動スライドショートグル）との連携が正しい — `useAutoSlideshow.ts:57` 既存 `autoSlideshow` トグルを共有
- [x] FR_AST_006 → FR_SNA_005（音声再生終了トリガー）との優先関係が正しい — `useAutoSlideshow.ts:60-61` voice ありなら return

**検証方法**:
- autoSlideshow トグルが既存の FR_SNA_006 と共有されていること
- voice 定義済みスライドで音声終了トリガーが使用されること

---

### CHK-104 [P2] 🟡 スコープ外項目の確認 ✅

- [x] スライドごとの個別スクロールスピード設定が実装されていない
- [x] プログレスバーが実装されていない（auto-scroll-timer のスコープ外。別PRDで対応）
- [x] タイマーの一時停止/再開UIが実装されていない

**検証方法**:
- PRDセクション7のスコープ外項目と照合

---

## 仕様レビュー

### CHK-201 [P1] 🔴 公開API実装 ✅

- [x] `useAutoSlideshow()` フックが拡張されている — `src/hooks/useAutoSlideshow.ts:25`
- [x] `UseAutoSlideshowOptions` に `initialScrollSpeed?: number` が存在する — `useAutoSlideshow.ts:13`
- [x] `UseAutoSlideshowReturn` に `scrollSpeed: number` と `setScrollSpeed: (speed: number) => void` が存在する — `useAutoSlideshow.ts:21-22`
- [x] `SettingsWindow` にスクロールスピード設定UIが存在する — `SettingsWindow.tsx:42-58`

**検証方法**:
- spec セクション4の公開API一覧と実装を比較

**参照**: `.sdd/specification/auto-scroll-timer_spec.md` § 4. API

---

### CHK-202 [P1] 🔴 型定義の整合性 ✅

- [x] `UseAutoSlideshowOptions` の型がspecと一致している — `useAutoSlideshow.ts:8-14`
- [x] `UseAutoSlideshowReturn` の型がspecと一致している — `useAutoSlideshow.ts:16-23`
- [x] `PresenterViewMessage` に `scrollSpeedChange` メッセージが定義されている — `types.ts:108`
- [x] `PresenterControlState` に `scrollSpeed: number` が定義されている — `types.ts:94`

**検証方法**:
- `src/hooks/useAutoSlideshow.ts` と `src/data/types.ts` の型定義をspecと比較
- `npm run typecheck` を実行

---

### CHK-203 [P1] 🔴 振る舞いの整合性 ✅

- [x] spec セクション7.1 のタイマーベース自動スクロールフローに従っている — `useAutoSlideshow.ts:56-67`
- [x] spec セクション7.2 のタイマーリセットフローに従っている — useEffect 依存配列 `currentIndex` で自動リセット
- [x] spec セクション7.3 の自動遷移判定フローに従っている — autoSlideshow → voice → lastSlide の順で判定

**検証方法**:
- `useAutoSlideshow.ts` のタイマー useEffect のロジックをフロー図と比較

---

### CHK-204 [P2] 🟡 制約事項の実施 ✅

- [x] A-003 準拠: スクロールスピードがデータ駆動で管理されている — useState + 定数
- [x] T-003 準拠: タイマーのライフサイクルが useEffect で管理されている — clearTimeout クリーンアップ
- [x] T-001 準拠: TypeScript strict モードで型安全 — auto-scroll-timer 関連ファイルに型エラーなし
- [x] A-002 準拠: スタイリングがCSS変数経由で参照されている — `--theme-border`, `--theme-background` 等
- [x] B-001 準拠: プレゼンテーションの視覚的品質を損なっていない — 設定ウィンドウ内のUIのみ

**検証方法**:
- CONSTITUTION.md の各原則チェックリストに照合

---

## 設計レビュー

### CHK-301 [P1] 🔴 モジュール構成の整合性 ✅

- [x] `src/hooks/useAutoSlideshow.ts` にタイマーロジックと scrollSpeed 状態管理が実装されている
- [x] `src/components/SettingsWindow.tsx` にスクロールスピード入力UIが実装されている
- [x] `src/hooks/usePresenterView.ts` に scrollSpeedChange メッセージの送受信が実装されている — `usePresenterView.ts:78-79`

**検証方法**:
- design セクション4.2のモジュール分割表と実装を比較

**参照**: `.sdd/specification/auto-scroll-timer_design.md` § 4.2

---

### CHK-302 [P1] 🔴 技術スタック準拠 ✅

- [x] タイマーに setTimeout が使用されている — `useAutoSlideshow.ts:65`
- [x] 状態管理に React useState が使用されている — `useAutoSlideshow.ts:28`
- [x] 設定UIにネイティブ HTML input + CSS Modules が使用されている — `SettingsWindow.tsx:46-57`, `SettingsWindow.module.css:99-114`
- [x] ウィンドウ間同期に BroadcastChannel が使用されている — `usePresenterView.ts:52-87`

**検証方法**:
- design セクション3の技術スタック表と実装を比較

---

### CHK-303 [P2] 🟡 設計判断の文書化 ✅

- [x] タイマー実装方式（setTimeout vs setInterval vs rAF）の判断が文書化されている — design セクション9 決定事項1
- [x] scrollSpeed の管理場所（useAutoSlideshow内）の判断が文書化されている — design セクション9 決定事項2
- [x] 設定UIの配置先（SettingsWindow）の判断が文書化されている — design セクション9 決定事項3
- [x] 自動スライドショートグルの共有方針が文書化されている — design セクション9 決定事項4

**検証方法**:
- design セクション9の設計判断を確認

---

### CHK-304 [P3] 🟢 BroadcastChannel 統合 ✅

- [x] scrollSpeedChange メッセージが payload 形式で統一されている — `types.ts:108` `payload: { speed: number }`
- [x] 発表者ビューとメインウィンドウ間でスクロールスピードが双方向同期される — 送信: `App.tsx:134-140`, 受信: `usePresenterView.ts:78-79`

**検証方法**:
- `src/data/types.ts` のメッセージ型定義を確認
- `src/hooks/usePresenterView.ts` のメッセージハンドラを確認

---

## 実装レビュー

### CHK-401 [P1] 🔴 useAutoSlideshow タイマーロジック ✅

- [x] autoSlideshow ON かつ voice 未定義かつ最終スライドでない場合のみタイマーが開始される — `useAutoSlideshow.ts:57-63`
- [x] `setTimeout(goToNext, scrollSpeed * 1000)` でタイマーが設定されている — `useAutoSlideshow.ts:65`
- [x] useEffect のクリーンアップ関数で `clearTimeout` が実行されている — `useAutoSlideshow.ts:66`
- [x] 依存配列に `[autoSlideshow, currentIndex, slides, scrollSpeed, goToNext]` が含まれている — `useAutoSlideshow.ts:67`

**検証方法**:
- `src/hooks/useAutoSlideshow.ts` のタイマー useEffect を確認

---

### CHK-402 [P1] 🔴 SettingsWindow スクロールスピード設定UI ✅

- [x] `scrollSpeed` と `setScrollSpeed` が props として受け取られている — `SettingsWindow.tsx:7-8`
- [x] `<input type="number">` で値を入力できる — `SettingsWindow.tsx:47`
- [x] `min={1}` `max={300}` のバリデーションが設定されている — `SettingsWindow.tsx:50-51,55`
- [x] i18n キー `settings.scrollSpeed` が3言語（en-US, ja-JP, fr-FR）に定義されている — 全3ファイル確認済み

**検証方法**:
- `src/components/SettingsWindow.tsx` を確認
- `assets/locales/` の各言語ファイルを確認

---

### CHK-403 [P1] 🔴 App.tsx 統合 ✅

- [x] `useAutoSlideshow` の戻り値から `scrollSpeed`, `setScrollSpeed` を取得している — `App.tsx:102`
- [x] `SettingsWindow` に `scrollSpeed` と `setScrollSpeed` を props で渡している — `App.tsx:180`
- [x] `sendControlState` に `scrollSpeed` が含まれている — `App.tsx:139`

**検証方法**:
- `src/App.tsx` を確認

---

### CHK-404 [P2] 🟡 CSS Modules スタイリング ✅

- [x] `.input` クラスが SettingsWindow.module.css に定義されている — `SettingsWindow.module.css:99-114`
- [x] CSS変数（`--theme-*`）が使用されている（色値のハードコードなし） — `--theme-border`, `--theme-background`, `--theme-text-heading`, `--theme-primary`
- [x] `.body` に複数行の設定項目を配置するためのレイアウトが定義されている — `SettingsWindow.module.css:62-67` flex column + gap

**検証方法**:
- `src/components/SettingsWindow.module.css` を確認
- A-002 準拠を検証

---

### CHK-405 [P2] 🟡 コード品質 ✅

- [x] `npm run typecheck` が通る — 型エラーなし（2026-02-02 再検証済み）
- [x] `npm run format` で差分がない
- [x] 未使用の import やデッドコードがない（auto-scroll-timer 関連ファイル）

**検証方法**:
```bash
npm run typecheck
npm run format
```

---

## テストレビュー

### CHK-501 [P1] 🔴 useAutoSlideshow ユニットテスト ✅

- [x] voice 未定義時に scrollSpeed 秒後に goToNext が呼ばれるテスト — `useAutoSlideshow.test.ts:204-227`
- [x] voice 定義済み時にタイマーが動作しないテスト — `useAutoSlideshow.test.ts:229-250`
- [x] 最終スライドでタイマーが動作しないテスト — `useAutoSlideshow.test.ts:252-273`
- [x] currentIndex 変更時にタイマーがリセットされるテスト — `useAutoSlideshow.test.ts:294-332`
- [x] scrollSpeed 変更時にタイマーが再設定されるテスト — `useAutoSlideshow.test.ts:334-366`
- [x] autoSlideshow OFF 時にタイマーが動作しないテスト — `useAutoSlideshow.test.ts:275-292`
- [x] scrollSpeed デフォルト値が 20 であるテスト — `useAutoSlideshow.test.ts:174-187`

**検証方法**:
```bash
npm run test -- --run src/hooks/__tests__/useAutoSlideshow.test.ts
```

**参照**: design セクション8 テスト戦略

---

### CHK-502 [P1] 🔴 SettingsWindow コンポーネントテスト ✅

- [x] スクロールスピード設定が表示されるテスト — `SettingsWindow.test.tsx:83-92`
- [x] スクロールスピード変更で setScrollSpeed が呼ばれるテスト — `SettingsWindow.test.tsx:94-104`
- [x] 既存テスト（言語選択、閉じるボタン等）が壊れていないこと — 全7テスト通過

**検証方法**:
```bash
npm run test -- --run src/components/__tests__/SettingsWindow.test.tsx
```

---

### CHK-503 [P1] 🔴 全テストスイート通過 ✅

- [x] `npm run test -- --run` で全テストが通過する — 16ファイル 152テスト全通過（2026-02-02 再検証済み）

**検証方法**:
```bash
npm run test -- --run
```

---

### CHK-504 [P2] 🟡 テストカバレッジ ✅

- [x] design セクション8のテスト戦略に記載された全テストケースがカバーされている — 5ユニットテスト + 1コンポーネントテスト
- [x] ハッピーパスとエッジケースの両方がテストされている — 最終スライド、voice定義済み、autoSlideshow OFF 等

**検証方法**:
- design セクション8のテスト戦略表と実装テストケースを比較

---

## ドキュメントレビュー

### CHK-601 [P2] 🟡 設計書の更新 ✅

- [x] `auto-scroll-timer_design.md` の実装ステータスが全モジュール「🟢 実装済み」
- [x] 全体ステータスが「🟢 実装済み」
- [x] 技術スタック記載が実装と一致している — `ネイティブ HTML input + CSS Modules` に更新済み
- [x] BroadcastChannel メッセージ型が実装と一致している（payload形式） — `payload: { speed: number }` に更新済み

**検証方法**:
- `.sdd/specification/auto-scroll-timer_design.md` を確認

---

### CHK-602 [P2] 🟡 タスクログの完了状態 ✅

- [x] `tasks.md` の全タスクが完了（チェック済み）
- [x] 要求カバレッジが 100% — `カバレッジ: 8/8 (100%)`

**検証方法**:
- `.sdd/task/DEM-008/tasks.md` を確認

---

### CHK-603 [P3] 🟢 tasks.md の SettingsWindow 記載更新 ✅

- [x] tasks.md の「SettingsWindow について」セクションが実装完了を反映している — 「language-settings 機能の実装完了に伴い、SettingsWindow にスクロールスピード設定UIを統合済み」

**検証方法**:
- `.sdd/task/DEM-008/tasks.md` セクション「SettingsWindow について」を確認

---

## 完了基準

### Pre-PR チェックリスト

すべてのP1（🔴 高優先度）項目が完了している必要があります：
- [x] すべてのP1項目がチェック済み（14/14）
- [x] すべてのテストが合格している（152/152）
- [x] `/check_spec auto-scroll-timer` で整合性を検証済み
- [x] コードレビュー準備完了

### Pre-Merge チェックリスト

すべてのP1とP2項目が完了している必要があります：
- [x] すべてのP1項目がチェック済み（14/14）
- [x] すべてのP2項目がチェック済み（8/8）
- [ ] コードレビュー承認済み
- [ ] CI/CDパイプラインが成功
