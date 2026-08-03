//! 各パーサが共有する XML 読み取りの土台（#167）。
//!
//! OOXML の名前空間接頭辞（`a:` / `p:`）は仕様上固定されないため、要素・属性はすべてローカル名で照合する。
//! 位置の判定は「親要素のパス」で行い、要素名の出現だけでは拾わない（同名要素が `a:fmtScheme` や
//! `p:cSld` 配下に大量に現れるため）。

use quick_xml::events::{BytesStart, Event};
use quick_xml::name::QName;
use quick_xml::Reader;
use quick_xml::XmlVersion;

use super::color::{parse_hex, ColorRef};
use super::BrandError;

/// OOXML の part はすべて `<?xml version="1.0"?>` を宣言する。属性値の正規化規則はこのバージョンに従う
pub const XML_VERSION: XmlVersion = XmlVersion::Explicit1_0;

/// 名前空間接頭辞を除いた要素名
pub fn local_name(name: QName<'_>) -> String {
  String::from_utf8_lossy(name.local_name().as_ref()).into_owned()
}

/// 属性をローカル名で引く（`r:id` のように接頭辞つきの属性と衝突する場面では専用の読み取りを使う）
pub fn attr(e: &BytesStart, name: &str) -> Option<String> {
  e.attributes()
    .flatten()
    .find(|a| a.key.local_name().as_ref() == name.as_bytes())
    .and_then(|a| a.normalized_value(XML_VERSION).ok())
    .map(|value| value.into_owned())
}

/// 要素の開始（空要素を含む）を「親要素のパス・自要素名・自要素」で前順に巡回する。
/// `stack[0]` はルート要素名で、`rel` はこの並びを前提にしている
pub fn walk_elements(
  xml: &str,
  mut visit: impl FnMut(&[String], &str, &BytesStart),
) -> Result<(), BrandError> {
  let mut reader = Reader::from_str(xml);
  reader.config_mut().trim_text(true);
  let mut stack: Vec<String> = Vec::new();
  loop {
    match reader.read_event() {
      Ok(Event::Eof) => return Ok(()),
      Ok(Event::Start(e)) => {
        let name = local_name(e.name());
        visit(&stack, &name, &e);
        stack.push(name);
      }
      Ok(Event::Empty(e)) => visit(&stack, &local_name(e.name()), &e),
      Ok(Event::End(_)) => {
        stack.pop();
      }
      Ok(_) => {}
      Err(e) => return Err(BrandError::Xml(e.to_string())),
    }
  }
}

/// ルート要素を除いた相対パス（`a:theme` / `a:themeOverride` のようにルート名が揺れても比較できるようにする）
pub fn rel(stack: &[String]) -> &[String] {
  stack.get(1..).unwrap_or_default()
}

/// パスが `expected` の直下 1 段である場合に、その子要素の名前を返す。
/// 「ちょうどこの位置」を長さとインデックスの数値に分解せずに書くための補助
pub fn child_of<'a>(path: &'a [String], expected: &[&str]) -> Option<&'a str> {
  (path.len() == expected.len() + 1 && path[..expected.len()] == *expected)
    .then(|| path[expected.len()].as_str())
}

/// 色要素から基準色の参照を読む。
/// clrScheme のスロット直下は確定色（`a:srgbClr` / `a:sysClr`）のみ、`a:solidFill` 直下は `a:schemeClr` も現れる。
/// 「`sysClr` の実効値は `val` ではなく `lastClr`」という OOXML の知識をこの 1 箇所に閉じる
pub fn base_color_ref(name: &str, e: &BytesStart) -> Option<ColorRef> {
  match name {
    "srgbClr" => attr(e, "val")
      .as_deref()
      .and_then(parse_hex)
      .map(ColorRef::Fixed),
    "sysClr" => attr(e, "lastClr")
      .as_deref()
      .and_then(parse_hex)
      .map(ColorRef::Fixed),
    "schemeClr" => attr(e, "val")
      .filter(|v| !v.is_empty())
      .map(ColorRef::Scheme),
    _ => None,
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn path(segments: &[&str]) -> Vec<String> {
    segments.iter().map(|s| s.to_string()).collect()
  }

  #[test]
  fn rel_drops_the_root_element() {
    assert_eq!(
      rel(&path(&["theme", "themeElements", "clrScheme"])),
      ["themeElements", "clrScheme"]
    );
    assert_eq!(rel(&path(&["theme"])).len(), 0);
    assert_eq!(rel(&[]).len(), 0);
  }

  #[test]
  fn child_of_matches_only_the_exact_depth() {
    let p = path(&["themeElements", "clrScheme", "dk1"]);
    assert_eq!(child_of(&p, &["themeElements", "clrScheme"]), Some("dk1"));
    // 浅い・深い・別系統はいずれも一致しない
    assert_eq!(child_of(&p, &["themeElements"]), None);
    assert_eq!(child_of(&p, &["themeElements", "clrScheme", "dk1"]), None);
    assert_eq!(child_of(&p, &["extraClrSchemeLst", "clrScheme"]), None);
    assert_eq!(child_of(&[], &["themeElements"]), None);
  }

  #[test]
  fn walk_elements_reports_parent_paths_for_start_and_empty() {
    let mut seen = Vec::new();
    walk_elements(
      r#"<a:root><a:mid><a:leaf v="1"/></a:mid><a:other/></a:root>"#,
      |stack, name, _| seen.push(format!("{}|{name}", stack.join("/"))),
    )
    .unwrap();
    assert_eq!(seen, ["|root", "root|mid", "root/mid|leaf", "root|other"]);
  }

  #[test]
  fn walk_elements_reports_malformed_xml_as_error() {
    let result = walk_elements("<a:root><a:mid></a:root>", |_, _, _| {});
    assert!(matches!(result, Err(BrandError::Xml(_))));
  }

  #[test]
  fn base_color_ref_reads_sys_clr_effective_value() {
    let fixed = |xml: &str| {
      let mut out = None;
      walk_elements(xml, |_, name, e| out = base_color_ref(name, e)).unwrap();
      out
    };
    // sysClr は val（"windowText" 等の名前）ではなく lastClr が実効値
    assert_eq!(
      fixed(r#"<a:sysClr val="windowText" lastClr="000000"/>"#),
      Some(ColorRef::Fixed(crate::brand::color::Rgb {
        r: 0,
        g: 0,
        b: 0
      }))
    );
    assert_eq!(
      fixed(r#"<a:srgbClr val="F6A21D"/>"#),
      Some(ColorRef::Fixed(crate::brand::color::Rgb {
        r: 0xf6,
        g: 0xa2,
        b: 0x1d
      }))
    );
    assert_eq!(
      fixed(r#"<a:schemeClr val="tx2"/>"#),
      Some(ColorRef::Scheme("tx2".to_string()))
    );
    // 空の val・未知の要素は色にならない
    assert_eq!(fixed(r#"<a:schemeClr val=""/>"#), None);
    assert_eq!(fixed(r#"<a:hslClr hue="0"/>"#), None);
  }
}
