//! slideLayout part（`p:sldLayout` = slideLayout1.xml）のパーサ（#192）。
//!
//! 取るのは名前・種別・プレースホルダ構成・背景・clrMap反転（#300）の5項目のみ。ロゴ・帯のヒューリスティクスは
//! slideMaster の spTree に対してのみ行う設計（#168）を変えないため、layout 側では再実行しない
//! （`shapes.rs`/`heuristics.rs` は slideMaster 専用のまま）。
//!
//! 背景は `p:cSld/p:bg/p:bgPr/a:solidFill`（単色）のみを対象にする。グラデーション/パターン/
//! `p:bgRef`（テーマの fmtScheme 参照）は対象外で、その場合は `None` のまま人が並置比較で確認する。
//!
//! `p:clrMapOvr`（layout 単位で bg1/tx1 等を反転させる仕組み。PowerPoint の「セクション見出し」等の
//! ダーク配色レイアウトで使われる。#300）は `p:clrMapOvr/p:overrideClrMapping`（12属性・`p:clrMap` と同じ形）
//! があれば反転写像として読み、`p:clrMapOvr/p:masterClrMapping`（反転なし）または `p:clrMapOvr` 自体が
//! 無い場合は `None`（呼び出し側は所属 slideMaster 自身の clrMap にフォールバックする）にする。

use quick_xml::events::BytesStart;

use super::color::{ColorSpec, ColorTransform};
use super::master_xml::ClrMap;
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
  /// `p:clrMapOvr/p:overrideClrMapping`（layout 単位の clrMap 反転。#300）。無ければ `None`
  /// （所属 slideMaster 自身の clrMap を使う）
  pub color_map_override: Option<ClrMap>,
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
const CLR_MAP_OVR_PATH: [&str; 1] = ["clrMapOvr"];

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
    return;
  }
  if child_of(parent, &BG_SOLID_FILL_PATH).is_some() {
    // 基準色要素の子＝色変換（lumMod/lumOff/tint/shade）
    let transform = attr(e, "val").and_then(|v| ColorTransform::from_element(name, &v));
    if let (Some(transform), Some(spec)) = (transform, info.background.as_mut()) {
      spec.transforms.push(transform);
    }
    return;
  }

  // `p:clrMapOvr/p:overrideClrMapping`（反転写像）のみ拾う。`p:masterClrMapping`（反転なし）は
  // 属性を持たない空要素で拾う対象が無く、その場合 `color_map_override` は `None` のままで正しい
  if parent == CLR_MAP_OVR_PATH && name == "overrideClrMapping" {
    let mut map = ClrMap::default();
    map.read_attributes(e);
    info.color_map_override = Some(map);
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
    assert_eq!(info.color_map_override, None);
  }

  #[test]
  fn parses_clr_map_ovr_with_inverted_assignment() {
    // secHead レイアウトが所属 slideMaster（通常 bg1=lt1）を反転してダーク配色にする典型例（#300）
    let xml = r#"<p:sldLayout xmlns:a="a" xmlns:p="p" type="secHead">
      <p:clrMapOvr>
        <p:overrideClrMapping bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
      </p:clrMapOvr>
      <p:cSld name="Section Header">
        <p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></p:bgPr></p:bg>
        <p:spTree/>
      </p:cSld>
    </p:sldLayout>"#;
    let info = parse(xml).unwrap();
    let map = info.color_map_override.expect("color_map_override");
    assert_eq!(map.bg1, "dk1");
    assert_eq!(map.tx1, "lt1");
    assert_eq!(map.bg2, "dk2");
    assert_eq!(map.tx2, "lt2");
  }

  #[test]
  fn master_clr_mapping_leaves_override_none() {
    // `p:masterClrMapping`（反転なし・所属 slideMaster の clrMap をそのまま使う）は属性を持たない
    let xml = r#"<p:sldLayout xmlns:a="a" xmlns:p="p" type="obj">
      <p:clrMapOvr><p:masterClrMapping/></p:clrMapOvr>
      <p:cSld name="Content"><p:spTree/></p:cSld>
    </p:sldLayout>"#;
    let info = parse(xml).unwrap();
    assert_eq!(info.color_map_override, None);
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
