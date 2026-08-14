//! AI スライド生成の生成器抽象（#14）。
//!
//! 「プロンプト → slides.json 候補 1 件」を単一契約とする生成器（内蔵 Vertex AI 直 / 外部 Claude Code CLI）を、
//! `SlideGenerator` trait ＋ 閉じた `SlideGeneratorKind` enum ＋ `resolve_generator_kind`（純関数）＋
//! `create_generator`（factory）で差し替え可能にする（`llm_backend.rs` パターン）。
//!
//! 検証・自動修正ループ・outcome 判定は JS 側（`aiGenerate.ts`）が単一真実源として駆動するため、
//! Rust は候補 1 件を返す責務に限定する（design §4.1／§9.1）。送出内容（プロンプト構築）は
//! `system_prompt` / `user_prompt` の純関数に集約し、機密最小化（NFR-004）を構造的に担保する。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

mod claude_cli;
mod gcp_auth;
mod vertex;

/// 外部生成（Claude Code CLI）が利用可能かを判定する（事前ゲート用・FR-007）。
pub async fn external_generator_available() -> bool {
  claude_cli::is_available().await
}

/// GCP ADC トークンのキャッシュを破棄する（`gcloud_login` 再実行後に呼ぶ）。
/// 再ログインで ADC が更新されても旧トークンが 55 分キャッシュに残ると復旧できないため、明示的に捨てる。
pub async fn invalidate_token_cache() {
  gcp_auth::invalidate_token_cache().await;
}

/// 生成種別（内蔵 Vertex AI 直 / 外部 Claude Code）。
///
/// TS 側は同一のワイヤー値（`'builtin-vertex'` / `'external-claude-code'`）を `GeneratorKind`
/// として持つ（spec §4.1）。enum 名（PascalCase）を kebab-case 文字列へ serde 変換し、
/// 属性漏れによる実行時の TS 契約ずれ（`tsc` で検出できない）を防ぐ（design §9.1）。
#[derive(serde::Serialize, serde::Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum SlideGeneratorKind {
  BuiltinVertex,
  ExternalClaudeCode,
}

/// 入力プロンプトの意味論（#302）。`req.prompt` が「新規スライドの内容そのもの」なのか
/// 「既存スライドへの変更依頼（差分指示）」なのかをAIが取り違えやすいため、UI で選択させ
/// `user_prompt()` が明示ラベルを付与する。TS 側は同一のワイヤー値（kebab-case）を
/// `PromptIntent` として持つ。
#[derive(serde::Serialize, serde::Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum PromptIntent {
  NewContent,
  ChangeInstruction,
}

/// 生成リクエスト（`generate_slides` コマンドの invoke 引数）。
///
/// struct は camelCase で serde 変換し TS の `GenerateRequest` とワイヤーフォーマットを一致させる。
/// `Option` フィールドは JS 側で省略されると serde が `None` に落とす（初回生成・新規生成のケース）。
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GenerateRequest {
  /// 生成プロンプト
  pub prompt: String,
  /// 生成種別（内蔵/外部）
  pub kind: SlideGeneratorKind,
  /// 編集起点で生成する場合の現行 slides.json（新規生成時は `None`。NFR-004 の送出対象に限定）
  pub base_slides: Option<String>,
  /// 自動修正の再試行時に JS オーケストレータが積む検証エラー要約（初回は `None`。FR-005）
  pub repair_feedback: Option<String>,
  /// 適用中テーマ・登録済みコンポーネント/アイコンから JS 側が組み立てた意匠制約テキスト（#211）。
  /// 色トークン名・コンポーネント/アイコン名はランタイム（ComponentRegistry・THEME_COLOR_TOKENS）に
  /// しか存在しないため Rust 側では持たず、JS から都度渡してもらう（`aiGenerate.ts` の
  /// `buildThemeConstraintsPrompt` が単一ソース）。レイアウト種別・情報密度上限は
  /// `SLIDE_CONTENT_SCHEMA_JSON` 側にすでに同梱されているためここには含めない。
  pub theme_constraints: Option<String>,
  /// `prompt` の意味論（新規内容 / 変更指示）。UI で未選択・旧クライアント由来は `None`（#302）。
  pub prompt_intent: Option<PromptIntent>,
}

/// 生成の中断トークン（FR-010）。`cancel_generation` コマンドが立て、生成器は境界で参照する。
/// in-flight の HTTP abort / サブプロセス kill は各生成器・Phase 3 のコマンドが担う。
#[derive(Clone, Default)]
pub struct CancelToken(Arc<AtomicBool>);

impl CancelToken {
  pub fn new() -> Self {
    Self::default()
  }

  pub fn cancel(&self) {
    self.0.store(true, Ordering::SeqCst);
  }

  pub fn is_cancelled(&self) -> bool {
    self.0.load(Ordering::SeqCst)
  }

  /// キャンセルされるまで待つ（協調中断用・100ms 間隔でフラグを監視）。
  /// in-flight 処理を `tokio::select!` でこの future と競わせ、キャンセル時に処理側 future を drop させて
  /// 実際に中断する（reqwest はドロップで abort、サブプロセスは `kill_on_drop` で kill・design §6/FR-010）。
  pub async fn cancelled(&self) {
    while !self.is_cancelled() {
      tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
  }
}

/// 生成エラー（UI へは `to_string()` で返す。キー本体・内部秘密は含めない・NFR-004）。
#[derive(Debug)]
pub enum GenerateError {
  /// 利用者による中断（FR-010）。
  Cancelled,
  /// 応答タイムアウト（NFR-005）。
  Timeout,
  /// 内蔵生成の設定未完了（Vertex の project/region/model が未設定）。
  NotConfigured,
  /// ネットワーク/通信エラー。
  Network(String),
  /// API がエラーステータスを返した（ボディは切詰め済み・FR-008）。
  Api { status: u16, message: String },
  /// 外部 CLI の失敗（未検出・異常終了含む）。
  Cli(String),
  /// レスポンスが不正（result 欠落・パース不能）。
  InvalidResponse(String),
  /// GCP 認証/トークン取得の失敗（ADC 未ログイン・トークン交換失敗等。設定未完了は NotConfigured で別扱い）。
  Credential(String),
}

impl std::fmt::Display for GenerateError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      GenerateError::Cancelled => write!(f, "生成を中断しました"),
      GenerateError::Timeout => write!(f, "生成がタイムアウトしました"),
      GenerateError::NotConfigured => {
        write!(f, "Vertex AI の設定（project/region/model）が未完了です")
      }
      GenerateError::Network(msg) => write!(f, "通信エラー: {msg}"),
      GenerateError::Api { status, message } => {
        write!(f, "API エラー ({status}): {message}")
      }
      GenerateError::Cli(msg) => write!(f, "外部生成エラー: {msg}"),
      GenerateError::InvalidResponse(msg) => write!(f, "生成結果が不正です: {msg}"),
      GenerateError::Credential(msg) => write!(f, "資格情報エラー: {msg}"),
    }
  }
}

impl std::error::Error for GenerateError {}

/// 生成器の単一契約: 「プロンプト → slides.json 候補 1 件」（生成器単位で抽象化・design §9.1）。
#[async_trait::async_trait]
pub trait SlideGenerator: Send + Sync {
  async fn generate(
    &self,
    req: &GenerateRequest,
    cancel: &CancelToken,
  ) -> Result<String, GenerateError>;
}

/// 生成種別を解決する純関数（dev override（env・untyped）→ UI/設定の型付き選択 fallback）。副作用なし。
/// UI/設定の選択は既に型付き `SlideGeneratorKind` として届くため文字列化して再パースせず、
/// 生文字列パースは唯一 untyped な env override に限定する（型安全を手放さない・design §9.1）。
pub fn resolve_generator_kind(
  env_override: Option<&str>,
  fallback: SlideGeneratorKind,
) -> SlideGeneratorKind {
  env_override
    .and_then(parse_generator_kind)
    .unwrap_or(fallback)
}

/// 環境変数（dev override）の文字列を生成種別へパースする（TS ワイヤー値と別名の両方を受ける）。不明・空は `None`。
fn parse_generator_kind(value: &str) -> Option<SlideGeneratorKind> {
  match value.trim() {
    "" => None,
    "external-claude-code" | "external" | "claude-code" | "claude_cli" => {
      Some(SlideGeneratorKind::ExternalClaudeCode)
    }
    "builtin-vertex" | "builtin" | "vertex" => Some(SlideGeneratorKind::BuiltinVertex),
    _ => None,
  }
}

/// 解決済み種別から生成器を生成する factory（利用側は内蔵/外部を意識しない）。
/// 内蔵は `VertexConfig`（project/region/model）を受け取り、未設定なら `NotConfigured` を返す。
/// 外部は Vertex 設定不要（CLI 実行）。GCP トークンは各生成器が実行時に ADC から取得する（キーは持ち回らない）。
/// `claude_cli_env_vars` は外部 CLI のサブプロセスへ明示的に注入する環境変数（`CLAUDE_CONFIG_DIR` 等・#152）。
pub fn create_generator(
  kind: SlideGeneratorKind,
  vertex_config: Option<crate::vertex_config::VertexConfig>,
  claude_cli_env_vars: Vec<(String, String)>,
) -> Result<Box<dyn SlideGenerator>, GenerateError> {
  match kind {
    SlideGeneratorKind::BuiltinVertex => {
      let config = vertex_config
        .filter(|c| c.is_complete())
        .ok_or(GenerateError::NotConfigured)?;
      Ok(Box::new(vertex::VertexGenerator::new(
        config.project_id,
        config.region,
        config.model,
      )))
    }
    // 外部 CLI は Vertex 設定不要。model 未指定（空）で CLI 既定に委ねる
    SlideGeneratorKind::ExternalClaudeCode => Ok(Box::new(claude_cli::ClaudeCodeGenerator::new(
      String::new(),
      claude_cli_env_vars,
    ))),
  }
}

// ---- 送出内容（プロンプト）構築の単一チョークポイント（NFR-004 機密最小化） ----

/// レイアウト別 content 構造の単一ソース（`schema/slide-content-schema.json`）。
/// `src/data/slideContentSchema.ts`（生成専用の厳格チェック）と同一ファイルを参照し、
/// プロンプトと検証がドリフトしないようにする。コンパイル時埋め込みのため実行時ファイル I/O はない。
const SLIDE_CONTENT_SCHEMA_JSON: &str = include_str!("../../../schema/slide-content-schema.json");

/// 内蔵/外部 共通のシステムプロンプト（出力スキーマの指示）。送出スキーマ/テンプレートの単一真実源。
/// `theme_constraints` は JS 側（`buildThemeConstraintsPrompt`）が組み立てた、実行時にしか分からない
/// 意匠制約（色トークン名・登録済みコンポーネント/アイコン名・現在の書体）。空/`None` なら追記しない（#211）。
pub(crate) fn system_prompt(theme_constraints: Option<&str>) -> String {
  // getValidationErrors（loader.ts）の検証規則に一致する最小スキーマ＋
  // レイアウト別 content 構造の単一ソース（SLIDE_CONTENT_SCHEMA_JSON。情報密度の推奨上限も含む）を提示する
  let mut prompt = format!(
    "あなたはスライドプレゼンテーションの JSON（slides.json）を生成するアシスタントです。\n\
     出力は必ず単一の JSON オブジェクトのみとし、説明文・前置き・コードフェンス（```）を含めないでください。\n\
     構造:\n\
     {{\n\
       \"meta\": {{ \"title\": string(空でない) }},\n\
       \"slides\": [ {{ \"id\": string(空でない), \"layout\": string, \"content\": object }}, ... ](1件以上)\n\
     }}\n\
     layout は \"center\" | \"content\" | \"two-column\" | \"bleed\" | \"custom\" のいずれかを推奨します。\n\
     以下は各 layout で有効な content フィールドの定義です。この定義に厳密に従い、未知のフィールドや型不一致を避けてください:\n\
     {SLIDE_CONTENT_SCHEMA_JSON}"
  );

  if let Some(trimmed) = theme_constraints.map(str::trim).filter(|s| !s.is_empty()) {
    prompt.push_str(&format!(
      "\n\n以下は現在のテーマ・登録状況に基づく追加の意匠制約です。値は必ずこの範囲に収めてください:\n{trimmed}"
    ));
  }

  prompt
}

/// 生成リクエストからユーザープロンプトを構築する純関数（機密最小化の単一チョークポイント・NFR-004）。
///
/// 送出はプロンプト・（編集起点時の）`base_slides`・自動修正の `repair_feedback` のみ。
/// キー本体・任意ローカルファイル・他パッケージの内容は **引数に存在しない**ため構造的に混入し得ない。
///
/// `prompt_intent` が指定されていれば、`req.prompt` が「新規内容」なのか「変更指示」なのかを
/// 明示するラベルを先頭に付与する（#302）。未指定（`None`）はラベルなし（後方互換）。
pub(crate) fn user_prompt(req: &GenerateRequest) -> String {
  let mut parts = Vec::new();
  if let Some(intent) = req.prompt_intent {
    let label = match intent {
      PromptIntent::NewContent => "以下はスライドの内容そのものです（変更依頼ではありません）。",
      PromptIntent::ChangeInstruction => {
        "以下は既存スライドへの変更指示です（スライドの内容そのものではありません）。"
      }
    };
    parts.push(label.to_string());
  }
  parts.push(format!(
    "次の依頼に沿ってスライドを生成してください:\n{}",
    req.prompt
  ));
  if let Some(base) = &req.base_slides {
    parts.push(format!(
      "\n現在のスライド（これを土台に更新してください）:\n{base}"
    ));
  }
  if let Some(feedback) = &req.repair_feedback {
    parts.push(format!(
      "\n前回の出力には次の検証エラーがありました。修正してください:\n{feedback}"
    ));
  }
  parts.push("\n出力は slides.json の JSON オブジェクトのみを返してください。".to_string());
  parts.join("\n")
}

/// テキストを char 境界で切詰める（マルチバイト安全・UI 露出制限）。内蔵/外部のエラー整形で共有する。
pub(crate) fn truncate_preview(text: &str, max_chars: usize) -> String {
  let total = text.chars().count();
  if total <= max_chars {
    return text.to_string();
  }
  let truncated: String = text.chars().take(max_chars).collect();
  format!("{truncated}...（省略 {} 文字）", total - max_chars)
}

/// モデル出力から先頭/末尾のコードフェンス（```json … ```）を除去し、素の JSON 文字列へ寄せる純関数。
/// 内蔵（テキストブロック）/外部（result 文字列）の双方で共通に使う。
pub(crate) fn strip_code_fences(text: &str) -> String {
  let trimmed = text.trim();
  if !trimmed.starts_with("```") {
    return trimmed.to_string();
  }
  // 先頭の ```lang 行を落とす
  let after_open = match trimmed.find('\n') {
    Some(idx) => &trimmed[idx + 1..],
    None => return trimmed.trim_matches('`').trim().to_string(),
  };
  // 末尾の ``` を落とす
  let body = match after_open.rfind("```") {
    Some(idx) => &after_open[..idx],
    None => after_open,
  };
  body.trim().to_string()
}

#[cfg(test)]
mod tests {
  use super::*;

  fn sample_request(kind: SlideGeneratorKind) -> GenerateRequest {
    GenerateRequest {
      prompt: "AI の歴史".to_string(),
      kind,
      base_slides: None,
      repair_feedback: None,
      theme_constraints: None,
      prompt_intent: None,
    }
  }

  #[test]
  fn generator_kind_serializes_to_kebab_case() {
    // TS 契約（'builtin-vertex' / 'external-claude-code'）と一致するワイヤー値を検証（design §9.1）
    assert_eq!(
      serde_json::to_string(&SlideGeneratorKind::BuiltinVertex).unwrap(),
      "\"builtin-vertex\""
    );
    assert_eq!(
      serde_json::to_string(&SlideGeneratorKind::ExternalClaudeCode).unwrap(),
      "\"external-claude-code\""
    );
  }

  #[test]
  fn generate_request_uses_camel_case_and_defaults_optionals() {
    // JS が baseSlides / repairFeedback を省略しても None にデシリアライズされる（初回生成）
    let req: GenerateRequest =
      serde_json::from_str(r#"{"prompt":"p","kind":"builtin-vertex"}"#).unwrap();
    assert_eq!(req.prompt, "p");
    assert_eq!(req.kind, SlideGeneratorKind::BuiltinVertex);
    assert!(req.base_slides.is_none());
    assert!(req.repair_feedback.is_none());
    assert!(req.theme_constraints.is_none());
    assert!(req.prompt_intent.is_none());

    // camelCase のキーで往復する（themeConstraints も含む・#211／promptIntent も含む・#302）
    let req2: GenerateRequest = serde_json::from_str(
      r#"{"prompt":"p","kind":"external-claude-code","baseSlides":"{}","repairFeedback":"err","themeConstraints":"色トークン名: primary","promptIntent":"change-instruction"}"#,
    )
    .unwrap();
    assert_eq!(req2.base_slides.as_deref(), Some("{}"));
    assert_eq!(req2.repair_feedback.as_deref(), Some("err"));
    assert_eq!(
      req2.theme_constraints.as_deref(),
      Some("色トークン名: primary")
    );
    assert_eq!(req2.prompt_intent, Some(PromptIntent::ChangeInstruction));
  }

  #[test]
  fn prompt_intent_serializes_to_kebab_case() {
    // TS 契約（'new-content' / 'change-instruction'）と一致するワイヤー値を検証（#302）
    assert_eq!(
      serde_json::to_string(&PromptIntent::NewContent).unwrap(),
      "\"new-content\""
    );
    assert_eq!(
      serde_json::to_string(&PromptIntent::ChangeInstruction).unwrap(),
      "\"change-instruction\""
    );
  }

  #[test]
  fn resolve_generator_kind_uses_env_override_else_fallback() {
    // env override が解決できればそれを最優先
    assert_eq!(
      resolve_generator_kind(
        Some("external-claude-code"),
        SlideGeneratorKind::BuiltinVertex
      ),
      SlideGeneratorKind::ExternalClaudeCode
    );
    assert_eq!(
      resolve_generator_kind(Some("builtin"), SlideGeneratorKind::ExternalClaudeCode),
      SlideGeneratorKind::BuiltinVertex
    );
    // env override が不明値・空・None なら fallback（＝UI/設定の型付き選択）を返す
    assert_eq!(
      resolve_generator_kind(Some("???"), SlideGeneratorKind::ExternalClaudeCode),
      SlideGeneratorKind::ExternalClaudeCode
    );
    assert_eq!(
      resolve_generator_kind(Some("  "), SlideGeneratorKind::BuiltinVertex),
      SlideGeneratorKind::BuiltinVertex
    );
    assert_eq!(
      resolve_generator_kind(None, SlideGeneratorKind::ExternalClaudeCode),
      SlideGeneratorKind::ExternalClaudeCode
    );
  }

  #[test]
  fn system_prompt_includes_slide_content_schema() {
    // schema/slide-content-schema.json（単一ソース）が system_prompt に同梱されていることを検証する。
    // ドリフト検知: このファイルを更新した際、schema 側の更新を忘れると失敗する
    let prompt = system_prompt(None);
    assert!(prompt.contains("two-column"));
    assert!(prompt.contains("FactCheck"));
    assert!(prompt.contains("columnContentFields"));
  }

  #[test]
  fn system_prompt_appends_theme_constraints_when_present() {
    // JS 側（buildThemeConstraintsPrompt）が組み立てた意匠制約を追記する（#211）
    let prompt = system_prompt(Some("色トークン名: primary, accent"));
    assert!(prompt.contains("色トークン名: primary, accent"));
  }

  #[test]
  fn system_prompt_omits_constraints_block_when_none_or_blank() {
    // None・空文字・空白のみはいずれも追記しない（余計な指示でプロンプトを汚さない）
    let without = system_prompt(None);
    assert!(!without.contains("追加の意匠制約"));
    let blank = system_prompt(Some("   "));
    assert!(!blank.contains("追加の意匠制約"));
  }

  #[test]
  fn user_prompt_includes_only_allowed_fields() {
    // 機密最小化（NFR-004）: プロンプトは含み、base_slides/repair_feedback は指定時のみ含む
    let mut req = sample_request(SlideGeneratorKind::BuiltinVertex);
    let p = user_prompt(&req);
    assert!(p.contains("AI の歴史"));
    assert!(!p.contains("現在のスライド"));
    assert!(!p.contains("検証エラー"));

    req.base_slides = Some("{\"meta\":{\"title\":\"t\"}}".to_string());
    req.repair_feedback = Some("meta.title が空です".to_string());
    let p = user_prompt(&req);
    assert!(p.contains("AI の歴史"));
    assert!(p.contains("現在のスライド"));
    assert!(p.contains("{\"meta\":{\"title\":\"t\"}}"));
    assert!(p.contains("meta.title が空です"));
  }

  #[test]
  fn user_prompt_labels_new_content_intent() {
    // モード「新しいスライド内容を記述する」選択時は内容そのものである旨を明示する（#302）
    let mut req = sample_request(SlideGeneratorKind::BuiltinVertex);
    req.prompt_intent = Some(PromptIntent::NewContent);
    let p = user_prompt(&req);
    assert!(p.contains("以下はスライドの内容そのものです"));
    assert!(!p.contains("既存スライドへの変更指示です"));
  }

  #[test]
  fn user_prompt_labels_change_instruction_intent() {
    // モード「既存スライドへの変更を指示する」選択時は変更依頼である旨を明示する（#302）
    let mut req = sample_request(SlideGeneratorKind::BuiltinVertex);
    req.prompt_intent = Some(PromptIntent::ChangeInstruction);
    let p = user_prompt(&req);
    assert!(p.contains("以下は既存スライドへの変更指示です"));
    assert!(!p.contains("スライドの内容そのものです"));
  }

  #[test]
  fn user_prompt_omits_intent_label_when_none() {
    // 未指定（旧クライアント・#302 導入前の呼び出し）はラベルを付与しない（後方互換）
    let req = sample_request(SlideGeneratorKind::BuiltinVertex);
    assert!(req.prompt_intent.is_none());
    let p = user_prompt(&req);
    assert!(!p.contains("スライドの内容そのものです"));
    assert!(!p.contains("既存スライドへの変更指示です"));
  }

  #[test]
  fn truncate_preview_is_multibyte_safe() {
    // 短いものはそのまま
    assert_eq!(truncate_preview("エラー", 10), "エラー");
    // 長いものは char 境界で切る（マルチバイトを壊さない）
    let body = "あ".repeat(10);
    let truncated = truncate_preview(&body, 3);
    assert!(truncated.starts_with("あああ"));
    assert!(truncated.contains("省略 7 文字"));
  }

  #[test]
  fn strip_code_fences_unwraps_json_fences() {
    assert_eq!(strip_code_fences("```json\n{\"a\":1}\n```"), "{\"a\":1}");
    assert_eq!(strip_code_fences("```\n{\"a\":1}\n```"), "{\"a\":1}");
    // フェンスなしはそのまま（trim のみ）
    assert_eq!(strip_code_fences("  {\"a\":1}  "), "{\"a\":1}");
  }

  // trait のディスパッチと中断を検証するテスト用生成器
  struct MockGenerator {
    response: String,
    fail: bool,
  }

  #[async_trait::async_trait]
  impl SlideGenerator for MockGenerator {
    async fn generate(
      &self,
      _req: &GenerateRequest,
      cancel: &CancelToken,
    ) -> Result<String, GenerateError> {
      if cancel.is_cancelled() {
        return Err(GenerateError::Cancelled);
      }
      if self.fail {
        return Err(GenerateError::Network("mock failure".to_string()));
      }
      Ok(self.response.clone())
    }
  }

  #[tokio::test]
  async fn mock_generator_dispatches_and_respects_cancel() {
    let req = sample_request(SlideGeneratorKind::BuiltinVertex);
    let gen: Box<dyn SlideGenerator> = Box::new(MockGenerator {
      response: "{\"meta\":{\"title\":\"t\"},\"slides\":[]}".to_string(),
      fail: false,
    });

    // 通常は候補文字列を返す
    let cancel = CancelToken::new();
    let out = gen.generate(&req, &cancel).await.unwrap();
    assert!(out.contains("\"title\":\"t\""));

    // 中断済みトークンでは Cancelled
    cancel.cancel();
    assert!(cancel.is_cancelled());
    assert!(matches!(
      gen.generate(&req, &cancel).await,
      Err(GenerateError::Cancelled)
    ));
  }

  #[test]
  fn generate_error_display_hides_internals() {
    assert_eq!(
      GenerateError::Api {
        status: 401,
        message: "unauthorized".to_string(),
      }
      .to_string(),
      "API エラー (401): unauthorized"
    );
    assert_eq!(GenerateError::Cancelled.to_string(), "生成を中断しました");
  }

  #[tokio::test]
  async fn cancel_token_cancelled_resolves_when_cancelled() {
    // 既にキャンセル済みなら cancelled() は即座に返る（ポーリング前にフラグ確認）
    let token = CancelToken::new();
    token.cancel();
    token.cancelled().await;
    assert!(token.is_cancelled());

    // 実行中に別ハンドルから cancel() すると cancelled() が解決し、select! で in-flight を中断できる
    let token = CancelToken::new();
    let watcher = token.clone();
    let handle = tokio::spawn(async move { watcher.cancelled().await });
    token.cancel();
    handle.await.unwrap();
    assert!(token.is_cancelled());
  }
}
