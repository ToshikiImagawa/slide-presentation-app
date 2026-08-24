# 品質チェックリスト: プレゼンテーション録画（Presentation Recording）

## メタ情報

| 項目 | 内容 |
|:---|:---|
| 機能名 | presentation-recording |
| チケット番号 | #381 |
| 対象PRD | `.sdd/requirement/presentation-recording.md` |
| 対象仕様書 | `.sdd/specification/presentation-recording_spec.md` |
| 対象設計書 | `.sdd/specification/presentation-recording_design.md` |
| 対象タスク分解 | `.sdd/task/381/tasks.md` |
| 生成日 | 2026-08-24 |
| チェックリストバージョン | 1.0 |

## チェックリストサマリー

| カテゴリ | 総項目数 | P1 | P2 | P3 |
|:---|:---|:---|:---|:---|
| 1. 要求レビュー | 3 | 2 | 1 | 0 |
| 2. 仕様レビュー | 4 | 3 | 1 | 0 |
| 3. 設計レビュー | 4 | 2 | 2 | 0 |
| 4. 実装レビュー | 3 | 2 | 1 | 0 |
| 5. テストレビュー | 4 | 3 | 1 | 0 |
| 6. ドキュメントレビュー | 2 | 0 | 2 | 0 |
| 7. セキュリティレビュー | 1 | 0 | 1 | 0 |
| 8. パフォーマンスレビュー | 2 | 0 | 1 | 1 |
| 9. デプロイレビュー | 2 | 0 | 1 | 1 |
| 10. プロジェクト原則レビュー | 2 | 1 | 1 | 0 |
| **合計** | **27** | **13** | **12** | **2** |

**優先度レベル**:

- **P1**: 高 — マージ前に完了すべき
- **P2**: 中 — リリース前に完了すべき
- **P3**: 低 — あると望ましい

---

## 1. 要求レビュー

### CHK-101 [P1] 機能要件の網羅性

- [ ] FR-PR-001（レコーディングボタン表示）が実装されている
- [ ] FR-PR-002（共有選択→録画開始）が実装されている
- [ ] FR-PR-003（voice再生音を音声トラックに含める）が実装されている
- [ ] FR-PR-004（自動再生・自動スライドショーとの併用）が実装されている
- [ ] FR-PR-005（録画中インジケータ）が実装されている
- [ ] FR-PR-006（録画停止）が実装されている
- [ ] FR-PR-007（保存先選択して保存）が実装されている
- [ ] FR-PR-008（共有選択キャンセル時フォールバック）が実装されている
- [ ] FR-PR-009（録画中断・エラー時フォールバック）が実装されている

**検証方法**:

- PRD（`presentation-recording.md` 4.3節）を確認
- `.sdd/task/381/tasks.md` の要求カバレッジ表で実装タスクとの対応を確認
- `/check-spec presentation-recording` で整合性を検証

**関連要求**: FR-PR-001〜009

---

### CHK-102 [P1] 非機能要件

- [ ] NFR-PR-001: macOSの画面録画権限が必要になることが、開始前または開始時のフィードバックで発表者に伝わる
- [ ] NFR-PR-002: `getDisplayMedia`/`MediaRecorder` 非対応環境で `RecordingButton` が無効化される
- [ ] NFR-PR-003: 録画中もスライド遷移アニメーションが視覚的にコマ落ちしない（目安: 30fps相当を下回らない）

**検証方法**:

- PRD 4.4節・spec 3.2節・design 7章を確認
- macOS実機でのパフォーマンス目視確認（tasks.md 4.4）

**関連要求**: NFR-PR-001〜003

---

### CHK-103 [P2] 受け入れ基準・スコープ外の遵守

- [ ] GitHub Issue #381 の受け入れ基準4項目がすべて満たされている
- [ ] PRD「7. スコープ外」に列挙された機能（動画編集、クラウド共有、発表者ビュー専用UI、マイク入力録音、一時停止/再開、録画時間上限管理）が実装に含まれていない

**検証方法**:

- Issue #381 の受け入れ基準チェックボックスを確認
- 実装差分（diff）にスコープ外機能が含まれていないことをレビュー

---

## 2. 仕様レビュー

### CHK-201 [P1] 公開APIの実装

- [ ] `src/hooks/useRecording.ts` の `useRecording()` が spec 4.2節のシグネチャ（`{ state, start, stop }`）と一致する
- [ ] `src/components/RecordingButton.tsx` の `RecordingButtonProps`（`{ state, onToggle }`）が spec と一致する
- [ ] `src/hooks/useAudioPlayer.ts` の `UseAudioPlayerReturn` に `audioElementRef` が追加されている（design 6章）

**検証方法**:

```bash
grep -n "export function useRecording\|export type RecordingState\|audioElementRef" src/hooks/useRecording.ts src/hooks/useAudioPlayer.ts
```

**参照**: `presentation-recording_spec.md` § 4 API、`presentation-recording_design.md` § 6 インターフェース定義

---

### CHK-202 [P1] データモデルの整合性

- [ ] `RecordingState` 型が `'idle' | 'recording' | 'saving' | 'error'` の4値で定義されている
- [ ] `state` の値が上記4値以外に遷移しない（型・実装の両方で保証）

**検証方法**:

- 型定義ファイルを確認
- `useRecording` のユニットテストで全状態遷移を確認

**参照**: `presentation-recording_spec.md` § 4.2、`presentation-recording_design.md` § 5

---

### CHK-203 [P1] 振る舞いの整合性

- [ ] 7.1節のシーケンス図通り、start→recording、stop→saving→（保存成功/キャンセル）→idle の流れが実装されている
- [ ] 7.2節通り、共有選択キャンセル時に `state` が変化しない（`idle` を維持）
- [ ] 7.3節通り、共有停止・エラー時に録画が安全に終了し、記録済みデータの有無で保存/idle分岐する

**検証方法**:

- コードの状態遷移をトレースし、spec 7章の図と比較
- 各分岐に対応するユニットテストを実行

**参照**: `presentation-recording_spec.md` § 7 振る舞い図

---

### CHK-204 [P2] 制約の実装

- [ ] 共有キャンセル・録画エラー・共有停止時もプレゼンテーション本体（Reveal.js側）の表示が中断されない（A-005, DC-PR-001）
- [ ] 録画用リソース（`MediaRecorder`/`MediaStreamTrack`/`AudioContext`）が `useEffect` のクリーンアップで解放される（T-003, DC-PR-002）
- [ ] `RecordingButton`・録画中インジケータが `ComponentRegistry` を経由せず `App.tsx` で直接構成されている（A-004, DC-PR-003）
- [ ] レコーディングボタンのスタイリングがCSS変数（`--theme-*`）経由でテーマカラーを参照している（A-002）

**検証方法**:

- 該当コードをレビュー
- アンマウント/録画終了時のリソース解放をテストで確認

**参照**: `presentation-recording_spec.md` § 8 制約事項

---

## 3. 設計レビュー

### CHK-301 [P1] アーキテクチャの整合性

- [ ] モジュール構成が design 4.2節の表（`useAudioPlayer`拡張・`useRecording`・`RecordingButton`・`App.tsx`統合）と一致する
- [ ] `useRecording` が `useAudioPlayer` の `audioElementRef` を受け取る形で連携している（独自に音声要素を生成していない）

**検証方法**:

- ディレクトリ構造・import文を design.md 4章と比較

**参照**: `presentation-recording_design.md` § 4 アーキテクチャ

---

### CHK-302 [P1] 技術スタックの準拠

- [ ] 画面キャプチャに `navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })` を使用している（システム音声を取得していない）
- [ ] 音声合成に Web Audio API（`AudioContext.createMediaElementSource` + `createMediaStreamDestination`）を使用している
- [ ] 録画に `MediaRecorder` を使用している
- [ ] 保存に既存の `@tauri-apps/plugin-dialog`（`save`）+ `@tauri-apps/plugin-fs`（`writeFile`）を使用し、新規のRust実装・`src-tauri/capabilities/` の変更を行っていない
- [ ] 録画専用の外部ライブラリ（ffmpeg wasm等）を追加していない

**検証方法**:

```bash
git diff --stat src-tauri/capabilities/  # 変更なしであることを確認
grep -rn "getDisplayMedia\|MediaRecorder\|createMediaElementSource" src/hooks/useRecording.ts
```

**参照**: `presentation-recording_design.md` § 3 技術スタック

---

### CHK-303 [P2] 設計判断のドキュメント化

- [ ] `AudioContext`/`MediaElementAudioSourceNode` がシングルトンとして遅延生成・再利用されている（design 9.1）
- [ ] 音声ソースが録画用ストリームとスピーカー出力（`audioContext.destination`）の両方に接続されており、録画中も通常のvoice再生が聞こえる
- [ ] 画面トラックの `onended`（OS側の共有停止操作）が監視され、録画停止処理に接続されている

**検証方法**:

- design.md 9.1決定事項と実装コードを1件ずつ比較
- macOS実機で録画中にvoice再生音がスピーカーから聞こえることを確認

**参照**: `presentation-recording_design.md` § 9.1 決定事項

---

### CHK-304 [P2] 統合ポイントの検証

- [ ] `App.tsx` でツールバーの `PdfExportButton` の隣に `RecordingButton` が配置されている
- [ ] `useAudioPlayer.audioElementRef` が `useRecording` に正しく渡されている
- [ ] `speaker-note-audio_spec.md` の `UseAudioPlayerReturn` に `audioElementRef` が追記され、実装と同期している（D-001, tasks.md 1.2）

**検証方法**:

- `App.tsx` の統合部分をレビュー
- `speaker-note-audio_spec.md` の差分を確認

---

## 4. 実装レビュー

### CHK-401 [P1] コード構造

- [ ] Prettier/ESLint（`npm run format:check`, 型チェック含む）が通る
- [ ] 命名が既存の `useAudioPlayer`/`AudioPlayButton`/`PdfExportButton` の慣習と一貫している
- [ ] デッドコード・コメントアウトされたブロックが残っていない

**検証方法**:

```bash
npm run format:check
npm run typecheck
```

---

### CHK-402 [P1] エラーハンドリング

- [ ] `getDisplayMedia()` の reject（キャンセル・権限拒否）が捕捉され、`state` が `'idle'` に戻る
- [ ] `MediaRecorder` の `onerror` が捕捉され、録画が安全に終了する
- [ ] サイレント失敗（エラーを握り潰して何も起きない状態）がない

**検証方法**:

- エラーハンドリングコードをレビュー
- 各エラーシナリオをモックしてテスト

---

### CHK-403 [P2] コード品質

- [ ] `useRecording` 内の責務（キャプチャ・合成・録画制御・保存・状態管理）が過度に1関数へ集中せず適切に分割されている
- [ ] 重複コードがない（既存の `pdfExport.ts` の保存パターンを再利用し、コピペしていない）

**検証方法**:

- コードレビュー
- `pdfExport.ts` との実装パターンの類似度を確認

---

## 5. テストレビュー

### CHK-501 [P1] 単体テストカバレッジ

- [ ] `useRecording` の主要な状態遷移（start/stop/キャンセル/共有停止/エラー）がすべてユニットテストでカバーされている
- [ ] `useAudioPlayer` 拡張（`audioElementRef`）のテストが追加されている

**検証方法**:

```bash
npm run test
```

**参照**: `.sdd/task/381/tasks.md` 4.1, 4.3

---

### CHK-502 [P1] コンポーネントテスト

- [ ] `RecordingButton` の idle/recording/saving/error 各状態の表示がテストされている
- [ ] クリック時に `onToggle` が呼ばれることがテストされている

**検証方法**:

```bash
npm run test
```

**参照**: `.sdd/task/381/tasks.md` 4.2

---

### CHK-503 [P1] エッジケーステスト

- [ ] 共有選択キャンセル時に `state` が変化しないことがテストされている
- [ ] 録画中に共有が停止された場合の保存フロー分岐がテストされている
- [ ] 保存先選択キャンセル時にデータが破棄され `state` が `'idle'` に戻ることがテストされている
- [ ] `getDisplayMedia`/`MediaRecorder` 非対応環境でボタンが無効化されることがテストされている

**検証方法**:

- 各エッジケースのテストコードをレビューし実行

---

### CHK-504 [P2] 手動確認（macOS実機）

- [ ] 画面録画権限の許可フローを実機で確認した
- [ ] 実際に録画→保存した動画ファイルが再生可能であることを確認した
- [ ] 自動再生・自動スライドショーとの併用でハンズフリー録画ができることを確認した（FR-PR-004）

**検証方法**:

- `.sdd/task/381/tasks.md` 4.4 の手動確認項目を実施し、結果を記録する

---

## 6. ドキュメントレビュー

### CHK-601 [P2] コードコメント

- [ ] `createMediaElementSource` のシングルトン化など、非自明な実装判断にコメントがある
- [ ] TODOが残っていない、または課題として追跡されている

**検証方法**:

- コードコメントを確認

---

### CHK-602 [P2] 設計書・仕様書の更新

- [ ] 実装完了後、`presentation-recording.md`/`_spec.md`/`_design.md` の `status` が `approved` に更新されている（design は `impl-status: implemented` も）
- [ ] `speaker-note-audio_spec.md` の `UseAudioPlayerReturn` 定義が実装と一致している

**検証方法**:

- 各ドキュメントの front matter を確認
- `.sdd/task/381/tasks.md` 5.3 を確認

---

## 7. セキュリティレビュー

### CHK-701 [P2] 権限・入力の取り扱い

- [ ] 保存先パスは `@tauri-apps/plugin-dialog` の `save()` が返す値をそのまま使用し、パスの独自構築・結合を行っていない
- [ ] 追加で許可した Tauri capability がない（`dialog:default`/`fs:allow-write-file` の既存範囲内で完結している）

**検証方法**:

```bash
git diff src-tauri/capabilities/
```

---

## 8. パフォーマンスレビュー

### CHK-801 [P2] 録画中の滑らかさ

- [ ] `ondataavailable` の timeslice が 1000ms に設定されている
- [ ] 録画中のスライド遷移アニメーションが録画なし時と比較して視覚的にコマ落ちしない

**検証方法**:

- 実装コードのtimeslice設定値を確認
- macOS実機で録画あり/なしのスライド遷移を目視比較

**参照**: `presentation-recording_design.md` § 7（NFR-PR-003）

---

### CHK-802 [P3] リソース使用量

- [ ] 録画を複数回開始・停止してもメモリリークが発生しない（`AudioContext`/`MediaRecorder`/トラックが確実に解放される）
- [ ] 長時間録画（数分程度）でアプリの応答性が明らかに低下しない

**検証方法**:

- 開発者ツール等でメモリ使用量を確認しながら複数回録画を実施

---

## 9. デプロイレビュー

### CHK-901 [P2] 設定管理

- [ ] `src-tauri/capabilities/default.json` に変更がない（既存の `dialog:default`/`fs:allow-write-file` で完結）
- [ ] 新規の環境変数・設定ファイルが追加されていない

**検証方法**:

```bash
git diff src-tauri/capabilities/ src-tauri/tauri.conf.json
```

---

### CHK-902 [P3] リリースへの反映

- [ ] `CHANGELOG.md`/`CHANGELOG.ja.md` に機能追加が記載されている
- [ ] README/スクリーンショットへの反映は本チケットの対象外であることが確認されている（次回リリース準備時に別途対応）

**検証方法**:

- CHANGELOGの差分を確認

---

## 10. プロジェクト原則レビュー

### CHK-1001 [P1] CONSTITUTION.md への準拠

- [ ] A-002（スタイルの階層管理）、A-004（多層コンポーネントレジストリ）、A-005（フォールバックファースト設計）、B-001（表示品質の優先）、T-001（TypeScript Strict Mode）、T-003（ライフサイクル統合）に準拠している
- [ ] 原則からの逸脱がある場合、design.md「9.3 未解決の課題」等に理由が明記されている

**検証方法**:

- `presentation-recording_spec.md` § 9、`presentation-recording_design.md` § 9.2 原則準拠チェックリストを確認

---

### CHK-1002 [P2] 原則テンプレートとの同期

- [ ] `SPECIFICATION_TEMPLATE.md`/`DESIGN_DOC_TEMPLATE.md` が現行の `CONSTITUTION.md`（v2.0.0）と整合している
- [ ] 本機能のspec/designにテンプレートの必須セクションがすべて存在する（マーカー残存なし）

**検証方法**:

- `CONSTITUTION.md` 変更履歴とテンプレート更新日を比較

---

## 完了基準

### PR作成前チェックリスト

すべてのP1項目が完了している必要があります:

- [ ] すべてのP1項目がチェック済み（13/13）
- [ ] すべてのテストが合格している（`npm run test`, `npm run typecheck`）
- [ ] 仕様との整合性が検証されている（`/check-spec presentation-recording`）
- [ ] コードレビュー準備完了

### マージ前チェックリスト

すべてのP1・P2項目が完了している必要があります:

- [ ] すべてのP1項目がチェック済み（13/13）
- [ ] すべてのP2項目がチェック済み（12/12）
- [ ] コードレビュー承認済み
- [ ] CI/CDパイプライングリーン
- [ ] マージ準備完了

### リリース前チェックリスト

P3までのすべての項目が完了している必要があります:

- [ ] すべてのP1項目がチェック済み（13/13）
- [ ] すべてのP2項目がチェック済み（12/12）
- [ ] すべてのP3項目がチェック済み（2/2）
- [ ] 本番デプロイ（`npm run tauri:build`）で動作確認済み

---

## Notes

- このチェックリストはPRD・spec・design・tasks.mdから自動生成したものです。実装が進むにつれて内容を更新してください
- コンテキストに適用されない項目があれば削除してください
- 要件（PRD/spec/design）が変更された場合は `/checklist presentation-recording 381 --update` でチェックリストを更新してください

---

## 参照ドキュメント

- PRD: `.sdd/requirement/presentation-recording.md`
- 抽象仕様書: `.sdd/specification/presentation-recording_spec.md`
- 技術設計書: `.sdd/specification/presentation-recording_design.md`
- タスク分解: `.sdd/task/381/tasks.md`
- GitHub Issue: [#381](https://github.com/ToshikiImagawa/slide-presentation-app/issues/381)
