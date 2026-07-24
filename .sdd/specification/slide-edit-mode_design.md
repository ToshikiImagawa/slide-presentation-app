---
id: design-slide-edit-mode
title: スライド編集モード（器の作成） 技術設計書
type: design
status: approved
sdd-phase: plan
impl-status: implemented
created: 2026-07-24
updated: 2026-07-24
depends-on:
  - spec-slide-edit-mode
tags:
  - editor
  - authoring
  - tauri
  - slide-package
  - addon
  - capability
category: authoring
---

# スライド編集モード（器の作成）

**ドキュメント種別:** 技術設計書 (Design Doc)
**SDDフェーズ:** Plan (計画/設計)
**最終更新日:** 2026-07-24
**関連 Spec:** [slide-edit-mode_spec.md](./slide-edit-mode_spec.md)
**関連 PRD:** [slide-edit-mode.md](../requirement/slide-edit-mode.md)

---

# 1. 実装ステータス

**ステータス:** 🟢 実装完了（2026-07-24・Issue #13）。単体テスト（Rust 12 / JS 249）・typecheck/clippy/fmt green、多エージェントレビュー＋敵対的検証（blocker/CONFIRMED 0）、実機検証（B/C/D）済み。実装ログ: [implementation_progress.md](../task/slide-edit-mode/implementation_progress.md)

## 1.1. 実装進捗

| モジュール/機能 | ステータス | 備考 |
|----------|--------|------|
| モード切替（`View` に `'edit'`） | 🟢 | FR-001。`main.tsx` に `editSource` state・enter/exitEditMode・描画分岐、`App` に `EditButton` |
| 編集画面（`src/edit/`） | 🟢 | FR-001/002/003。`SlideEditor`/`SlideJsonEditor`/`SlideMetaForm`/`SlidePreview` を新設 |
| ライブプレビュー（`SlideRenderer.Slide` 再利用） | 🟢 | FR-002/NFR-004。差分描画・全再マウントなし。`SlidePreview` として編集用に新設（発表者ビュー不変） |
| 無損失シリアライズ（`slidesSerialize.ts`） | 🟢 | FR-004/NFR-002。`JSON.parse`/`stringify(2sp)` ベース。往復・冪等をテスト |
| 保存前バリデーション | 🟢 | FR-005。`parseSlides` の errors で保存/書出をゲート。エラー時はプレビュー非表示 |
| Rust 書き込みコマンド（`save_slides_json`/`export_slide_package`/`set_edit_mode`） | 🟢 | FR-006/007/011。`lib.rs` に新設・`EditMode(Mutex<bool>)` ゲート・純粋関数を切出しテスト |
| `.tgz` 生成（Rust・`flate2`/`tar`） | 🟢 | FR-007/DC-003。`extract_asset_paths` 移植・`package/` 規約・`extract_slide_package` と往復 |
| Addon 付け外し 層C（実行時信頼 UI） | 🟢 | FR-008。`getAddonTrustMap`/`setAddonTrustDecision`/`clearAddonTrustDecision`＋書込直列化、`SettingsWindow` UI、信頼一覧は trustMap 全キー基点 |
| Addon 付け外し 層B（export 同梱選択） | 🟢 | FR-009。Rust `filter_addon_manifest`（bundle 正規化＋同梱）、`export-slides.mjs --addons`、編集 UI チェックボックス |
| Addon 付け外し 層A（組み込み entry.ts・dev 限定） | 🟢 | FR-010/DC-004。Rust `list/add/remove_builtin_addon`（`cfg!(debug_assertions)`＋ゲート＋`sanitize_addon_name`）、編集 UI dev パネル |
| i18n / エディタ UI テーマ分離 | 🟢 | ja/en/fr の `edit.*`/`settings.addonTrust*` を追加。編集 chrome は `editorUiTheme`（固定 UI サイズ）、プレビューのみプレゼンテーマ（§9.1） |

---

# 2. 設計目標

1. **編集プレビュー＝本番ビューの保証** — レンダラ一式を再実装せず再利用し、編集結果が本番と一致することを構造的に担保する（DC-001）。
2. **ラウンドトリップの無損失** — GUI で扱えない自由記述（未知キー・HTML・空白・`customCSS`・props・`fragment`）を、編集の往復で一切失わない（FR-004/NFR-002）。これが本 Feature 最大の設計難所。
3. **書き込みの単一境界と編集モードゲート** — fs 書き込みを Rust コマンドの単一チョークポイントに集約し、編集モード state でゲートすることで、発表本番での書き込みを構造的に不可能にする（DC-002/FR-011/NFR-003）。
4. **アセット収集規則の一元化** — `.tgz` export のアセット収集を既存 `extractAssetPaths` と同一規則で実装し、二重管理を避ける（DC-003）。
5. **リグレッションゼロ** — View（発表本番）・「開く」・発表者ビュー・既存パッケージ配布の挙動を変えない（NFR-001）。

---

# 3. 技術スタック

| 領域 | 採用技術 | 選定理由 |
|------|------|------|
| 編集プレビュー | 既存 `SlideRenderer.Slide`（Reveal 非依存の単一スライド描画） | 発表者ビューの `PreviewSlide` が Reveal デッキ外描画の前例。本番と同一レンダラで「見た目が本番と違う」を原理的に防ぐ（DC-001） |
| 編集 UI | JSON テキストエディタ＋確定フィールドのフォーム（React/MUI） | 型未定義の自由記述が多く純粋なフォーム化は破壊リスク大。JSON を土台に確定部のみフォーム化する（FR-002/003・DC-005） |
| 無損失往復 | `JSON.parse`/`JSON.stringify` ベースの明示シリアライザ（`slidesSerialize.ts`） | 未知キーは `[key: string]: unknown` としてそのまま JS オブジェクトに載るため、パース→再シリアライズで保持できる。キー順・インデントを固定し差分を最小化 |
| 保存前検証 | 既存 `loader.ts` の `getValidationErrors`（構造化 `ValidationError`） | D-002（バリデーション駆動）に準拠。既存の検証資産を再利用 |
| 書き込み | Rust コマンド（`std::fs`）＋編集モード state（`tauri::State<Mutex<bool>>`） | 既存 `allow_asset_dir`/`extract_slide_package` と同じく fs 実務を Rust 境界に集約。`plugin-fs` write を JS へ開放しない（DC-002/NFR-003） |
| `.tgz` 生成 | Rust `flate2` + `tar`（依存済み） | `lib.rs` のテストに `tar::Builder`+`GzEncoder` の生成雛形が既存。`extract_slide_package` の展開と対になる |
| ファイル選択・保存先 | `@tauri-apps/plugin-dialog`（`save`/`open`） | 既存の「開く」と同じ機構。`dialog:default` 権限セットが save を含む |
| 永続化 | `@tauri-apps/plugin-store` | 最近使ったパス・アドオン信頼（`addonTrust`）の既存機構を流用（層C） |
| スタイリング | 既存3層モデル（グローバル CSS → CSS Modules → MUI sx prop）・色は `--theme-*` 経由 | 新規 UI（`SlideEditor` 等）も A-002 に従い、色をハードコードせず CSS 変数で参照する |

---

# 4. アーキテクチャ

## 4.1. システム構成図

```mermaid
graph TD
    subgraph Rust["Rust (src-tauri/src/lib.rs)"]
        EM[EditMode state Mutex bool]
        SET[set_edit_mode]
        SAVE[save_slides_json]
        EXP[export_slide_package flate2 tar]
    end
    subgraph Main["メインウィンドウ (main.tsx)"]
        VIEW[View home presentation edit]
        EDIT[src/edit SlideEditor]
        JSON[SlideJsonEditor]
        FORM[SlideMetaForm]
        SER[slidesSerialize parse serialize]
        SAVEJS[editModeSave.ts]
        PREV[SlideRenderer.Slide 再利用]
        LSL[localSlideLoader 層C trust]
    end

    VIEW -->|edit 選択| EDIT
    EDIT --> JSON
    EDIT --> FORM
    JSON --> SER
    FORM --> SER
    SER -->|data| PREV
    EDIT -->|保存/書出| SAVEJS
    SAVEJS -->|invoke| SAVE
    SAVEJS -->|invoke| EXP
    EDIT -->|モード切替| SET
    SET --> EM
    SAVE -.->|ゲート判定| EM
    EXP -.->|ゲート判定| EM
    EDIT -->|層C 付け外し| LSL
```

## 4.2. モジュール分割

| モジュール名 | 責務 | 依存関係 | 配置場所 |
|--------|------|------|------|
| `main.tsx` | `View` に `'edit'` を追加し表示分岐。編集モード開始/終了で `set_edit_mode` を呼ぶ | `SlideEditor`, `editModeSave` | `src/main.tsx`（改修） |
| `SlideEditor` | 編集画面のルート。JSON エディタ・フォーム・ライブプレビュー・保存/書出/付け外しを束ねる | `SlideJsonEditor`, `SlideMetaForm`, `SlideRenderer`, `slidesSerialize`, `editModeSave` | `src/edit/SlideEditor.tsx`（新規） |
| `SlideJsonEditor` | JSON テキスト編集。構文・スキーマ検証を表示 | `slidesSerialize`, `loader` | `src/edit/SlideJsonEditor.tsx`（新規） |
| `SlideMetaForm` | 確定フィールド（`meta`/`theme`/`layout`/`id`）のフォーム編集 | `types` | `src/edit/SlideMetaForm.tsx`（新規） |
| `slidesSerialize` | 無損失パース・再シリアライズ（未知キー・HTML・空白の保持） | `types` | `src/edit/slidesSerialize.ts`（新規） |
| `editModeSave` | Rust 書き込みコマンドの呼び出し口（編集モード時のみ） | `@tauri-apps/api/core`, `plugin-dialog` | `src/editModeSave.ts`（新規） |
| `SlideRenderer.Slide` | 単一スライドの本番同一描画（プレビュー核） | `ComponentRegistry`, レイアウト | `src/components/SlideRenderer.tsx`（**変更なし・再利用**） |
| `loader` | 保存前バリデーション（`getValidationErrors`） | なし | `src/data/loader.ts`（再利用） |
| `localSlideLoader` | 層C: 実行時信頼の個別 on/off（`setAddonTrustDecision`） | `plugin-store` | `src/localSlideLoader.ts`（改修） |
| `SettingsWindow` | 層C の付け外し UI（既存の一律無効化・失効に個別トグルを追加） | `localSlideLoader` | `src/components/SettingsWindow.tsx`（改修） |
| `export-slides` | 層B: 同梱アドオンの個別選択（`extractAssetPaths` は Rust 移植の真実源） | なし | `scripts/export-slides.mjs`（改修） |
| `lib.rs` | `EditMode` state・`set_edit_mode`・`save_slides_json`・`export_slide_package`（`.tgz` 生成） | `flate2`, `tar` | `src-tauri/src/lib.rs`（改修） |

---

# 5. データモデル

`slides.json` のデータ構造（`PresentationData` / `SlideData` / `SlideContent` / `ThemeData`）は既存 `src/data/types.ts` をそのまま用い、**本 Feature で新規スライドデータ型は追加しない**。編集で扱うのは既存構造であり、次の自由記述箇所が無損失往復の対象となる。

```typescript
// 無損失往復の対象（src/data/types.ts の既存構造に潜在する自由記述）
interface SlideContent {
  title?: string
  subtitle?: string       // 文字列内に <strong>/<code>/<br/> 等の HTML を含みうる
  body?: string
  items?: ContentItem[]
  component?: ComponentReference // props/style は Record<string, unknown> で完全自由
  [key: string]: unknown  // ★ left/right/steps/tiles/codeBlock 等はここに載る（型定義なし）
}
interface ContentItem {
  text: string            // HTML・"\n"（→<br/>）・" "（インデント）を含みうる
  emphasis?: boolean
  fragment?: boolean      // レンダラ未消費だが編集で保持する
  fragmentIndex?: number
  items?: ContentItem[]
}
interface ThemeData {
  colors?: ColorPalette   // ColorPalette は [key: string] で任意色キーを許容
  fonts?: FontDefinition
  customCSS?: string      // 完全自由記述
}
```

無損失往復の設計（`slidesSerialize.ts`）:

- **保持の原理**: `JSON.parse` は未知キーも `[key: string]: unknown` の一部として JS オブジェクトに載せる。編集で触っていないキーは `JSON.stringify` でそのまま書き戻る。文字列内の HTML・`\n`・` ` は文字列値として保持される（レンダラ側の `renderHtml`/`renderWithLineBreaks` が解釈するのはあくまで表示時）。
- **差分最小化**: シリアライズ時のキー順・インデント（スペース 2）を固定し、編集していないスライドが不要に差分化しないようにする。
- **フォームとの合流**: `SlideMetaForm` は確定フィールドのみを更新し、同一オブジェクトの未知キーには触れない（部分更新）。JSON エディタとフォームは同一の `PresentationData` を単一の真実源として共有する。

---

# 6. インターフェース定義

> 実装で確定した最終シグネチャを反映（計画時から精緻化した点は注記）。

```typescript
// src/edit/slidesSerialize.ts（新規）
export function parseSlides(text: string): { data: PresentationData; errors: ValidationError[] }
// JSON 構文エラー時は空シェル＋構造化エラー（default へフォールバックしない）。未知キーは data に保持
export function serializeSlides(data: PresentationData): string  // JSON.stringify(data, null, 2)

// src/editModeSave.ts（新規）— すべて編集モード時のみ成功（Rust 側でゲート）
export async function enterEditMode(): Promise<void>   // invoke('set_edit_mode', { enabled: true })
export async function exitEditMode(): Promise<void>    // invoke('set_edit_mode', { enabled: false })
export async function saveSlidesJson(path: string, json: string): Promise<void>
export async function exportSlidePackage(json: string, options: ExportOptions): Promise<string>
// 精緻化: name/version（生成 package.json 用）と baseDir（アセット収集元）を追加
export interface ExportOptions { outDir: string; name: string; version: string; baseDir?: string; includedAddons?: string[] }
export async function chooseSlidesSavePath(initial?: string): Promise<string | null>  // dialog save
export async function chooseExportDir(): Promise<string | null>                        // dialog open directory
// 層A（dev 限定・組み込み entry.ts 増減）
export async function listBuiltinAddons(): Promise<string[]>
export async function addBuiltinAddon(name: string): Promise<void>
export async function removeBuiltinAddon(name: string): Promise<void>

// src/localSlideLoader.ts（改修）— 層C: 実行時信頼の個別操作
export async function getAddonTrustMap(): Promise<AddonTrustMap>
export async function setAddonTrustDecision(path: string, decision: AddonTrustDecision): Promise<void>
export async function clearAddonTrustDecision(path: string): Promise<void>  // 追加: 「未設定」へ戻す＝キー削除
export async function getPackageAddonNames(baseDir: string): Promise<string[]>  // 層B の候補提示用
// setAddonTrustDecision/clearAddonTrustDecision/resetAddonTrust/isAddonAllowed の書込は直列化キュー経由（競合防止）
// LoadedSlidePackage に rawText（書換前の生 slides.json）を追加。編集対象は rawText（相対パス保持・§9.1）
```

```rust
// src-tauri/src/lib.rs（改修）
struct EditMode(std::sync::Mutex<bool>);

// 精緻化: Mutex poison を String 化して返すため Result を返す
#[tauri::command]
fn set_edit_mode(enabled: bool, state: tauri::State<EditMode>) -> Result<(), String> { /* ... */ }

// 書き込み系は必ず編集モード state を検査してから実行（ゲート）。純粋関数を切り出して単体テスト
#[tauri::command]
fn save_slides_json(path: String, json: String, state: tauri::State<EditMode>) -> Result<(), String>

// 精緻化: base_dir（アセット収集元）・name・version を追加（ユーザー確認済み）
#[tauri::command]
fn export_slide_package(
    json: String, out_dir: String, base_dir: String, name: String, version: String,
    included_addons: Vec<String>, state: tauri::State<EditMode>,
) -> Result<String, String>
// 1. extract_asset_paths でアセット収集（base_dir 基準） → 2. filter_addon_manifest で層B 同梱
//    （bundle を addons/<basename> に正規化） → 3. package.json 生成 → 4. flate2+tar で package/ 配下に .tgz

// 層A（dev 限定・cfg!(debug_assertions)＋編集モードゲート＋sanitize_addon_name）
#[tauri::command] fn list_builtin_addons(...) -> Result<Vec<String>, String>
#[tauri::command] fn add_builtin_addon(name: String, ...) -> Result<(), String>
#[tauri::command] fn remove_builtin_addon(name: String, ...) -> Result<(), String>
```

`EditMode` は `tauri::Builder::manage(EditMode(Mutex::new(false)))` で登録し、上記コマンド（計 8 個）を `invoke_handler` に追加する（`src-tauri/src/lib.rs` の `generate_handler!`）。`Cargo.toml` の `serde_json` は `preserve_order` を有効化し、`extract_asset_paths` の走査順を JS（挿入順）に一致させる（DC-003・§9.1）。

---

# 7. 非機能要件実現方針

| 要件 | 実現方針 |
|------|------|
| NFR-001 リグレッション | `View='edit'` は追加分岐であり `'home'`/`'presentation'` の描画に手を入れない。`SlideRenderer` は再利用（変更なし）。`npm run typecheck`/`npm run test` をゲートにする |
| NFR-002 データ整合性 | `slidesSerialize` の parse→serialize が未知キー・HTML・空白を保持することを単体テストで担保。編集していないフィールドの往復差分ゼロを検証 |
| NFR-003 最小権限 | 書き込みは Rust コマンドのみ。`capabilities/default.json` に `fs:allow-write-*` を追加せず、write を JS へ開放しない。全書き込みコマンドの冒頭で `EditMode` を検査 |
| NFR-004 プレビュー応答性 | プレビューは `SlideRenderer.Slide` を props 更新で差分再描画し、`presentationKey` による App 全再マウント（Reveal 全再初期化）を伴わない。入力停止後おおむね 300ms 以内の反映を目標とする |

---

# 8. テスト戦略

| テストレベル | 対象 | カバレッジ目標 |
|--------|------|---------|
| 単体（Vitest） | `slidesSerialize`: 未知キー・文字列内 HTML・`\n`・` `・`customCSS`・`fragment` の往復保持、キー順・インデント固定 | 分岐網羅（無損失の核心） |
| 単体（Vitest） | 保存前バリデーション: 破損 JSON で保存を止める・正常時は通す | 分岐網羅（FR-005） |
| 単体（Vitest） | 層C 信頼: `setAddonTrustDecision` の allow/deny 個別設定・永続化 | 主要分岐（FR-008） |
| 単体（Rust） | `export_slide_package`: アセット収集規則が `extractAssetPaths` と一致・`.tgz` 展開で `extract_slide_package` と往復 | 正常系（FR-007/DC-003） |
| 単体（Rust） | 編集モードゲート: `set_edit_mode(false)` 時に `save_slides_json`/`export_slide_package` が拒否される | 分岐網羅（FR-011/NFR-003） |
| 結合（手動/デモ） | 編集→ライブプレビュー即時反映／保存→再読込で同一／`.tgz` を「開く」で読める／層B/C 付け外しが反映される | AC 全項目 |
| リグレッション | `npm run typecheck`/`npm run test`、View・「開く」・発表者ビューの既存挙動 | 全通過（NFR-001） |

---

# 9. 設計判断

## 9.1. 決定事項

| 決定事項 | 選択肢 | 決定内容 | 理由 |
|------|-----|------|------|
| 編集 UI 形式 | A:JSON テキスト単体 / B:JSON 土台＋段階フォーム / C:全面フォーム | **B（JSON テキスト土台＋段階フォーム）** | 型未定義の自由記述が多く全面フォーム化は破壊リスク大。JSON＋ライブプレビューを土台に、確定した `meta`/`theme`/`layout`/`id` のみ段階フォーム化（ユーザー確認済み） |
| プレビュー更新 | App 全再マウント（presentationKey++） / 差分描画 | **`SlideRenderer.Slide` の差分描画** | 全再マウントは Reveal 全再初期化を伴い編集に不適。単一スライドを props 更新で差分描画（NFR-004） |
| 書き込みの実現 | A:Rust コマンド境界集約 / B:plugin-fs write を JS 開放 / C:別ウィンドウ capability 分離 | **A（Rust コマンド境界＋編集モード state ゲート）** | 既存 fs 集約パターンに忠実。write を JS へ開放せず攻撃面を増やさない。state を戻せば真に編集時のみ書ける（DC-002/NFR-003・ユーザー確認済み） |
| export 実行場所 | A:Node スクリプト維持 / B:Rust コマンド新設 / C:フロント JS で tar 実装 | **B（Rust コマンド新設）** | Tauri ランタイムに Node の fs/child_process が無い。`flate2`/`tar` は依存済みで `extract_slide_package` と対になる。アセット規則は `extractAssetPaths` を移植（DC-003・ユーザー確認済み） |
| Addon 付け外しの層 | 層C のみ / 層C+B / 層A も含む | **層A+B+C すべて（ただし層A は dev 限定）** | 作る側（同梱選択・組み込み）と使う側（信頼）の両面を器で扱う（ユーザー確認済み）。層A は制約付きで含める（下記） |
| 層A の実行可能性 | 本番でも提供 / dev 限定＋層B へ委譲 | **dev 環境限定（本番は層B へ委譲）** | 組み込み `entry.ts` の増減は `npm run build:addons`（vite）の再ビルドを要し、本番パッケージ済みアプリには npm/vite が無く実行不能。本番配布では実行時ロード可能な層B（パッケージ同梱）で代替（DC-004） |
| プレビューのテーマ適用スコープ | 同一 document で適用 / iframe・別ウィンドウ隔離 | **エディタ chrome は専用 MUI テーマ（`editorUiTheme`）で分離・プレビューのみプレゼンテーマ**（実装で確定） | 本番 MUI テーマの typography は `var(--theme-font-size-*)`（スライド用の大きなサイズ・`baseFontSize` で拡大）を参照するため、同一 document のエディタ UI に波及して巨大化した。エディタ chrome は固定サイズの `editorUiTheme` を使い、プレゼンのテーマは `ThemeProvider` でプレビュー配下にのみ適用して分離した。9.2 の波及課題はこれで解消 |
| スライドデータ型 | 新規編集用型を作る / 既存 `types.ts` を流用 | **既存 `types.ts` を流用** | 新規型は暗黙スキーマの二重管理とラウンドトリップ破壊リスクを招く。編集は既存構造の無損失往復に徹する |
| JSON エディタの実装 | A:plain textarea（MUI TextField multiline） / B:構文強調ライブラリ（CodeMirror 等） | **A（plain textarea ＋ 外部エラー表示）** | 構文・スキーマ検証は `parseSlides` の結果を `errors` props で外部表示すれば足り、エディタ自体の高度機能は本 Feature では不要（DC-005 と整合）。将来ライブラリを追加する場合は T-003 のライフサイクル管理（`useEffect` ＋ クリーンアップ）に従う |
| 無損失往復の型安全 | `as any` を多用 / `unknown` 保持＋狭い narrowing | **`unknown` のまま保持し狭い範囲でのみ型ガード** | 自由記述は `[key: string]: unknown` のまま往復させ、`as` の濫用を避ける（T-001）。編集で実際に触るフィールドのみ narrowing する |
| export のアセット収集元 / 命名 | 固定ディレクトリ / base_dir 引数 | **`base_dir` 引数（読込中パッケージ基準）＋ `name`/`version` は編集 UI 入力**（ユーザー確認済み） | 読込中パッケージの相対アセットを基準に収集する。生成 package.json は `@slides/{name}`、初期値は meta.title のスラグ / `1.0.0`。存在しないアセットは `export-slides.mjs` と同様スキップ |
| 編集対象データ | 書換後の presentationData / 元の相対パス JSON | **元の相対パス JSON（`LoadedSlidePackage.rawText`）**（ユーザー確認済み） | 読込済み `presentationData` は `resolveLocalAssetPaths` で `asset://` URL に書換済みで可搬性を失う。書換前の生テキスト `rawText` を編集の土台にし、プレビュー表示のみ `resolveLocalAssetPaths` で解決。保存・書き出しは相対パスのまま（無損失・可搬・DC-003） |
| 層B の bundle 正規化 / 走査順 | クローンのまま / JS と挙動一致 | **`filter_addon_manifest` で bundle を `addons/<basename>` に正規化＋`preserve_order`**（レビュー修正） | 残す manifest エントリとコピー対象を同一集合にし実行時 404 を防ぐ。basename 化で層B のパストラバーサルを防止（層A の `sanitize_addon_name` と防御一貫）。`serde_json` の `preserve_order` で `extract_asset_paths` の走査順を JS（挿入順）に一致（DC-003） |
| 層C 信頼一覧の生成元 | 最近開いた8件 / trustMap 全キー | **`getAddonTrustMap()` 全キー基点（recent は title 補完）**（レビュー修正） | 最近リスト上限（8件）を超えて追い出された「許可済み」パッケージも一覧に残し個別に取り消せる（FR-008）。書込は直列化キューで競合を防止 |
| 編集画面レイアウト | 左右2カラム（編集/プレビュー） / 上下2段 | **上段=フォーム70%:プレビュー30%（7:3）／下段=slides.json 全幅・エラー時プレビュー非表示**（ユーザー確認済み） | プレゼン資料は横長でプレビュー右カラムにデッドスペースが多い。JSON 編集を下段で全幅化し、プレビューは上段に。グリッドは `minmax(0, ...)`（`transform: scale` はレイアウト幅を変えないためトラック肥大化を防ぐ） |

## 9.2. 未解決の課題

| 課題 | 影響度 | 対応方針 / 実装での決着 |
|------|-----|------|
| Edit 画面内でエディタ chrome UI とプレビューが同一 CSS 変数スコープを共有 | 中 | ✅ **解消**。エディタ chrome を固定サイズの `editorUiTheme` に分離し、プレゼンテーマは `ThemeProvider` でプレビュー配下にのみ適用（§9.1）。`applyThemeData` のグローバル CSS 変数書込は残るが、フォントサイズの波及は MUI テーマ層で遮断した |
| 型未定義フィールドの検証強度 | 中 | 保存前検証は既存 `getValidationErrors`（id/layout/title 等）レベルに留め、深い検証は段階導入。無損失往復（FR-004）を優先し過度な検証で自由記述を弾かない（実装は本方針どおり） |
| 層A の dev 検出手段 | 低 | ✅ **確定**。UI は `import.meta.env.DEV`、Rust は `cfg!(debug_assertions)` で出し分け。増減後は `npm run build:addons` が必要な旨を UI に明示 |
| `.tgz` の `package/` サブディレクトリ規約 | 低 | ✅ **確定**。`extract_slide_package` の `package/` 優先探索に合わせ、`build_slide_package_gated` も `package/` 配下へ格納して往復を保証 |
| 書き込みパスのスコープ限定（DC-002） | 低 | 未対応（要件外）。`save_slides_json`/`export_slide_package` は任意絶対パスを受理するが、DC-002 は「Rust 境界＋編集モードゲート」を規定するのみでパス限定は要件外。JS に fs 書込権限を渡さない主要防御は実装済みで、パスは OS ダイアログ経由で確定する。多層防御としてスコープ限定を将来検討 |

---

# 10. 変更履歴

## v0.2（implement・2026-07-24）

**変更内容:**

- Issue #13 の実装完了に伴い、設計書を実装実態へ整合（task-cleanup）。impl-status を `implemented` に更新し、§1 実装ステータスを 🟢 実装完了へ。
- §6 インターフェース定義を最終シグネチャに更新: `set_edit_mode` の `Result` 化、`export_slide_package` への `base_dir`/`name`/`version` 追加、層A コマンド（`list/add/remove_builtin_addon`）、`clearAddonTrustDecision`/`getPackageAddonNames`/書込直列化、`ExportOptions` の精緻化、`serde_json` の `preserve_order`。
- §9.1 に実装で確定した設計判断を追記: export のアセット収集元（`base_dir`）と `name`/`version` 入力、編集対象データ（`rawText`＝相対パス JSON）、層B の bundle 正規化＋走査順一致、層C 信頼一覧の trustMap 全キー基点、編集画面レイアウト（上7:3／下 json 全幅・エラー時プレビュー非表示）。テーマ適用スコープの決定を `editorUiTheme` による chrome 分離に更新。
- §9.2 の未解決課題を決着（テーマ波及＝解消、層A 検出／`package/` 規約＝確定）。DC-002 のパススコープ限定は要件外の将来検討として明記。
- レビュー（アドオン付け外し／i18n）＋敵対的検証の結果（blocker/CONFIRMED 0）と実機検証（B/C/D）を反映。詳細は [implementation_progress.md](../task/slide-edit-mode/implementation_progress.md)。

## v0.1（draft）

**変更内容:**

- 初版作成。Issue #13（Epic #12 配下の器の作成）に基づく技術設計を定義。編集 UI 形式・capability 分離・export 実行場所・Addon 付け外し層の 4 決定（ユーザー確認済み）と、層A の dev 限定制約・プレビュー差分描画・テーマ隔離方針を記録。
