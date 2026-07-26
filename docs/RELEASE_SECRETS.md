# リリース Secrets

リリースパイプライン（署名付きデスクトップアプリのビルド・配布）で参照する GitHub Actions secrets を一覧化し、用途・取得手順・登録先・未設定時の挙動を整理する。

## 現状

このプロジェクトには署名付きリリース用の GitHub Actions workflow（`release.yml` 等）はまだ存在せず、既存の `.github/workflows/ci.yml` は secrets を一切使用していない。本ドキュメントは、今後リリース自動化 workflow を構築する際に必要となる secrets を事前に洗い出したものであり、workflow 追加時にはこのドキュメントに沿って secrets を登録する。

## 必要な secrets 一覧

| Secret | 用途 | 現状 |
|---|---|---|
| `APPLE_CERTIFICATE` | macOS codesign 用の自己署名 p12 証明書（base64 化した内容） | 未登録・macOS 署名導入時に必須 |
| `APPLE_CERTIFICATE_PASSWORD` | 上記 p12 のエクスポート時パスワード | 未登録・macOS 署名導入時に必須 |
| `APPLE_SIGNING_IDENTITY` | codesign に渡す証明書の識別名（`security find-identity` で確認できる文字列） | 未登録・macOS 署名導入時に必須 |
| `WINDOWS_CERTIFICATE` | Windows Authenticode 署名用 PFX 証明書（base64 化した内容） | 未登録・Windows 署名導入時に必須 |
| `WINDOWS_CERTIFICATE_PASSWORD` | 上記 PFX のパスワード | 未登録・Windows 署名導入時に必須 |
| `GITHUB_TOKEN` | GitHub Releases の作成・アセットアップロード | GitHub Actions が自動的に注入する組み込み secret。手動登録不要 |
| `TAURI_SIGNING_PRIVATE_KEY` | Tauri updater の minisign 署名用秘密鍵 | **現状不要**（下記「不要と判断した secrets」参照） |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 上記秘密鍵のパスワード | **現状不要**（同上） |

## 取得手順

### macOS codesign（自己署名証明書）

1. Keychain Access を開き、メニューから「証明書アシスタント」→「証明書を作成」を選択する
2. 証明書タイプを「コード署名」、ID の種類を「自己署名ルート」にして作成する
3. 作成した証明書を「私の証明書」から右クリックし、パスワードを設定して `.p12` として書き出す
4. `security find-identity -v -p codesigning` で識別名を確認し、`APPLE_SIGNING_IDENTITY` に設定する
5. p12 を base64 化して `APPLE_CERTIFICATE` に設定する

```bash
base64 -i certificate.p12 | pbcopy
```

### Windows Authenticode（PFX 証明書）

1. 正規の Authenticode 証明書を認証局から取得する、またはテスト用に自己署名証明書を作成する（PowerShell）

```powershell
$cert = New-SelfSignedCertificate -Type CodeSigning -Subject "CN=Slide Presentation App" -CertStoreLocation Cert:\CurrentUser\My
Export-PfxCertificate -Cert $cert -FilePath certificate.pfx -Password (ConvertTo-SecureString -String "<password>" -Force -AsPlainText)
```

2. PFX を base64 化して `WINDOWS_CERTIFICATE` に設定し、設定したパスワードを `WINDOWS_CERTIFICATE_PASSWORD` に設定する

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("certificate.pfx")) | Set-Clipboard
```

### Tauri updater 鍵（導入時のみ）

updater を導入する場合は `npm run tauri signer generate` で minisign 鍵ペアを生成する。

```bash
npm run tauri signer generate -- -w ~/.tauri/slide-presentation-app.key
```

生成された秘密鍵ファイルの内容を `TAURI_SIGNING_PRIVATE_KEY` に、対話式で設定したパスワードを `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` に設定する。表示される公開鍵は `tauri.conf.json` の `plugins.updater.pubkey` に設定する。

## 登録先

いずれの secret も GitHub リポジトリの **Settings > Secrets and variables > Actions > Repository secrets** に登録する。

## 未設定時の縮退挙動

- macOS 署名系（`APPLE_CERTIFICATE` 等）が未設定の場合、codesign をスキップし ad-hoc / 未署名ビルドとして生成する
- Windows 署名系（`WINDOWS_CERTIFICATE` 等）が未設定の場合、Authenticode 署名をスキップし未署名ビルドとして生成する
- いずれの場合もビルド自体は失敗させず、署名ステップのみ縮退させる方針とする

## 不要と判断した secrets

以下は参照元（NexusBoard）で使用されている secrets、および現状未構成の機能に関する secrets だが、いずれも本プロジェクトには該当機能が無いため不要と判断する。

- `GH_OAUTH_CLIENT_ID` / `GH_OAUTH_CLIENT_SECRET`: NexusBoard の GitHub OAuth アプリ機能用。本プロジェクトに GitHub OAuth を用いる機能は無いため **不要**
- Vertex AI 認証情報 / GitHub App 認証（`CLAUDE_APP_ID` 等）: リリース準備自動化 workflow（AI による自動化）を採用する場合にのみ検討対象となる。本プロジェクトでは現時点で採用していないため **不要**。将来的にリリース準備自動化 workflow を導入する場合は、本ドキュメントに secrets を追記すること
- `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: `src-tauri/tauri.conf.json` の `plugins` に updater 設定（`updater` / `pubkey` / エンドポイント）が存在せず、Tauri updater は現状未構成のため **不要**。updater 導入時の対応手順は下記「Tauri updater 導入時の対応」を参照

## Tauri updater 導入時の対応

updater 導入を決定した時点で、以下を本ドキュメントに追加すること。

1. 「Tauri updater 鍵」節の鍵生成手順（上記コマンドをそのまま実行）に沿って secrets を登録する
2. `tauri.conf.json` に `plugins.updater`（`pubkey` / `endpoints`）を追加する
3. リリース workflow の署名ステップに `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` を環境変数として渡す
