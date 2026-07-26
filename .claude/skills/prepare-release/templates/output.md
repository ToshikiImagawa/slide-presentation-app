## リリース準備完了

**Version**: OLD_VERSION → NEW_VERSION
**Date**: YYYY-MM-DD

### CHANGELOG 更新内容

| Category | Entries | Source                       |
|:---------|:--------|:-----------------------------|
| Added    | N       | existing / generated / mixed |
| Changed  | N       | ...                          |
| Fixed    | N       | ...                          |

英日（CHANGELOG.md / CHANGELOG.ja.md）は同じ内容の対訳として更新済み。

### 更新ファイル

- [ ] `CHANGELOG.md`
- [ ] `CHANGELOG.ja.md`
- [ ] `package.json`
- [ ] `src-tauri/Cargo.toml`
- [ ] `src-tauri/Cargo.lock`
- [ ] `src-tauri/tauri.conf.json`
- [ ] `README.md`（バージョンバッジ）
- [ ] `README.ja.md`（バージョンバッジ）

### Screenshots

- 判定: {実行 | スキップ}
- 判定理由: {Claude による文脈判断の要約。例: "src/ 配下に UI 変更あり / バックエンドのみの変更のため不要"}
- 撮影実行: {成功 | 失敗 | スキップ}
- ロケール: en / ja（`npm run generate-screenshots` で同時撮影）
- 差分コミット: {コミット ID (例: `a1b2c3d`) | 差分なし | スキップ}

### Next Steps

このスキルは CHANGELOG・マニフェストの更新までを行い、スクリーンショット差分があった場合のみ独立コミットを作成済み。以降は手動で（または別 skill 経由で）実施:

1. 変更内容をレビュー（特に CHANGELOG エントリと英日の対訳一致）
2. CHANGELOG・マニフェストのコミット & タグ付け & push（PR を経由する場合は `/ship` を利用）:
   ```bash
   git add CHANGELOG.md CHANGELOG.ja.md package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json README.md README.ja.md
   git commit -m "[docs] v{VERSION} リリース準備"
   git tag v{VERSION}
   git push origin <branch> --tags
   ```
3. GitHub Releases でドラフトを確認して公開
