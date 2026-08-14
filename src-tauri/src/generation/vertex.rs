//! 内蔵生成（Vertex AI・GCP ADC 経由）— FR-003。
//!
//! GCP アクセストークン（`gcp_auth` の ADC 経由）を `Authorization: Bearer` に載せ、Vertex の rawPredict を叩く。
//! project_id / region / model は `VertexConfig` から与えられ、**model は URL に埋め込む**（body には入れない）。
//! バージョンは body の `anthropic_version: "vertex-2023-10-16"`。`global` リージョンはホスト名を分岐する。
//! 送出 body はプロンプト構築の純関数（`super::system_prompt` / `super::user_prompt`）に集約し機密最小化（NFR-004）。
//! `with_retry`（429/529 指数バックオフ）・エラーボディ切詰め・応答タイムアウト 120 秒でコストを境界付ける（NFR-005）。

use super::{
  gcp_auth, CancelToken, GenerateCandidate, GenerateError, GenerateRequest, SlideGenerator,
};
use serde_json::Value;
use std::time::Duration;

/// Vertex の Anthropic バージョン（body フィールド。HTTP ヘッダの anthropic-version は使わない）。
const VERTEX_ANTHROPIC_VERSION: &str = "vertex-2023-10-16";
/// 生成の最大トークン（slides.json 全体置換に十分な余裕）。
const DEFAULT_MAX_TOKENS: u32 = 8192;
/// リトライ回数（初回＋3 リトライ）。
const MAX_RETRIES: usize = 3;
/// 初回バックオフ（ms）。
const INITIAL_BACKOFF_MS: u64 = 1_000;
/// バックオフ上限（ms）。無制限リトライを避ける（NFR-005）。
const MAX_BACKOFF_MS: u64 = 30_000;
/// 応答タイムアウト（NFR-005・design §9.1 で暫定確定＝120 秒）。
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);
/// エラーボディの UI 露出上限（文字数）。内部情報を漏らさない（FR-008）。
const ERROR_PREVIEW_CHARS: usize = 200;

/// 共有 reqwest クライアント（試行/生成間でコネクションプール・TLS を再利用。トークン交換にも使う）。
static HTTP_CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();

fn shared_client() -> reqwest::Client {
  HTTP_CLIENT
    .get_or_init(|| {
      reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
    })
    .clone()
}

/// 内蔵 Vertex 生成器。project_id / region / model は `VertexConfig` 由来。
pub struct VertexGenerator {
  project_id: String,
  region: String,
  model: String,
  client: reqwest::Client,
}

impl VertexGenerator {
  pub fn new(project_id: String, region: String, model: String) -> Self {
    Self {
      project_id,
      region,
      model,
      client: shared_client(),
    }
  }

  /// 1 回の rawPredict を実行し、成功なら候補（フェンス除去済み JSON 文字列＋途中切断の判定）を返す。
  async fn send_once(&self, token: &str, body: &Value) -> Result<GenerateCandidate, GenerateError> {
    let url = build_url(&self.region, &self.project_id, &self.model);
    let response = self
      .client
      .post(&url)
      .header("authorization", format!("Bearer {token}"))
      .header("content-type", "application/json")
      .json(body)
      .send()
      .await
      .map_err(|e| {
        if e.is_timeout() {
          GenerateError::Timeout
        } else {
          GenerateError::Network(e.to_string())
        }
      })?;

    let status = response.status();
    if !status.is_success() {
      let text = response
        .text()
        .await
        .unwrap_or_else(|_| "(レスポンス読み取り失敗)".to_string());
      // 401 UNAUTHENTICATED はトークン自体が無効/失効。キャッシュを捨てて次回 ADC から取り直させ、
      // UI が案内する再ログインがセッション内で効くようにする（無効化経路がないと 55 分復旧不能）。
      if status.as_u16() == 401 {
        gcp_auth::invalidate_token_cache().await;
        return Err(GenerateError::Credential(
          "GCP 認証が無効です。`gcloud auth application-default login` を再実行してください"
            .to_string(),
        ));
      }
      // 403 PERMISSION_DENIED は再ログインでは直らない（Vertex AI API 未有効化・IAM 権限不足・
      // Model Garden のモデル未有効化など）。原因はレスポンスボディに含まれるため、401 と同一視して
      // 「再ログインせよ」と誤誘導せず、切詰めた診断情報つきの Api エラーとして返す。
      return Err(GenerateError::Api {
        status: status.as_u16(),
        message: super::truncate_preview(&text, ERROR_PREVIEW_CHARS),
      });
    }

    let value: Value = response
      .json()
      .await
      .map_err(|e| GenerateError::InvalidResponse(e.to_string()))?;
    let (text, truncated) = extract_text_from_response(&value)?;
    Ok(GenerateCandidate {
      text: super::strip_code_fences(&text),
      truncated,
    })
  }
}

#[async_trait::async_trait]
impl SlideGenerator for VertexGenerator {
  async fn generate(
    &self,
    req: &GenerateRequest,
    cancel: &CancelToken,
  ) -> Result<GenerateCandidate, GenerateError> {
    if cancel.is_cancelled() {
      return Err(GenerateError::Cancelled);
    }
    // ゲート通過後に初めて ADC からトークンを取得する（NFR-003）。未ログインは再ログイン文言で返る
    let token = gcp_auth::get_access_token(&self.client)
      .await
      .map_err(GenerateError::Credential)?;
    let body = build_request_body(req, DEFAULT_MAX_TOKENS);

    // in-flight の HTTP をキャンセルと競わせる。キャンセル時は送信 future が drop され reqwest が abort する（FR-010）
    tokio::select! {
      biased;
      _ = cancel.cancelled() => Err(GenerateError::Cancelled),
      result = async {
        let mut attempt = 0;
        loop {
          match self.send_once(&token, &body).await {
            Ok(text) => return Ok(text),
            Err(err) => {
              if attempt < MAX_RETRIES && should_retry(&err) {
                tokio::time::sleep(Duration::from_millis(backoff_ms(attempt))).await;
                attempt += 1;
                continue;
              }
              return Err(err);
            }
          }
        }
      } => result,
    }
  }
}

/// Vertex rawPredict の URL を組み立てる純関数（`global` はホスト名を分岐・model は URL に埋め込む）。
pub(crate) fn build_url(region: &str, project_id: &str, model: &str) -> String {
  let host = if region == "global" {
    "aiplatform.googleapis.com".to_string()
  } else {
    format!("{region}-aiplatform.googleapis.com")
  };
  format!("https://{host}/v1/projects/{project_id}/locations/{region}/publishers/anthropic/models/{model}:rawPredict")
}

/// 送出 body を構築する純関数（機密最小化の単一チョークポイント・NFR-004）。
/// Vertex では `anthropic_version` を body に入れ、`model` は URL 側なので body には入れない。
/// `tools` は使わないため省略する（空 tools＋tool_choice は 400 になるため）。
pub(crate) fn build_request_body(req: &GenerateRequest, max_tokens: u32) -> Value {
  serde_json::json!({
      "anthropic_version": VERTEX_ANTHROPIC_VERSION,
      "max_tokens": max_tokens,
      "system": super::system_prompt(req.theme_constraints.as_deref()),
      "messages": [ { "role": "user", "content": super::user_prompt(req) } ],
  })
}

/// レスポンスの `content[].text`（type=="text"）を連結して取り出し、`stop_reason` から途中切断
/// （`"max_tokens"` でトークン上限に達した）かどうかを判定する。空・欠落は不正応答。
/// Vertex の Anthropic モデルは Messages API と同一のレスポンス形状を返す。
pub(crate) fn extract_text_from_response(value: &Value) -> Result<(String, bool), GenerateError> {
  let content = value
    .get("content")
    .and_then(|c| c.as_array())
    .ok_or_else(|| GenerateError::InvalidResponse("content 配列がありません".to_string()))?;
  let mut text = String::new();
  for block in content {
    if block.get("type").and_then(|t| t.as_str()) == Some("text") {
      if let Some(t) = block.get("text").and_then(|t| t.as_str()) {
        text.push_str(t);
      }
    }
  }
  if text.trim().is_empty() {
    return Err(GenerateError::InvalidResponse(
      "text ブロックが空です".to_string(),
    ));
  }
  let truncated = value.get("stop_reason").and_then(|s| s.as_str()) == Some("max_tokens");
  Ok((text, truncated))
}

/// リトライ対象か（429 レート制限 / 529 過負荷のみ・NFR-005）。
fn is_retryable_status(status: u16) -> bool {
  status == 429 || status == 529
}

/// エラーがリトライ対象か（API の 429/529 のみ。通信/タイムアウト/認証等はリトライしない）。
fn should_retry(err: &GenerateError) -> bool {
  matches!(err, GenerateError::Api { status, .. } if is_retryable_status(*status))
}

/// 指数バックオフ（1s, 2s, 4s… 上限 30s）。
fn backoff_ms(attempt: usize) -> u64 {
  (INITIAL_BACKOFF_MS * 2u64.pow(attempt as u32)).min(MAX_BACKOFF_MS)
}

#[cfg(test)]
mod tests {
  use super::super::{GenerateError, GenerateRequest, SlideGeneratorKind};
  use super::*;

  fn req_with(prompt: &str, base: Option<&str>, feedback: Option<&str>) -> GenerateRequest {
    GenerateRequest {
      prompt: prompt.to_string(),
      kind: SlideGeneratorKind::BuiltinVertex,
      base_slides: base.map(|s| s.to_string()),
      repair_feedback: feedback.map(|s| s.to_string()),
      theme_constraints: None,
      prompt_intent: None,
    }
  }

  #[test]
  fn build_url_branches_on_global_region() {
    // 非 global は "{region}-aiplatform"、model は URL に、末尾は :rawPredict
    assert_eq!(
      build_url("us-east5", "proj", "claude-sonnet-4-5@20250929"),
      "https://us-east5-aiplatform.googleapis.com/v1/projects/proj/locations/us-east5/publishers/anthropic/models/claude-sonnet-4-5@20250929:rawPredict"
    );
    // global は素の aiplatform ホスト
    assert_eq!(
      build_url("global", "proj", "claude-opus-4-1@20250805"),
      "https://aiplatform.googleapis.com/v1/projects/proj/locations/global/publishers/anthropic/models/claude-opus-4-1@20250805:rawPredict"
    );
  }

  #[test]
  fn build_request_body_has_vertex_shape_and_no_model_field() {
    let req = req_with("量子コンピュータ入門", None, None);
    let body = build_request_body(&req, 8192);

    // Vertex は anthropic_version を body に持ち、model は body に入れない（URL 側）
    assert_eq!(body["anthropic_version"], VERTEX_ANTHROPIC_VERSION);
    assert!(body.get("model").is_none());
    assert_eq!(body["max_tokens"], 8192);
    assert_eq!(body["messages"][0]["role"], "user");
    assert!(body["messages"][0]["content"]
      .as_str()
      .unwrap()
      .contains("量子コンピュータ入門"));

    // 送出内容にトークン/認証が構造的に混入しない（NFR-004）
    let serialized = serde_json::to_string(&body).unwrap();
    assert!(!serialized.to_lowercase().contains("authorization"));
    assert!(!serialized.to_lowercase().contains("bearer"));
    // tools/tool_choice は省略
    assert!(body.get("tools").is_none());
    assert!(body.get("tool_choice").is_none());
  }

  #[test]
  fn build_request_body_includes_base_and_feedback_only_when_present() {
    let req = req_with(
      "更新して",
      Some("{\"meta\":{\"title\":\"x\"}}"),
      Some("id が空"),
    );
    let content = build_request_body(&req, 100)["messages"][0]["content"]
      .as_str()
      .unwrap()
      .to_string();
    assert!(content.contains("{\"meta\":{\"title\":\"x\"}}"));
    assert!(content.contains("id が空"));
  }

  #[test]
  fn build_request_body_passes_theme_constraints_into_system_prompt() {
    // JS 側の意匠制約（buildThemeConstraintsPrompt）が system プロンプトへ渡ることを検証する（#211）
    let mut req = req_with("量子コンピュータ入門", None, None);
    req.theme_constraints = Some("色トークン名: primary, accent".to_string());
    let body = build_request_body(&req, 8192);
    assert!(body["system"]
      .as_str()
      .unwrap()
      .contains("色トークン名: primary, accent"));
  }

  #[test]
  fn is_retryable_status_only_429_and_529() {
    assert!(is_retryable_status(429));
    assert!(is_retryable_status(529));
    assert!(!is_retryable_status(400));
    assert!(!is_retryable_status(401));
    assert!(!is_retryable_status(500));
  }

  #[test]
  fn should_retry_only_for_retryable_api_status() {
    assert!(should_retry(&GenerateError::Api {
      status: 429,
      message: "rate".to_string()
    }));
    assert!(!should_retry(&GenerateError::Api {
      status: 400,
      message: "bad".to_string()
    }));
    assert!(!should_retry(&GenerateError::Credential("x".to_string())));
    assert!(!should_retry(&GenerateError::Timeout));
  }

  #[test]
  fn backoff_ms_grows_and_caps() {
    assert_eq!(backoff_ms(0), 1_000);
    assert_eq!(backoff_ms(1), 2_000);
    assert_eq!(backoff_ms(2), 4_000);
    assert_eq!(backoff_ms(10), 30_000);
  }

  #[test]
  fn extract_text_concatenates_and_errors_on_empty() {
    let value = serde_json::json!({
      "content": [ { "type": "text", "text": "{\"meta\":" }, { "type": "text", "text": "{\"title\":\"t\"}}" } ]
    });
    assert_eq!(
      extract_text_from_response(&value).unwrap(),
      ("{\"meta\":{\"title\":\"t\"}}".to_string(), false)
    );

    let empty = serde_json::json!({ "content": [ { "type": "text", "text": "   " } ] });
    assert!(matches!(
      extract_text_from_response(&empty),
      Err(GenerateError::InvalidResponse(_))
    ));

    let missing = serde_json::json!({ "id": "x" });
    assert!(matches!(
      extract_text_from_response(&missing),
      Err(GenerateError::InvalidResponse(_))
    ));
  }

  #[test]
  fn extract_text_from_response_detects_truncation_via_stop_reason() {
    // stop_reason == "max_tokens" はトークン上限で途中切断されたことを示す
    let truncated = serde_json::json!({
      "content": [ { "type": "text", "text": "{\"meta\":{\"title\":\"t" } ],
      "stop_reason": "max_tokens"
    });
    let (_, is_truncated) = extract_text_from_response(&truncated).unwrap();
    assert!(is_truncated);

    // 正常終了（end_turn）は途中切断ではない
    let complete = serde_json::json!({
      "content": [ { "type": "text", "text": "{\"meta\":{}}" } ],
      "stop_reason": "end_turn"
    });
    let (_, is_truncated) = extract_text_from_response(&complete).unwrap();
    assert!(!is_truncated);

    // stop_reason 欠落も途中切断とは判定しない
    let missing_stop_reason = serde_json::json!({
      "content": [ { "type": "text", "text": "{\"meta\":{}}" } ]
    });
    let (_, is_truncated) = extract_text_from_response(&missing_stop_reason).unwrap();
    assert!(!is_truncated);
  }
}
