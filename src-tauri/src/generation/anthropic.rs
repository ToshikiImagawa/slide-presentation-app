//! 内蔵生成（Anthropic Messages API 直・reqwest）— FR-003。
//!
//! キーを WebView に出さず Rust 境界で `x-api-key` ヘッダに載せて `api.anthropic.com` を直接叩く
//! （DC-002/NFR-003）。送出 body はプロンプト構築の純関数（`super::system_prompt` / `super::user_prompt`）
//! に集約し、キー本体・任意ファイルを混入させない（NFR-004）。`with_retry`（429/529 指数バックオフ）・
//! エラーボディ切詰め・応答タイムアウト 120 秒でコストを境界付ける（NFR-005・FR-008）。
//! ticketvc `anthropic_client.rs` の実績パターンを直 API（`x-api-key`）へ読み替えて流用。

use super::{CancelToken, GenerateError, GenerateRequest, SlideGenerator};
use secrecy::{ExposeSecret, SecretString};
use serde_json::Value;
use std::time::Duration;

/// Anthropic Messages API エンドポイント。
const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
/// `anthropic-version` ヘッダ値（直 API）。
const ANTHROPIC_VERSION: &str = "2023-06-01";
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

/// 内蔵 Anthropic 生成器。キーは keyring から取得済みの `SecretString`（未設定なら `None`）。
pub struct AnthropicGenerator {
  key: Option<SecretString>,
  model: String,
  client: reqwest::Client,
}

/// 共有 reqwest クライアント。生成のたび（自動修正ループの試行ごと）に new せず、
/// コネクションプール/TLS を試行・生成間で再利用する（clone は Arc 内部共有で cheap）。
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

impl AnthropicGenerator {
  pub fn new(key: Option<SecretString>, model: String) -> Self {
    Self {
      key,
      model,
      client: shared_client(),
    }
  }

  /// 1 回の POST を実行し、成功なら候補 JSON 文字列（フェンス除去済み）を返す。
  async fn send_once(
    &self,
    headers: &reqwest::header::HeaderMap,
    body: &Value,
  ) -> Result<String, GenerateError> {
    let response = self
      .client
      .post(ANTHROPIC_URL)
      .headers(headers.clone())
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
      return Err(GenerateError::Api {
        status: status.as_u16(),
        message: super::truncate_preview(&text, ERROR_PREVIEW_CHARS),
      });
    }

    let value: Value = response
      .json()
      .await
      .map_err(|e| GenerateError::InvalidResponse(e.to_string()))?;
    let text = extract_text_from_response(&value)?;
    Ok(super::strip_code_fences(&text))
  }
}

#[async_trait::async_trait]
impl SlideGenerator for AnthropicGenerator {
  async fn generate(
    &self,
    req: &GenerateRequest,
    cancel: &CancelToken,
  ) -> Result<String, GenerateError> {
    if cancel.is_cancelled() {
      return Err(GenerateError::Cancelled);
    }
    let key = self.key.as_ref().ok_or(GenerateError::NotConfigured)?;
    let headers = build_headers(key)?;
    let body = build_request_body(&self.model, req, DEFAULT_MAX_TOKENS);

    // in-flight の HTTP をキャンセルと競わせる。キャンセル時は送信 future が drop され reqwest が abort する
    // （AtomicBool の観測だけでは in-flight を止められないため・design §6/FR-010）
    tokio::select! {
      biased;
      _ = cancel.cancelled() => Err(GenerateError::Cancelled),
      result = async {
        let mut attempt = 0;
        loop {
          match self.send_once(&headers, &body).await {
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

/// `x-api-key` ＋ `anthropic-version` ＋ `content-type` ヘッダを構築する（キー値は sensitive 指定）。
fn build_headers(key: &SecretString) -> Result<reqwest::header::HeaderMap, GenerateError> {
  use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE};
  let mut headers = HeaderMap::new();
  let mut key_value = HeaderValue::from_str(key.expose_secret()).map_err(|_| {
    GenerateError::Network("API キーに使用できない文字が含まれています".to_string())
  })?;
  key_value.set_sensitive(true); // reqwest/http のログに生値を出さない（NFR-003）
  headers.insert(HeaderName::from_static("x-api-key"), key_value);
  headers.insert(
    HeaderName::from_static("anthropic-version"),
    HeaderValue::from_static(ANTHROPIC_VERSION),
  );
  headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
  Ok(headers)
}

/// 送出 body を構築する純関数（機密最小化の単一チョークポイント・NFR-004）。
/// `tools` は使わないため `tool_choice` ごと省略する（Anthropic 400 回避）。
pub(crate) fn build_request_body(model: &str, req: &GenerateRequest, max_tokens: u32) -> Value {
  serde_json::json!({
      "model": model,
      "max_tokens": max_tokens,
      "system": super::system_prompt(),
      "messages": [ { "role": "user", "content": super::user_prompt(req) } ],
  })
}

/// レスポンスの `content[].text`（type=="text"）を連結して取り出す。空・欠落は不正応答。
pub(crate) fn extract_text_from_response(value: &Value) -> Result<String, GenerateError> {
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
  Ok(text)
}

/// リトライ対象か（429 レート制限 / 529 過負荷のみ・NFR-005）。
fn is_retryable_status(status: u16) -> bool {
  status == 429 || status == 529
}

/// エラーがリトライ対象か（API の 429/529 のみ。通信/タイムアウト等はリトライしない）。
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
      kind: SlideGeneratorKind::BuiltinAnthropic,
      base_slides: base.map(|s| s.to_string()),
      repair_feedback: feedback.map(|s| s.to_string()),
    }
  }

  #[test]
  fn build_request_body_has_shape_and_no_secret() {
    let req = req_with("量子コンピュータ入門", None, None);
    let body = build_request_body("claude-opus-4-8", &req, 8192);

    assert_eq!(body["model"], "claude-opus-4-8");
    assert_eq!(body["max_tokens"], 8192);
    assert!(body["system"].is_string());
    assert_eq!(body["messages"][0]["role"], "user");
    assert!(body["messages"][0]["content"]
      .as_str()
      .unwrap()
      .contains("量子コンピュータ入門"));

    // 送出内容にキー関連（x-api-key 等）が構造的に混入しない（NFR-004）
    let serialized = serde_json::to_string(&body).unwrap();
    assert!(!serialized.contains("x-api-key"));
    assert!(!serialized.contains("api_key"));
    // tools/tool_choice は省略（Anthropic 400 回避）
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
    let content = build_request_body("m", &req, 100)["messages"][0]["content"]
      .as_str()
      .unwrap()
      .to_string();
    assert!(content.contains("{\"meta\":{\"title\":\"x\"}}"));
    assert!(content.contains("id が空"));
  }

  #[test]
  fn is_retryable_status_only_429_and_529() {
    assert!(is_retryable_status(429));
    assert!(is_retryable_status(529));
    assert!(!is_retryable_status(400));
    assert!(!is_retryable_status(401));
    assert!(!is_retryable_status(500));
    assert!(!is_retryable_status(200));
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
    assert!(!should_retry(&GenerateError::Network("x".to_string())));
    assert!(!should_retry(&GenerateError::Timeout));
  }

  #[test]
  fn backoff_ms_grows_and_caps() {
    assert_eq!(backoff_ms(0), 1_000);
    assert_eq!(backoff_ms(1), 2_000);
    assert_eq!(backoff_ms(2), 4_000);
    // 上限 30s を超えない
    assert_eq!(backoff_ms(10), 30_000);
  }

  #[test]
  fn extract_text_concatenates_text_blocks() {
    let value = serde_json::json!({
        "content": [
            { "type": "text", "text": "{\"meta\":" },
            { "type": "text", "text": "{\"title\":\"t\"}}" }
        ]
    });
    assert_eq!(
      extract_text_from_response(&value).unwrap(),
      "{\"meta\":{\"title\":\"t\"}}"
    );
  }

  #[test]
  fn extract_text_errors_on_missing_or_empty() {
    // content 欠落
    let value = serde_json::json!({ "id": "x" });
    assert!(matches!(
      extract_text_from_response(&value),
      Err(GenerateError::InvalidResponse(_))
    ));
    // text ブロックが空
    let value = serde_json::json!({ "content": [ { "type": "text", "text": "   " } ] });
    assert!(matches!(
      extract_text_from_response(&value),
      Err(GenerateError::InvalidResponse(_))
    ));
  }
}
