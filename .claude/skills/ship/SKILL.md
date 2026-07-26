---
name: ship
description: |
  現在のブランチを PR 作成から merge・ローカルクリーンアップまで一気通貫で出荷するワークフロー。
  「ship」「PR 出して merge まで」「リリースしたい」「マージまで進めて」「PR の続きやって」
  といったユーザー指示で必ず使用する。
  本プロジェクト (slide-presentation-app) の CLAUDE.md と CI 設定
  (.github/workflows/ci.yml) を運用準拠の真実の源として扱う。PR 作成・レビュー対応は
  `pr-workflow` プラグインの `pr-create` / `checklist` / `fixup` skill が利用可能なら委譲し、
  未導入時は `gh` コマンドに直接フォールバックする。CI ポーリング・レビュー対応・
  squash-merge・ローカルブランチ削除までを順序立てて実行する。
  破壊的操作 (merge / branch 削除) の直前で人間に確認を取り、CI 失敗時は状況レポートに
  留めて修正判断を人間に委ねる。
---

# /ship — PR 出荷フルライフサイクル

現在のブランチを「PR 作成 → CI 監視 → レビュー対応 → squash-merge → ローカルクリーンアップ」まで一気通貫で進める。CLAUDE.md（コマンド一覧）と `.github/workflows/ci.yml`（CI で実行されるコマンド）を真実の源として扱う。

## 設計の前提

- **利用可能なら既存skillに委譲する**: PR 作成は `pr-workflow:pr-create`、CI/レビュー状況の確認は `pr-workflow:checklist`、レビュー指摘への対応は `pr-workflow:fixup` を呼ぶ。これらの skill が session の available-skills に存在しない場合は、本 skill 内に記載した `gh` コマンドへ直接フォールバックする（本プロジェクトには `create-pr` / `review-pr` 相当のローカル skill は存在しないため）。本スキルはオーケストレーションに専念し、ロジックを重複させない。
- **破壊的操作は人間の go/no-go を取る**: squash-merge とローカルブランチ削除の直前に確認プロンプトを出す。
- **CI 失敗は自動修正しない**: 失敗ログを構造化して提示し、修正判断は人間に委ねる。「軽い失敗」と「重い失敗」の自動判別は誤検知のコストが高いため敢えて取らない。
- **パッケージマネージャは npm 固定**: 本プロジェクトは npm を使用する（`package-lock.json` / CI の `cache: 'npm'` 設定に準拠）。
- **dev server は起動しない**: `npm run tauri:dev` / `npm run dev` 等の対話的な dev server は本スキルから起動しない（Step 0 の検証コマンドは非対話・一回実行で完結するもののみ）。

## 実行手順

### 0. 事前チェック (必須)

ブランチ未確定状態で誤った PR を作らないよう、以下を順に確認する。失敗した時点で停止しユーザーに状況報告。

```bash
git branch --show-current        # main のときは中断 (出荷対象ではない)
git status --short               # 未コミット変更があれば中断 (commit か stash を促す)
git log --oneline main..HEAD     # main からの差分 1 件以上を確認
```

その後、`.github/workflows/ci.yml` の全ジョブ（quality / test / rust / e2e / build）に対応する検証を実行する。いずれか失敗で中断:

```bash
npm ci                            # lockfile 整合性を CI と同じ条件で担保
npm run format:check
npm run typecheck
npm run test
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
npm run test:e2e
npm run build
```

- `cargo` 系コマンドはローカルに Rust toolchain（`rustfmt` / `clippy` コンポーネント含む）が導入済みであることを前提とする。未導入の場合はエラー内容をそのまま提示し、ユーザーに導入判断を仰ぐ（本スキルからは toolchain を自動インストールしない）
- `npm run test:e2e` は Playwright WebKit を使用する。ブラウザ未インストールでの失敗は `npx playwright install --with-deps webkit` の実行が必要な旨を提示し、実行するかユーザーに確認する
- どれか 1 つでも失敗した場合は中断し、ログをユーザーに提示して修正判断を仰ぐ。本スキルから自動修正は行わない（`npm run format` 等を勝手に実行しない）

### 1. PR 作成

`pr-workflow:pr-create` skill が利用可能なら起動する。利用不可なら以下の方針で `gh pr create` を直接実行する:

- タイトル / 本文は日本語、プレフィックス `[add]` / `[update]` / `[fix]` / `[refactoring]` / `[remove]` / `[docs]` / `[test]` のいずれか（CLAUDE.md「コミットメッセージ」セクションに準拠）
- `.github/PULL_REQUEST_TEMPLATE.md` のセクション（概要 / 変更内容 / 設計判断 / レビューの焦点 / テスト手順 / 残りのタスク / 提出前チェックリスト / 手動検証が必要な項目 / 参考資料）を埋める
- 提出前チェックリストの `typecheck` / `test` / `format:check`（および src-tauri 変更時は `cargo test` / `cargo clippy` / `cargo fmt --check`）は Step 0 で通っているのでチェック可能
- 関連 Issue が判明していれば「参考資料」セクションに `Closes #N` を記載

PR 番号と URL を保持し、以降のステップで使用する。

### 2. CI 監視

`pr-workflow:checklist` skill が利用可能なら起動して CI・レビュー状況をまとめて確認する。利用不可なら `gh pr checks <PR番号>` で状態をポーリングする。本リポジトリの CI は quality / test / rust / e2e / build の 5 ジョブで構成され、`rust` と `e2e` ジョブがそれぞれ最大 20 分のタイムアウトを持つ:

- **ポーリング間隔**: 60 秒
- **最大待機**: 25 分（`rust` / `e2e` ジョブの分長め。これを超える場合は GitHub Actions 側で stuck している可能性が高いため、状況をユーザーに報告し中断）
- **無音で待たせない**: ポーリング中はステータスを 1 回ごとに要約してユーザーに見せる

CI 完了時の分岐:

- **全 check 成功** → 3 へ
- **1 件以上失敗** → `gh run view <run-id> --log-failed` で失敗ログを取得し、構造化してユーザーに提示。**自動修正は行わない**。ユーザー判断後に再 push が必要なら本スキルを再起動する想定で停止

### 3. レビュー対応

レビューコメント (Copilot / 人間) をすべて取得する。`pr-workflow:fixup` skill が利用可能なら起動して指摘の分類・fixup コミット作成を委譲する。利用不可なら以下を直接実行する:

- `gh pr view <PR番号> --json reviews,comments` で取得
- `[must]` 指摘は必ず対応、`[recommend]` は対応または明確な却下理由を返信、`[nits]` は判断に応じて対応
- レビュアー別に分けず一括対応する。複数回ラウンドが発生した場合は 2 → 3 の往復を続ける
- すべてのコメントに「対応した / 対応見送る」の旨を返信する

対応後の push:

- 事前チェック (Step 0) のコマンド群を**再度すべて**実行してから push
- push 後は再度 Step 2 (CI 監視) に戻る

### 4. Merge 直前確認 (人間 go/no-go)

CI 緑 + 全レビューコメント対応済みを確認後、**必ず**ユーザーに確認プロンプトを出す:

> CI 全緑、レビューコメント N 件すべて対応済み。squash-merge してよろしいですか？

ユーザーが yes を返した場合のみ次へ進む。no または無応答の場合は merge せず停止。

### 5. Squash-Merge

```bash
gh pr merge <PR番号> --squash --delete-branch
```

`--delete-branch` でリモートブランチも同時削除。

merge 失敗時 (例: マージコンフリクト、required check 未満足) はエラー内容をユーザーに提示し停止。コンフリクト解消はユーザー判断に委ね、本スキルからは強制 merge しない。

### 6. ローカル cleanup 直前確認 + 実行

merge 成功後、もう一度ユーザーに確認:

> リモート merge 成功。ローカルブランチを削除して main を最新化してよろしいですか？

yes であれば:

```bash
git checkout main
git pull --ff-only origin main
git branch -d <出荷したブランチ名>     # -D ではなく -d で fully merged のみ削除
```

`git branch -d` が失敗する場合は意図しない未マージコミットが残っている可能性があるので、強制削除 (`-D`) せずユーザーに報告。

worktree 運用（`.claude/worktrees/<name>` ディレクトリ）を併用している場合、当該 worktree からの実行は避け、メインの clone へ `cd` してから cleanup を実行する。worktree 自体の削除 (`git worktree remove`) はユーザー判断に委ねる。

### 7. 完了レポート

最後に以下のサマリを 1 メッセージで提示:

- PR 番号 / URL
- merge コミット SHA
- CI 所要時間 (今後の調整用)
- レビュー往復回数 / 対応コメント数
- ローカルクリーンアップ結果

## 失敗ケースの扱い

| ステージ | 失敗 | 振る舞い |
|---|---|---|
| Step 0 | `git status` で未コミット変更 | commit / stash を促し停止。自動で commit や stash しない |
| Step 0 | format / typecheck / test / cargo 系 / e2e / build 失敗 | ログ提示し停止。`npm run format` 等の自動修正はしない |
| Step 1 | `gh pr create` 失敗 | エラーログを提示し停止。認証切れ等は `gh auth status` の確認を提案 |
| Step 2 | CI 失敗 | `gh run view --log-failed` で抜粋を提示し停止 |
| Step 2 | 25 分超で stuck | GitHub Actions 状態をユーザーに報告し停止 |
| Step 3 | レビュー対応で新たな指摘発生 | Step 2 へ戻り再ループ。3 ラウンド超えたらユーザーに介入を促す |
| Step 5 | merge 失敗 (conflict) | エラー内容を提示し、コンフリクト解消はユーザー判断に委ねる。本スキルからは強制 merge しない |
| Step 6 | `git branch -d` が拒否 | 未 merge コミット残存の可能性。-D 強制削除せずユーザー確認 |

## やらないこと (out of scope)

- **CI 失敗の自動修正** (format / typecheck / test / cargo 系 / e2e 含む) — 誤検知コストが高いため
- **強制 push** (`--force` / `--force-with-lease`) — 本スキル経由では実行しない
- **main への直接 push** — そもそも本リポジトリは PR 経由が想定
- **異なる文脈の PR の合流 (rebase squash の大幅履歴改変)** — 必要時はユーザー判断
- **複数 PR の並列ハンドリング** — 1 ブランチ 1 PR の単線で動かす
- **dev server の起動** (`tauri:dev` / `dev` 等) — 同一プロファイル状態を共有するため、本スキルからは起動しない
- **`pnpm` / `yarn` の直接実行** — npm 固定

## 関連スキル / 設定

- `pr-workflow:pr-create` skill — Step 1 で利用可能なら委譲（PR メッセージ生成 + `gh pr create`）
- `pr-workflow:checklist` skill — Step 2 で利用可能なら委譲（CI 状態・レビュー状況・マージ可否の確認）
- `pr-workflow:fixup` skill — Step 3 で利用可能なら委譲（レビュー指摘の分類・fixup コミット作成支援）
- `prepare-release` skill — リリース準備（CHANGELOG / バージョン更新）。本スキルとは別フロー
- CLAUDE.md「コマンド」セクション — Step 0 と Step 3 push 前のチェック内容
- `.github/workflows/ci.yml` — Step 0 / Step 2 の検証内容の整合性確認元
- `.github/PULL_REQUEST_TEMPLATE.md` — Step 1 で埋めるテンプレート
