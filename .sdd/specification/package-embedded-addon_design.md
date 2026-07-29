---
id: design-package-embedded-addon
title: パッケージ同梱アドオンのランタイムロード 技術設計書
type: design
status: approved
sdd-phase: plan
impl-status: implemented
created: 2026-07-22
updated: 2026-07-28
depends-on:
  - spec-package-embedded-addon
tags:
  - addon
  - tauri
  - slide-package
  - security
  - lifecycle
category: addon-system
---

# パッケージ同梱アドオンのランタイムロード

**ドキュメント種別:** 技術設計書 (Design Doc)
**SDDフェーズ:** Plan (計画/設計)
**最終更新日:** 2026-07-28
**関連 Spec:** [package-embedded-addon_spec.md](./package-embedded-addon_spec.md)
**関連 PRD:** [package-embedded-addon.md](../requirement/package-embedded-addon.md)

---

# 1. 実装ステータス

**ステータス:** 🟢 実装済み（コード・自動テスト完了。macOS 実機で核心経路を確認済み。一部 AC の目視と Windows は残）

> 2026-07-23: macOS 実機で「同梱アドオンの初回確認ダイアログ表示」「同梱コンポーネントの正常描画（fallback にならない）」を確認（AC-1、AC-5 のダイアログ部）。残る目視項目: A→B→A 切替（AC-2）・再オープン二重注入（AC-3）・発表者ビュー（AC-4）・拒否→fallback/一律無効/リセット（AC-6）・ホーム復帰クリア（AC-7）・Windows(NFR-004)。これらのロジックは統合テスト `src/__tests__/addonLifecycle.integration.test.ts` で担保済み。

## 1.1. 実装進捗

| モジュール/機能 | ステータス | 備考 |
|----------|--------|------|
| 実機 PoC（asset script 実行）| 🟢 | Issue #5 で macOS 検証済み（Windows は追跡課題） |
| `ComponentRegistry` owner API | 🟢 | FR-002。`registerComponent(owner?)`/`unregisterOwner`。単体テスト済み |
| `addonLoader.ts`（新規） | 🟢 | FR-001 / FR-004。`loadAddonScripts`/`loadBuiltinAddons`。冪等化を単体テスト済み |
| `addon-bridge.ts` owner 伝搬 | 🟢 | FR-002。`setCurrentAddonOwner` |
| `localSlideLoader.ts` アドオン解決 | 🟢 | FR-005。`resolvePackageAddons`/`extractAddonBundlePaths`（純粋関数テスト済み） |
| `main.tsx` 順序制御 | 🟢 | FR-003。破棄→await→再マウント。`sourcePath` で信頼判定。`RootContent` が設定ダイアログの開閉 state（`settingsOpen`）も保持する |
| `useAddonSettings.ts`（新規） | 🟢 | FR-008〜009。アドオン信頼設定（一律無効化フラグ・層C 個別付け外し）の state / 復元 / 永続化を Root 側に集約。単体テスト済み |
| 発表者ビュー伝搬 | 🟢 | FR-006。`addonsChanged` emit（usePresenterView）／描画前ロード（presenterViewEntry） |
| `export-slides.mjs` 同梱 | 🟢 | FR-007。`--addons`／相対パス化／純粋関数テスト済み。`export:slides` に `build:addons` 前段 |
| セキュリティ（信頼確認/オプトアウト） | 🟢 | FR-008〜010。`isAddonAllowed`（既定拒否）／`SettingsWindow` トグル・失効・層C 個別付け外し。設定 state の所有者は `RootContent` + `useAddonSettings` |
| 実機統合検証（4.5）・Windows(NFR-004) | 🔴 | headless 環境のため未実施。実機での A→B→A・発表者ビュー・拒否時の確認が残 |
| lib.rs 検証テスト（任意 5.2） | ⚪ | 任意タスク。未実施（本体変更不要のため） |

---

# 2. 設計目標

1. **owner スコープによるライフサイクルの構造的解決** — パッケージ切替時の残留・同名 silent 上書き・戻り時の混線（NFR-003）を、owner 単位のアンロードで根本的に防ぐ。
2. **解決ロジックの不変性** — `resolveComponent` の custom → default → fallback を一切変更せず、追加 API のみで実現する（DC-001）。
3. **ロード順序の厳守** — 「展開 → `allow_asset_dir` → `<script>` 注入 → 再マウント」の順序を守り、描画前に登録を完了させる（Map は React 状態でないため）。
4. **ローダの一元化と冪等化** — `main.tsx` / `presenterViewEntry.tsx` に重複する `loadAddonScript`/`loadAddons` を単一モジュールへ集約し、二重注入を防止する。
5. **セキュリティのデフォルト安全化** — 同梱アドオンは既定で実行せず、利用者の明示的許可を要する。
6. **リグレッションゼロ** — 既存のビルド時同梱・組み込みアドオンロードの挙動を変えない（NFR-002）。

---

# 3. 技術スタック

| 領域 | 採用技術 | 選定理由 |
|------|------|------|
| ロード方式 | IIFE + `convertFileSrc` の asset URL を `<script src>` 注入 | 実機 PoC（#5）で macOS 動作確認済み。ES 動的 `import()` は react の import map + シムが必須で macOS 13.3 未満リスク・ESM クロスオリジン未検証のため不採用 |
| コンポーネント解決 | 既存 `ComponentRegistry`（3層：custom→default→fallback） | A-004 準拠。owner 管理は追加 API として実装し解決順は不変 |
| パッケージ展開 | Rust `extract_slide_package` / `allow_asset_dir`（`flate2`/`tar`） | 既存実装をそのまま活用（再帰スコープ許可で `addons/` を包含） |
| 永続化 | `@tauri-apps/plugin-store`（`LazyStore`） | 既存の最近使ったリストと同じ機構。信頼判断は既存ストア `slide-package-state.json` に別キー `addonTrust` で path 単位保存（最近使ったリストの `recentSlidePackages` と分離） |
| 確認ダイアログ | `@tauri-apps/plugin-dialog` | 既存のエラーダイアログと同じ機構 |
| パッケージング | Node スクリプト（`export-slides.mjs`）+ `npm pack` | 既存のエクスポート機構を踏襲。`build:addons` 前段でアドオンをビルド |

---

# 4. アーキテクチャ

## 4.1. システム構成図

```mermaid
graph TD
    subgraph Rust["Rust (src-tauri/src/lib.rs) 変更不要"]
        EX[extract_slide_package]
        AL[allow_asset_dir 再帰]
    end
    subgraph Main["メインウィンドウ (main.tsx = Root)"]
        LSL[localSlideLoader.ts]
        LOADER[addonLoader.ts 新規]
        BRIDGE[addon-bridge.ts]
        REG[ComponentRegistry.tsx]
        PV[usePresenterView.ts]
        HOOK[useAddonSettings.ts 新規]
        SW[SettingsWindow Root がマウント]
    end
    subgraph Presenter["発表者ビュー (presenterViewEntry.tsx)"]
        PLOADER[addonLoader.ts 共用]
        PREG[ComponentRegistry 別インスタンス]
    end

    LSL -->|extract/allow 呼出| EX
    LSL --> AL
    LSL -->|addonScripts, owner| LOADER
    LOADER -->|script 注入| BRIDGE
    BRIDGE -->|registerComponent name comp owner| REG
    PV -->|emit addonsChanged| Presenter
    PLOADER --> PREG
    SW -->|一律無効化 個別付け外し 失効| HOOK
    HOOK -->|信頼判断の読み書き| LSL
```

設定ダイアログ（`SettingsWindow`）はホーム画面・プレゼンテーション画面の双方から開くため、Root（`main.tsx` の `RootContent`）が開閉 state とダイアログ本体を持ち、アドオン信頼設定の state / 永続化は `useAddonSettings` が担う（詳細は §4.2 / §9.1）。

## 4.2. モジュール分割

| モジュール名 | 責務 | 依存関係 | 配置場所 |
|--------|------|------|------|
| `ComponentRegistry` | owner を記録する登録・owner 単位アンロード | なし | `src/components/ComponentRegistry.tsx`（改修） |
| `addonLoader` | manifest 解決済み bundle の冪等 `<script>` 注入、組み込みロード集約 | `addon-bridge` | `src/addonLoader.ts`（新規） |
| `addon-bridge` | `__ADDON_REGISTER__` に owner を伝搬 | `ComponentRegistry` | `src/addon-bridge.ts`（改修） |
| `localSlideLoader` | `addons/manifest.json` 読取・asset URL 化、`owner`/`addonScripts` 返却、信頼判定 | Rust コマンド, `plugin-store`, `plugin-dialog` | `src/localSlideLoader.ts`（改修） |
| `main.tsx`（`RootContent`） | 切替順序制御（破棄→await→再マウント）、`owner`/`addonScripts` 受領。設定・ショートカットのダイアログ開閉 state（`settingsOpen`/`shortcutsOpen`）とダイアログ本体を保持し、`useAddonSettings` の返り値を `SettingsWindow` へ渡す | `addonLoader`, `ComponentRegistry`, `localSlideLoader`, `useAddonSettings`, `SettingsWindow` | `src/main.tsx`（改修） |
| `useAddonSettings` | アドオン信頼設定の state・復元・永続化（一律無効化フラグ／層C の個別付け外し／失効）。`{ active, recentPackages }` を受け取り、`active` が true になるたび `getAddonTrustMap()` 基点で信頼一覧を再構築（title は `recentPackages` から補完・store 再読なし）し、更新は楽観更新＋失敗時ロールバック。`AddonTrustEntry` 型もこのファイルが定義する | `localSlideLoader` | `src/hooks/useAddonSettings.ts`（新規） |
| `usePresenterView` | 切替時・ready 受信時に `addonsChanged` を emit | `types` | `src/hooks/usePresenterView.ts`（改修） |
| `presenterViewEntry` | 受信アドオンを描画前にロード・登録、切替時 unregister | `addonLoader`, `ComponentRegistry` | `src/presenterViewEntry.tsx`（改修） |
| `App` | `addonOwner`/`addonScripts` を props で受け取り `usePresenterView` へ中継。アドオン信頼設定は保持せず、ツールバーの `SettingsButton` は props の `onOpenSettings` を呼ぶだけ（ダイアログ本体は Root が持つ） | `usePresenterView` | `src/App.tsx`（改修） |
| `HomeScreen` | 左上（`.settingsCorner`）に `SettingsButton` を置き、props の `onOpenSettings` で Root のダイアログを開く（スライドを開く前でも設定を変更できる） | なし | `src/components/HomeScreen.tsx`（改修） |
| `SettingsWindow` | 同梱アドオン一律無効化トグル・信頼失効ボタン・層C 個別付け外しの UI（`embeddedAddonsDisabled`/`onToggleEmbeddedAddons`/`onResetAddonTrust`/`addonTrust`/`onSetAddonTrust`）。アドオン系 props は optional で、渡らない場合は該当行を描画しない | なし | `src/components/SettingsWindow.tsx`（改修） |
| `types` | `PresenterViewMessage` に `addonsChanged` 追加 | なし | `src/data/types.ts`（改修） |
| `export-slides` | `--addons` でアドオン同梱、manifest 相対パス化 | なし | `scripts/export-slides.mjs`（改修） |

`src-tauri/src/lib.rs` は**変更不要**（`extract_slide_package` が `package/` ごと展開、`allow_asset_dir` の再帰許可が `addons/` を包含）。任意で `addons/` 展開の検証テストを追加してよい。

---

# 5. データモデル

```typescript
// localSlideLoader.ts
export interface LoadedSlidePackage {
  data: PresentationData
  baseDir: string
  sourcePath: string      // 利用者が選択した元パス（.spkg または slides.json）。信頼判断の永続化キー
  addonScripts: string[]  // convertFileSrc 済み・manifest 宣言かつ addons/ 配下のみ
  owner: string           // = baseDir（owner 単位アンロードのスコープ識別子）
}

// パッケージ内 addons/manifest.json の最小形（bundle のみ参照する。extractAddonBundlePaths が unknown を安全に取り出す）
interface PackageAddonManifest {
  addons?: Array<{ bundle?: unknown }>
}

// 信頼判断の永続化（既存ストア slide-package-state.json のキー "addonTrust"）
type AddonTrustDecision = 'allowed' | 'denied'
type AddonTrustMap = Record<string /* path */, AddonTrustDecision>

// 設定（グローバル一律無効化）— UI は SettingsWindow、state / 永続化は useAddonSettings が管理
interface AddonSettings {
  disableEmbeddedAddons: boolean
}
```

---

# 6. インターフェース定義

```typescript
// ComponentRegistry.tsx
const customOwners = new Map<string, string>() // name → owner
export function registerComponent(name: string, component: RegisteredComponent, owner?: string): void
export function unregisterOwner(owner: string): void // owner に属する custom 登録のみ削除
// resolveComponent / clearRegistry は不変（clearRegistry はテスト専用のまま）

// addonLoader.ts（新規）
// src → 注入済み <script> 要素。再ロード時は旧要素を除去してから再注入する（冪等かつ owner 切替後の再登録を可能にする）
const injectedScripts = new Map<string, HTMLScriptElement>()
export function loadAddonScripts(scripts: string[], owner: string): Promise<void>
export function loadBuiltinAddons(): Promise<void> // 従来の /addons/manifest.json ロードを集約

// addon-bridge.ts
export function setCurrentAddonOwner(owner: string | undefined): void
// __ADDON_REGISTER__ は currentAddonOwner を registerComponent の第3引数へ渡す

// localSlideLoader.ts
async function resolvePackageEntry(selectedPath: string): Promise<{ slidesJsonPath: string; baseDir: string }>
// .spkg は extract_slide_package で展開、slides.json はその dirname を baseDir とする
async function resolvePackageAddons(baseDir: string): Promise<string[]>
// allow_asset_dir 後に baseDir/addons/manifest.json を読み、bundle を convertFileSrc で URL 化
export function resolveAddonTrust(disabled: boolean, decision: AddonTrustDecision | undefined): 'allow' | 'deny' | 'prompt'
// 純粋関数。一律無効化 → 永続化済み判断 → 未判断は 'prompt'
export async function isAddonAllowed(path: string): Promise<boolean>
// resolveAddonTrust の結果を評価し、'prompt' 時のみ確認ダイアログ（既定拒否）を出して path 単位に永続化
export async function isEmbeddedAddonsDisabled(): Promise<boolean>                // 一律無効化フラグの取得（FR-009）
export async function setEmbeddedAddonsDisabled(disabled: boolean): Promise<void> // 一律無効化フラグの設定（FR-009）
export async function resetAddonTrust(): Promise<void>                            // 許可/拒否済み判断をすべて失効（FR-009）
// ※ hasAddons 判定は isAddonAllowed に含めず、呼び出し側 main.tsx（applyPackageAddons）で
//   `pkg.addonScripts.length > 0 && (await isAddonAllowed(pkg.sourcePath))` として合成する

// hooks/useAddonSettings.ts（新規）— アドオン信頼設定の state / 永続化を Root 側に集約。
// AddonTrustEntry の定義もこのファイルが持つ（hooks → components の依存方向の逆流を避けるため）
export type AddonTrustEntry = { path: string; title: string; decision: AddonTrustDecision | undefined }
export interface UseAddonSettingsReturn {
  addonsDisabled: boolean                 // 一律無効化フラグ（FR-009）
  addonTrustList: AddonTrustEntry[]        // 層C の個別付け外し対象（FR-008）
  handleToggleAddonsDisabled: (disabled: boolean) => void
  handleResetAddonTrust: () => void
  handleSetAddonTrust: (path: string, decision: AddonTrustDecision | undefined) => void
}
export function useAddonSettings(options: { active: boolean; recentPackages: RecentSlidePackageEntry[] }): UseAddonSettingsReturn
// active が true になるたび getAddonTrustMap() で信頼一覧を再構築する（trustMap 全キーを基点にし、
// title は options.recentPackages から補完。所有者の Root が既に持つ写しを使うため、
// getRecentSlidePackages() での store 再読は行わない。§9.1「層C 信頼一覧の生成元」）

// usePresenterView.ts
export function usePresenterView(options: { slides; addonOwner?; addonScripts?; ... }): UsePresenterViewReturn
// hook オプション addonOwner/addonScripts を受け取り、マウント時と presenterViewReady 受信時に
// addonsChanged を emit する（専用の sendAddonsChanged 関数は持たない）
```

---

# 7. 非機能要件実現方針

| 要件 | 実現方針 |
|------|------|
| NFR-001 セキュリティ | `isAddonAllowed` で「設定の一律無効化 → path 単位の永続化判断 → 未判断は確認ダイアログ（既定拒否）」を通過したときのみ `loadAddonScripts` を呼ぶ。一律無効化トグルは既存 `SettingsWindow` に追加し、その `SettingsWindow` は Root（`main.tsx`）がマウントするためホーム画面（スライドを開く前）からも無効化できる。設定 state と永続化は `useAddonSettings` に集約。ロード対象は manifest 宣言かつ `baseDir/addons/` 配下に限定（FR-010）。README に信頼発行元・無効化を明記 |
| NFR-002 リグレッション | 起動時ロードは `loadBuiltinAddons()`（旧 `loadAddons` を移設）として分離保持。`registerComponent` の owner は任意引数のため既存呼び出しは無変更。typecheck/test をゲートにする |
| NFR-003 切替堅牢性 | 切替の度に旧 owner を `unregisterOwner` → 新 owner を `await` ロード → 再マウント。ホーム復帰・サンプル表示時も旧 owner を unregister。owner=baseDir で A/B を一意識別 |
| NFR-004 実機互換 | ロード方式は PoC 済みの asset script 注入。Windows(WebView2) は追跡課題として `9.2` に記載 |

---

# 8. テスト戦略

| テストレベル | 対象 | カバレッジ目標 |
|--------|------|---------|
| 単体（Vitest） | `ComponentRegistry`: owner 登録・`unregisterOwner` が custom のみ削除・default 温存・同名別 owner 警告 | 分岐網羅 |
| 単体（Vitest） | `addonLoader`: 同一 src の二重注入なし・CSS 冪等 | 主要分岐 |
| 単体（Vitest） | `export-slides`: manifest bundle の相対パス書換・`files` に `addons` 追加 | 正常系 |
| 単体（Vitest） | 信頼判定: 一律無効/許可済み/拒否済み/未判断 の分岐 | 分岐網羅 |
| 単体（Vitest） | `useAddonSettings`（`src/hooks/__tests__/useAddonSettings.test.ts`）: 一律無効化フラグの復元・`settingsOpen` false の間は一覧を取得しない・trustMap 基点の一覧構築（title は recent 補完）・個別許可/未設定戻しの楽観更新・保存失敗時のロールバック | 分岐網羅 |
| 結合（手動/デモ） | A→B→A 切替で残留・混線なし、再オープンで二重注入なし、発表者ビューで fallback にならない、拒否時もスライドは開ける | AC 全項目 |
| リグレッション | `npm run typecheck` / `npm run test`、既存ビルド時同梱の動作 | 全通過 |

---

# 9. 設計判断

## 9.1. 決定事項

| 決定事項 | 選択肢 | 決定内容 | 理由 |
|------|-----|------|------|
| ロード方式 | A:script注入 / B:動的import() | **A（script 注入）** | 実機 PoC 済み。B は react 解決に import map+シム必須で OS 依存リスク・ESM クロスオリジン未検証 |
| レジストリ拡張 | 最小変更(owner無) / owner スコープ | **owner スコープ（方式C）** | singleton Map の残留・混線は owner 管理なしでは解決不能。最小変更でも実質必須で本方式に収束 |
| `registerComponent` の owner | 新関数追加 / 既存に任意引数 | **既存に任意引数 `owner?`** | 後方互換を保ちつつ既存呼び出しを無変更にできる |
| ローダ配置 | 各エントリに重複 / 共通モジュール | **`addonLoader.ts` に集約** | `main.tsx`/`presenterViewEntry.tsx` の重複実装を統合し冪等化を一元管理 |
| 切替順序 | 状態更新と並行ロード / 逐次 | **逐次（破棄→await→再マウント）** | `customComponents` は React 状態でないため、描画前に登録完了が必須 |
| セキュリティ緩和 | origin/iframe 分離 / オプトアウト | **オプトアウト** | 分離は React 単一インスタンス共有要件と両立しない |
| 初回既定挙動 | 確認して拒否 / 確認して許可待ち / 一律無効 | **確認して既定拒否** | RCE 相当リスクに対し安全側に倒す（ユーザー確認済み） |
| Rust 側 | 変更 / 変更不要 | **変更不要** | `extract_slide_package` の `package/` 展開と `allow_asset_dir` の再帰許可で `addons/` を包含 |
| アドオン信頼設定 state の所有者 | `App` が保持 / Root（`main.tsx`）に直書き / Root から専用フックへ抽出 | **Root から専用フック `useAddonSettings` へ抽出**（2026-07-28） | 設定ダイアログをホーム画面からも開けるようにするため、ダイアログ本体の所有者を `App` から共通祖先の Root（`RootContent`）へ引き上げた。それに伴い設定に紐づくアドオン信頼ロジック（2 state・2 effect・4 callback）も移動するが、これらは「アドオン信頼設定の読み書き」という単一の関心事で閉じており、外部依存は `localSlideLoader` と `settingsOpen` のみ。`main.tsx` に直書きすると「スライドを開く／アドオンをロードする／編集モード」という Root 本来の関心事に設定永続化が混入するため、`src/hooks/` へ薄い境界で切り出した。振る舞いは移設前と同一（`console.error` のプレフィックスのみ `[App]` → `[useAddonSettings]`） |
| `owner` と `sourcePath` の分離 | 単一キー兼用 / `owner`=baseDir と `sourcePath` を分離 | **分離（2 つのキーを持つ）** | `owner`（= 展開先 `baseDir`）はレジストリの owner 単位アンロードのスコープ識別子で、`.spkg` 展開のたびに変わりうる。信頼判断は利用者が選んだ元パス `sourcePath`（`.spkg`／`slides.json` の選択パス）を安定キーにする。両者を混同すると、展開先が変わるたびに信頼判断が失効する／別パッケージの判断を誤って再利用する恐れがあるため分離する |

## 9.2. 未解決の課題

| 課題 | 影響度 | 対応方針 |
|------|-----|------|
| Windows(WebView2) 実機未検証 | 中 | `http://asset.localhost/…` 形式での動作を環境が用意でき次第確認（Epic #4 フォローアップ）。設計上はロード方式非依存 |
| manifest の SHA-256 整合性ピン止め | 低 | FR では任意項目。初期実装ではスコープ外とし、必要に応じ追加 |

---

# 10. 変更履歴

## v0.4（2026-07-29・useAddonSettings の契約を実装へ同期）

**変更内容（ドキュメント修正。実装の変更はなし）:**

- `useAddonSettings` のシグネチャを `useAddonSettings(settingsOpen: boolean)` から実際の `useAddonSettings({ active, recentPackages }: { active: boolean; recentPackages: RecentSlidePackageEntry[] })` へ修正（§4.2 / §6）。`recentPackages` を呼び出し側の Root から受け取ることで、`getRecentSlidePackages()` による store 再読を行わない実装に合わせた。
- `AddonTrustEntry` の定義がフック側（`src/hooks/useAddonSettings.ts`）にあることを明記（v0.3 時点では `SettingsWindow` 側の型として記述していた）。

## v0.3（2026-07-28・設定ダイアログの Root 引き上げ）

**変更内容（アドオン信頼設定の所有者移動。機能追加はなし）:**

- 設定ダイアログ（`SettingsWindow`）とショートカット一覧（`ShortcutsDialog`）の所有者を `App` から Root（`src/main.tsx` の `RootContent`）へ引き上げた。ホーム画面にも設定導線（`HomeScreen` 左上の `SettingsButton`）が加わり、スライドを開く前でも同梱アドオンの一律無効化・層C の個別付け外しを操作できる。
- これに伴い `App` が保持していたアドオン信頼系ロジック（`addonsDisabled`/`addonTrustList` の 2 state、復元・信頼一覧構築の 2 effect、`handleToggleAddonsDisabled`/`handleResetAddonTrust`/`handleSetAddonTrust` の各ハンドラ）を新規フック `src/hooks/useAddonSettings.ts` へ抽出（§4.2 / §6 / §9.1）。振る舞いは移設前と同一。
- `SettingsWindow` のアドオン系 props とスクロール速度 props は optional で、Root は `view === 'presentation'` のときだけスクロール速度を渡す。ホーム画面ではグローバル設定（言語・キーボードショートカット・アドオン設定）のみが表示される。
- 単体テスト `src/hooks/__tests__/useAddonSettings.test.ts` を追加（§8）。

## v0.2（approved・2026-07-26）

**変更内容:**

- 実装完了（`impl-status: implemented`）と統合テスト・実機検証（AC-1〜7）を踏まえ、PRD/spec/design の `status` を `draft` → `approved` に更新（上流 PRD も併せて承認し依存チェーンの整合を維持）。設計内容の変更はなし

## v0.1（draft）

**変更内容:**

- 初版作成。Issue #4（Epic）/ #6（方式C）/ #7（セキュリティ）に基づく技術設計を定義
