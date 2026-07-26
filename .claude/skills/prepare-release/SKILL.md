---
name: prepare-release
description: "リリース準備を実行。CHANGELOG.md / CHANGELOG.ja.md 更新、バージョン更新（package.json, src-tauri/Cargo.toml, src-tauri/Cargo.lock, src-tauri/tauri.conf.json, README.md + README.ja.md バッジ）に加え、UI 変更時はスクリーンショット (resources/screenshots/{en,ja}/) も自動更新（差分があれば独立コミットを作成）する。ユーザーが「リリース準備」「リリースする」「prepare release」「バージョン上げて」「CHANGELOG 更新」と言ったとき、または新バージョンのリリース準備が必要な場面で使用する。"
version: 1.0.0
user-invocable: true
argument-hint: "<version>"
allowed-tools: Read, Edit, Glob, Grep, Bash, Write, AskUserQuestion
---

# Prepare Release - リリース準備スキル

CHANGELOG.md / CHANGELOG.ja.md（英日 2 ファイル）を更新し、各バージョンマニフェスト（`package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, `README.md`, `README.ja.md`）のバージョンを同期更新するリリース準備スキル。

**ハイブリッド方式**: `[Unreleased]` セクションに既存内容があればそれを活用し、git 変更履歴から不足分を補完する。

## Input

$ARGUMENTS

バージョン番号を引数として受け取る（`v` プレフィックスなし）。

### Input Examples

```
/prepare-release 0.2.0
/prepare-release 1.0.0-beta
```

### Validation

- 引数が空の場合はエラー終了し、使用例を表示する
- セマンティックバージョニング形式（`X.Y.Z` または `X.Y.Z-prerelease`）であることを確認する

## Target Files

### CHANGELOG Files

英日 2 ファイルを常にペアで更新する。片方のみの更新は不整合を生むため両方を必須対象とする。

| ファイル             | 言語  |
|:-----------------|:----|
| `CHANGELOG.md`    | 英語  |
| `CHANGELOG.ja.md` | 日本語 |

カテゴリ見出し（`###`）の対応表:

| EN               | JA     |
|:-----------------|:-------|
| Breaking Changes | 破壊的変更  |
| Added            | 追加     |
| Changed          | 変更     |
| Fixed            | 修正     |
| Removed          | 削除     |

### Version Manifest Files

Tauri 2 + Rust プロジェクトの全バージョンマニフェストを同期更新する。**いずれか 1 つでも更新漏れがあると、ビルド成果物・実行時表示・README バッジでバージョン不整合が発生する**ため、すべて必須対象とする。

| ファイル                     | フィールド                                       | 役割                                                                                    |
|:-------------------------|:----------------------------------------------|:---------------------------------------------------------------------------------------|
| `package.json`           | `"version"`                                    | npm パッケージバージョン                                                                        |
| `src-tauri/Cargo.toml`   | `version = "X.Y.Z"`（`[package]` セクション）        | Rust クレートバージョン（バイナリに埋め込み）                                                              |
| `src-tauri/Cargo.lock`   | `version = "X.Y.Z"`（`name = "app"` エントリ直下）    | Cargo.toml と整合するロックファイル。同期しないと `cargo --locked` ビルドが失敗する／次回 cargo 実行時に勝手に変更される              |
| `src-tauri/tauri.conf.json` | `"version"`                                 | Tauri アプリバージョン（インストーラ表示）                                                              |
| `README.md`              | バージョンバッジ（`img.shields.io/badge/version-X.Y.Z`） | README（英語）上のバージョン表示                                                                    |
| `README.ja.md`           | バージョンバッジ（`img.shields.io/badge/version-X.Y.Z`） | README（日本語）上のバージョン表示                                                                   |

## Processing Flow

### Step 1: Validate Version Argument

1. `$ARGUMENTS` からバージョン番号をパースする
2. セマンティックバージョニング形式を検証する
3. 不正な場合はエラーメッセージと使用例を表示して終了する

### Step 2: Detect Previous Release

1. `git tag --list 'v*' --sort=-version:refname` で最新のリリースタグを取得する
2. タグが存在しない場合は初回リリースとして扱う（全コミットを対象にする）
3. 比較基点を記録する（例: `v1.0.0`）

### Step 3: Read Current [Unreleased] Content

`CHANGELOG.md` と `CHANGELOG.ja.md` を Read で並列に読み込み、それぞれの `## [Unreleased]` セクションの内容を抽出する。

- **ファイルが存在しない場合**: Step 6 で新規作成する。空として扱い Step 4 に進む
- **内容あり**: 既存エントリをベースとして保持する（2 ファイルの構成が既にずれている場合は、内容が多い方を基準にもう一方を補完する）
- **内容なし**: Step 4 で全エントリを生成する

### Step 4: Analyze Git Changes

前回タグから HEAD までの変更を分析する。

```bash
# コミット一覧
git log <previous-tag>..HEAD --oneline --no-merges

# 変更ファイル統計
git diff <previous-tag>..HEAD --stat
```

変更内容を以下のカテゴリに分類する:

| Category         | 判定基準                |
|:-----------------|:---------------------|
| Breaking Changes | 互換性を破る変更、設定ファイル形式変更 |
| Added            | 新機能、新 UI コンポーネント    |
| Changed          | 既存機能の改善・変更          |
| Fixed            | バグ修正、不具合対応          |
| Removed          | 機能や UI の削除          |

### Step 5: Generate / Supplement CHANGELOG Entries

**重要: CHANGELOG はアプリケーション利用者向けである。**

以下の変更は CHANGELOG に **含めない**:

- CI/CD ワークフロー（`.github/workflows/`）の追加・変更
- 開発者向けスクリプト（`scripts/`）の追加・変更
- テストコード・テストフィクスチャ（`*.test.ts`, `*.spec.ts`, `e2e/`）の追加・変更
- `.claude/` 配下の開発者向け設定・スキル
- `.sdd/` 配下の設計ドキュメント
- `.gitignore`、PR テンプレート等のリポジトリ管理ファイル
- 純粋な内部リファクタリング（ユーザーに見える変化がないもの）
- ドキュメント（README.md 等）の変更
- `vite.config.ts` 等のビルド設定変更（ユーザーに見える変化がない場合）

以下の変更は CHANGELOG に **含める**:

- `src/` 配下のフロントエンドコード変更（新機能、UI コンポーネント、ユーザー操作）
- `addons/src/` 配下のアドオン変更（新規追加・挙動変更）
- `src-tauri/` 配下の Rust コード変更（ユーザーが体感する挙動の変化があるもの）
- ユーザーが体感するバグ修正・機能追加・パフォーマンス改善
- 対応プラットフォームの追加・変更

**ハイブリッドロジック:**

1. `[Unreleased]` に既存内容がある場合:
    - 既存エントリをベースとする
    - git 変更履歴と照合し、カバーされていないユーザー向け変更を特定する
    - 不足分のエントリのみ追加生成する
2. `[Unreleased]` が空の場合:
    - git 変更履歴からユーザー向け変更のエントリを生成する
3. ユーザー向け変更が存在しない場合:
    - ユーザーに「利用者向けの変更がありません」と報告し、CHANGELOG 更新をスキップするか確認する

**記述スタイル:**

- 各エントリは `- 変更内容の要約` 形式
- カテゴリは `###` ヘッダーで分類（`Target Files > CHANGELOG Files` のカテゴリ対応表に従う）
- 既存の CHANGELOG.md / CHANGELOG.ja.md のスタイルに合わせる
- **英日は同じ内容の翻訳とする**（カテゴリ・エントリ数・順序を一致させる。片方にしかない情報を作らない）

### Step 6: Update CHANGELOG Files

`CHANGELOG.md` と `CHANGELOG.ja.md` の両方に対して以下を実行する（存在しない場合は新規作成する）:

1. `## [Unreleased]` セクションの既存内容をクリアする
2. `## [Unreleased]` の直後に空行を挟んで新バージョンセクションを挿入する:
   ```
   ## [VERSION] - YYYY-MM-DD
   ```
3. 日付は実行日（`date +%Y-%m-%d` で取得）を使用する。日付は英日で同一の値にする
4. Step 5 で生成/統合したエントリを、対応するカテゴリ見出し（EN/JA）で配置する

本リポジトリの CHANGELOG.md / CHANGELOG.ja.md はバージョン比較リンクのフッター（`[Unreleased]: .../compare/...`）を使用していないため、リンク更新は行わない。

### Step 7: Update Version Manifest Files

`Target Files > Version Manifest Files` に列挙した 6 ファイルを置換ルールに従って更新する。

#### 置換ルール

| ファイル                       | 検索 (OLD)                                          | 置換 (NEW)                                          | 備考                                                                                                                                                                                                                                                                                |
|:---------------------------|:-----------------------------------------------|:-----------------------------------------------|:------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `package.json`             | `"version": "OLD"`                                 | `"version": "NEW"`                                 | —                                                                                                                                                                                                                                                                                  |
| `src-tauri/Cargo.toml`     | `version = "OLD"`                                  | `version = "NEW"`                                  | 依存クレートの `version = ...` 記述と衝突するため、`[package]` セクション直下の行のみ対象。Edit が unique 制約で失敗した場合は、直上の `name = "app"` 行を `old_string` に含めて一意化する                                                                                                  |
| `src-tauri/Cargo.lock`     | (複数行) `name = "app"`<br>`version = "OLD"`     | (複数行) `name = "app"`<br>`version = "NEW"`     | `app` は `src-tauri/Cargo.toml` の `[package].name` と一致。Cargo.lock には依存クレート分の version 行が大量にあるため、`name = "app"` 行を含めた 2 行 multiline で一意化する。Cargo.toml と Cargo.lock の不整合は `cargo --locked` ビルドで失敗する |
| `src-tauri/tauri.conf.json` | `"version": "OLD"`                                 | `"version": "NEW"`                                 | —                                                                                                                                                                                                                                                                                  |
| `README.md`                | `version-OLD-`                                     | `version-NEW-`                                     | バッジ URL 内のバージョン部分。色やスタイル（`blue` 等）には触れない                                                                                                                                                                                                              |
| `README.ja.md`             | `version-OLD-`                                     | `version-NEW-`                                     | バッジ URL 内のバージョン部分。README.md と同一の置換を適用する                                                                                                                                                                                                              |

#### 実行手順

1. **Read を 6 ファイル分まとめて並列実行**（1 メッセージで 6 つの Read tool call）
2. 各ファイルの現在のバージョンが OLD と一致することを確認
3. **Edit を 6 ファイル分まとめて並列実行**（1 メッセージで 6 つの Edit tool call、上記置換ルールに従う）

#### Verification

更新後、`grep` で全ファイルが新バージョンに揃っているか確認する（`$NEW` を実バージョンに置換して実行）:

```bash
NEW="X.Y.Z"  # 実際の新バージョン

# 1. JSON / TOML / README の 5 ファイル
grep -nE "\"version\": \"${NEW}\"|version = \"${NEW}\"|version-${NEW}-" \
  package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json README.md README.ja.md

# 2. Cargo.lock の app エントリ
grep -A 1 'name = "app"' src-tauri/Cargo.lock | grep -F "version = \"${NEW}\""
```

両ブロックでヒットがあることを確認する（前者は各ファイルから 1 行ずつ計 5 行、後者は Cargo.lock から 1 行）。

### Step 8: Update Screenshots (if UI changed)

UI に影響する変更があった場合のみ `npm run generate-screenshots` を実行し、`resources/screenshots/` に差分があれば**独立コミット**として作成する。バージョン更新（Step 6・Step 7）のコミットとは関心が異なるため分離する。

このコマンドは **en / ja の 2 ロケールを 1 回の実行で同時に撮影**し、`resources/screenshots/en/` と `resources/screenshots/ja/` の両方を更新する（ロケール別に個別実行する必要はない）。

#### Step 8.1: 撮影要否の判定

Step 4 の `git diff` 結果と Step 5 で生成した CHANGELOG エントリから、Claude が以下を総合判断する。**ハードコードされたパス条件ではなく、ユーザー視覚に影響するかどうか**で判断する。

| 撮影要 | 撮影不要 |
|:---|:---|
| `src/` 配下に UI コンポーネント・画面・操作の変更がある | テストファイル (`*.test.ts`, `*.spec.ts`) のみの変更 |
| CHANGELOG に `Added` / `Changed` / `Removed` のユーザー視覚に関わる項目がある | 型定義のみの変更（`*.d.ts`、interface 追加のみ等） |
| 新規 UI コンポーネント追加、レイアウト変更、テーマ変更 | バックエンド (`src-tauri/`) のみの変更 |
|   | CSS の純粋なリファクタ（見た目に影響しない） |

判定結果と理由をユーザーに提示し、`AskUserQuestion` で覆せる余地を残す:

- 「撮影要」と判定 → 確認の上で実行
- 「撮影不要」と判定 → 確認の上でスキップ
- 判定に迷う場合 → 必ずユーザーに確認

#### Step 8.2: 撮影実行

```bash
npm run generate-screenshots
```

- **事前予告**: 「Vite サーバー起動 + Playwright WebKit で en/ja 2 ロケール分のシナリオ撮影のため、数十秒〜分単位かかります」とユーザーに伝える
- **失敗時**: エラー出力をそのまま提示し、リリース準備フローを止める。ユーザー判断（修正してリトライ / スキップして次へ）に委ねる

#### Step 8.3: 差分検出と独立コミット

```bash
git status --porcelain resources/screenshots/
```

- **差分あり**:
  ```bash
  git add resources/screenshots/
  git commit -m "$(cat <<'EOF'
[update] スクリーンショット更新 (vX.Y.Z)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
  ```
  `vX.Y.Z` は実際の新バージョン番号に置換する。
- **差分なし**: コミットを作成せず、Summary に「差分なし」と記録する

**重要**: バージョン manifest 更新ファイル（`CHANGELOG.md` 等）はこの時点でステージしない。スクリーンショット差分のみをコミットする。

### Step 9: Summary

更新結果のサマリーを [templates/output.md](templates/output.md) に従って表示する。

## Output Format

[templates/output.md](templates/output.md) のテンプレートに従って出力する。プレースホルダーを実際の値に置換すること。

## Notes

- このスキルは CHANGELOG・バージョン manifest の更新については**コミットを作成せず**、レビュー・コミットはユーザーまたは `/ship` skill に委ねる
- **スクリーンショット更新だけは独立コミットを自動作成する**（CHANGELOG・version 更新との関心分離のため別コミットとする）
- 生成されたエントリは必ずユーザーにレビューを促す（特に英日の対訳が一致しているか）
- プレリリースバージョン（`-alpha`, `-beta`, `-rc.1` 等）もサポートする
- スクリーンショット撮影 (Step 8) は時間がかかる処理のため、UI 変更がない場合はスキップする判断を Claude が下す（最終確認はユーザー）
