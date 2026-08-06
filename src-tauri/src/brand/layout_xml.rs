//! slideLayout part（`p:sldLayout` = slideLayout1.xml）のパーサ（#192）。
//!
//! 取るのは名前・種別・プレースホルダ構成・背景の4項目のみ。ロゴ・帯のヒューリスティクスは
//! slideMaster の spTree に対してのみ行う設計（#168）を変えないため、layout 側では再実行しない
//! （`shapes.rs`/`heuristics.rs` は slideMaster 専用のまま）。
//!
//! 背景は `p:cSld/p:bg/p:bgPr/a:solidFill`（単色）のみを対象にする。グラデーション/パターン/
//! `p:bgRef`（テーマの fmtScheme 参照）は対象外で、その場合は `None` のまま人が並置比較で確認する。

use quick_xml::events::BytesStart;

use super::color::{ColorSpec, ColorTransform};
use super::xml::{attr, base_color_ref, child_of, rel, walk_elements};
use super::BrandError;

/// `p:ph`（プレースホルダ）の生データ
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PlaceholderInfo {
  /// `p:ph@type`（"title"/"body"/"pic" 等）。省略時は `None`（値を作らない）
  pub ph_type: Option<String>,
  pub idx: Option<u32>,
}

/// slideLayout から抽出した内容
#[derive(Debug, Clone, Default, PartialEq)]
pub struct SlideLayoutInfo {
  /// `p:cSld@name`
  pub name: Option<String>,
  /// `p:sldLayout@type`（ルート要素の属性）
  pub layout_type: Option<String>,
  pub placeholders: Vec<PlaceholderInfo>,
  /// `p:bg/p:bgPr/a:solidFill` の色指定（未解決）。clrMap → clrScheme の解決は呼び出し側に委ねる
  pub background: Option<ColorSpec>,
}

/// slideLayout XML をパースする
pub fn parse(xml: &str) -> Result<SlideLayoutInfo, BrandError> {
  let mut info = SlideLayoutInfo::default();
  walk_elements(xml, |stack, name, e| {
    if stack.is_empty() {
      info.layout_type = attr(e, "type");
      return;
    }
    visit(&mut info, stack, name, e);
  })?;
  Ok(info)
}

const BG_SOLID_FILL_PATH: [&str; 4] = ["cSld", "bg", "bgPr", "solidFill"];

fn visit(info: &mut SlideLayoutInfo, stack: &[String], name: &str, e: &BytesStart) {
  let parent = rel(stack);

  if parent.is_empty() && name == "cSld" {
    info.name = attr(e, "name").filter(|v| !v.is_empty());
    return;
  }

  // p:nvSpPr/p:nvPicPr/p:nvGraphicFramePr 等、コンテナの種類を問わず `nvPr` 直下の `ph` だけを拾う
  if name == "ph" && parent.last().map(String::as_str) == Some("nvPr") {
    info.placeholders.push(PlaceholderInfo {
      ph_type: attr(e, "type"),
      idx: attr(e, "idx").and_then(|v| v.trim().parse::<u32>().ok()),
    });
    return;
  }

  if parent == BG_SOLID_FILL_PATH {
    if let Some(base) = base_color_ref(name, e) {
      info.background = Some(ColorSpec::new(base));
    }
  } else if child_of(parent, &BG_SOLID_FILL_PATH).is_some() {
    // 基準色要素の子＝色変換（lumMod/lumOff/tint/shade）
    let transform = attr(e, "val").and_then(|v| ColorTransform::from_element(name, &v));
    if let (Some(transform), Some(spec)) = (transform, info.background.as_mut()) {
      spec.transforms.push(transform);
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::brand::color::{ColorRef, Rgb};

  /// 実物の slideLayout1.xml と同じ入れ子（プレースホルダ複数種・単色背景）を最小構成で再現する
  const LAYOUT_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="secHead">
  <p:cSld name="Section Header">
    <p:bg>
      <p:bgPr>
        <a:solidFill><a:schemeClr val="accent1"><a:lumMod val="75000"/></a:schemeClr></a:solidFill>
      </p:bgPr>
    </p:bg>
    <p:spTree>
      <p:nvGrpSpPr/>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Title 1"/>
          <p:nvPr><p:ph type="title"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr/>
      </p:sp>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Text Placeholder 2"/>
          <p:nvPr><p:ph type="body" idx="1"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr/>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sldLayout>"#;

  #[test]
  fn parses_name_and_type() {
    let info = parse(LAYOUT_XML).unwrap();
    assert_eq!(info.name.as_deref(), Some("Section Header"));
    assert_eq!(info.layout_type.as_deref(), Some("secHead"));
  }

  #[test]
  fn parses_placeholders_with_type_and_idx() {
    let info = parse(LAYOUT_XML).unwrap();
    assert_eq!(info.placeholders.len(), 2);
    assert_eq!(info.placeholders[0].ph_type.as_deref(), Some("title"));
    assert_eq!(info.placeholders[0].idx, None);
    assert_eq!(info.placeholders[1].ph_type.as_deref(), Some("body"));
    assert_eq!(info.placeholders[1].idx, Some(1));
  }

  #[test]
  fn parses_background_with_scheme_color_and_transform() {
    let info = parse(LAYOUT_XML).unwrap();
    let background = info.background.expect("background");
    assert_eq!(background.base, ColorRef::Scheme("accent1".to_string()));
    assert_eq!(background.transforms, vec![ColorTransform::LumMod(0.75)]);
  }

  #[test]
  fn background_is_none_when_absent() {
    let xml = r#"<p:sldLayout xmlns:p="p" xmlns:a="a" type="blank">
      <p:cSld><p:spTree><p:nvGrpSpPr/></p:spTree></p:cSld>
    </p:sldLayout>"#;
    let info = parse(xml).unwrap();
    assert_eq!(info.background, None);
    assert_eq!(info.placeholders.len(), 0);
  }

  #[test]
  fn fixed_color_background_has_no_transforms() {
    let xml = r#"<p:sldLayout xmlns:p="p" xmlns:a="a">
      <p:cSld name="Blank">
        <p:bg><p:bgPr><a:solidFill><a:srgbClr val="1F4E79"/></a:solidFill></p:bgPr></p:bg>
        <p:spTree/>
      </p:cSld>
    </p:sldLayout>"#;
    let info = parse(xml).unwrap();
    let background = info.background.expect("background");
    assert_eq!(
      background.base,
      ColorRef::Fixed(Rgb {
        r: 0x1f,
        g: 0x4e,
        b: 0x79
      })
    );
    assert!(background.transforms.is_empty());
  }

  #[test]
  fn empty_name_is_treated_as_absent() {
    let xml = r#"<p:sldLayout xmlns:p="p"><p:cSld name=""><p:spTree/></p:cSld></p:sldLayout>"#;
    let info = parse(xml).unwrap();
    assert_eq!(info.name, None);
  }

  #[test]
  fn malformed_xml_is_an_error_not_a_panic() {
    assert!(matches!(
      parse("<p:sldLayout><p:cSld></p:sldLayout>"),
      Err(BrandError::Xml(_))
    ));
  }

  #[test]
  fn parse_is_deterministic() {
    let first = parse(LAYOUT_XML).unwrap();
    for _ in 0..5 {
      assert_eq!(parse(LAYOUT_XML).unwrap(), first);
    }
  }
}
