//! slideLayout part（`p:sldLayout` = slideLayout1.xml）のパーサ（#192）。
//!
//! 取るのは名前・種別・プレースホルダ構成（既定文字プロパティ込み。#316）・背景・clrMap反転（#300）のみ。
//! ロゴ・帯のヒューリスティクスは slideMaster の spTree に対してのみ行う設計（#168）を変えないため、
//! layout 側では再実行しない（`shapes.rs`/`heuristics.rs` は slideMaster 専用のまま）。
//!
//! プレースホルダの既定文字プロパティは `p:txBody/a:lstStyle/a:lvl1pPr/a:defRPr`（#316）から読む。
//! 同名の `a:defRPr` は 1 枚の layout に何度も現れるため、**直近に見つけた `p:ph` と同じシェイプ配下のもの
//! だけ**を結びつける（シェイプ境界を無視すると、プレースホルダでない図形の書式が混ざる）。
//!
//! 背景は `p:cSld/p:bg/p:bgPr/a:solidFill`（単色）のみを対象にする。グラデーション/パターン/
//! `p:bgRef`（テーマの fmtScheme 参照）は対象外で、その場合は `None` のまま人が並置比較で確認する。
//!
//! `p:clrMapOvr`（layout 単位で bg1/tx1 等を反転させる仕組み。PowerPoint の「セクション見出し」等の
//! ダーク配色レイアウトで使われる。#300）は `p:clrMapOvr/p:overrideClrMapping`（12属性・`p:clrMap` と同じ形）
//! があれば反転写像として読み、`p:clrMapOvr/p:masterClrMapping`（反転なし）または `p:clrMapOvr` 自体が
//! 無い場合は `None`（呼び出し側は所属 slideMaster 自身の clrMap にフォールバックする）にする。

use quick_xml::events::BytesStart;

use super::color::ColorSpec;
use super::master_xml::ClrMap;
use super::shapes::{is_xfrm_path, read_xfrm_child, PlaceholderShapeTracker, RawXfrm};
use super::text_props::RawTextProps;
use super::xml::{attr, read_solid_fill, rel, strip_path, walk_elements};
use super::BrandError;

/// `p:ph`（プレースホルダ）の生データ
#[derive(Debug, Clone, Default, PartialEq)]
pub struct PlaceholderInfo {
  /// `p:ph@type`（"title"/"body"/"pic" 等）。省略時は `None`（値を作らない）
  pub ph_type: Option<String>,
  pub idx: Option<u32>,
  /// `p:txBody/a:lstStyle/a:lvl1pPr/a:defRPr` の実測値（#316）。継承の解決は呼び出し側に委ねる
  pub text: RawTextProps,
  /// `p:spPr/a:xfrm/a:off|a:ext` の実測値（#317）。layout 側に無ければ所属 slideMaster の
  /// 同じプレースホルダから継承する（継承の解決は呼び出し側に委ねる）
  pub xfrm: RawXfrm,
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
  // 直近に見つけた `p:ph` が属するシェイプの追跡（#316/#317）。master_xml と同じ状態機械を共有する
  let mut tracker = PlaceholderShapeTracker::new();
  walk_elements(xml, |stack, name, e| {
    if stack.is_empty() {
      info.layout_type = attr(e, "type");
      return;
    }
    visit(&mut info, &mut tracker, stack, name, e);
  })?;
  Ok(info)
}

const BG_SOLID_FILL_PATH: [&str; 4] = ["cSld", "bg", "bgPr", "solidFill"];
const CLR_MAP_OVR_PATH: [&str; 1] = ["clrMapOvr"];

fn visit(
  info: &mut SlideLayoutInfo,
  tracker: &mut PlaceholderShapeTracker,
  stack: &[String],
  name: &str,
  e: &BytesStart,
) {
  let parent = rel(stack);

  if parent.is_empty() && name == "cSld" {
    info.name = attr(e, "name").filter(|v| !v.is_empty());
    return;
  }

  // p:nvSpPr/p:nvPicPr/p:nvGraphicFramePr 等、コンテナの種類を問わず `nvPr` 直下の `ph` だけを拾う
  if let Some((ph_type, idx)) = tracker.observe(parent, name, e) {
    info.placeholders.push(PlaceholderInfo {
      ph_type,
      idx,
      text: RawTextProps::default(),
      xfrm: RawXfrm::default(),
    });
    return;
  }

  // 直近の `p:ph` と同じシェイプの `a:lstStyle/a:lvl1pPr` 配下＝そのプレースホルダの既定文字プロパティ
  if let (Some(inner), Some(placeholder)) = (
    lvl1_style_path(tracker.shape_depth(), parent),
    info.placeholders.last_mut(),
  ) {
    placeholder.text.visit(inner, name, e);
    return;
  }

  // 直近の `p:ph` と同じシェイプの `p:spPr/a:xfrm` 配下＝そのプレースホルダの矩形（#317）
  if is_xfrm_path(tracker.shape_depth(), parent) {
    if let Some(placeholder) = info.placeholders.last_mut() {
      read_xfrm_child(&mut placeholder.xfrm, name, e);
    }
    return;
  }

  if let Some(inner) = strip_path(parent, &BG_SOLID_FILL_PATH) {
    read_solid_fill(&mut info.background, inner, name, e);
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

/// 親要素のパスが「深さ `shape_depth` のシェイプ配下の `p:txBody/a:lstStyle/a:lvl1pPr`」なら、
/// `a:lvl1pPr` 起点の相対パスを返す（#316）。`a:lvl2pPr` 以降は受け皿に対応する概念がないため対象外
/// （`master_xml::split_lvl1_path` と同じ扱い）
fn lvl1_style_path(shape_depth: Option<usize>, parent: &[String]) -> Option<&[String]> {
  let [tx_body, lst_style, lvl, inner @ ..] = parent.get(shape_depth?..)? else {
    return None;
  };
  (tx_body == "txBody" && lst_style == "lstStyle" && lvl == "lvl1pPr").then_some(inner)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::brand::color::{ColorRef, ColorTransform, Rgb};

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

  /// プレースホルダに既定文字プロパティ（`a:lstStyle/a:lvl1pPr/a:defRPr`）を持ち、
  /// プレースホルダでない図形にも同じ形の書式が入っている layout（#316）
  const LAYOUT_WITH_DEF_RPR: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="title">
  <p:cSld name="Title Slide">
    <p:spTree>
      <p:nvGrpSpPr/>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle>
            <a:lvl1pPr>
              <a:defRPr sz="4000" b="1">
                <a:solidFill><a:schemeClr val="tx1"/></a:solidFill>
                <a:latin typeface="Corporate Display"/>
                <a:ea typeface="コーポレート見出し"/>
              </a:defRPr>
            </a:lvl1pPr>
            <a:lvl2pPr><a:defRPr sz="9999"/></a:lvl2pPr>
          </a:lstStyle>
          <a:p><a:r><a:rPr lang="ja-JP"/><a:t>タイトル</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Subtitle 2"/><p:nvPr><p:ph type="subTitle" idx="1"/></p:nvPr></p:nvSpPr>
        <p:txBody>
          <a:lstStyle><a:lvl1pPr><a:defRPr sz="2000"><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></a:lstStyle>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="4" name="Decoration"/><p:nvPr/></p:nvSpPr>
        <p:txBody>
          <a:lstStyle><a:lvl1pPr><a:defRPr sz="800"><a:latin typeface="Decoration Only"/></a:defRPr></a:lvl1pPr></a:lstStyle>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sldLayout>"#;

  #[test]
  fn parses_placeholder_default_text_properties() {
    let info = parse(LAYOUT_WITH_DEF_RPR).unwrap();
    let title = &info.placeholders[0].text;
    // sz は 1/100pt なので 4000 → 40pt。lvl2pPr の 9999 に上書きされない
    assert_eq!(title.size_pt, Some(40.0));
    assert_eq!(title.bold, Some(true));
    assert_eq!(title.fonts.latin.as_deref(), Some("Corporate Display"));
    assert_eq!(title.fonts.ea.as_deref(), Some("コーポレート見出し"));
    assert_eq!(
      title.color.as_ref().map(|c| c.base.clone()),
      Some(ColorRef::Scheme("tx1".to_string()))
    );
  }

  #[test]
  fn theme_reference_typeface_is_not_taken_as_a_measured_font() {
    let info = parse(LAYOUT_WITH_DEF_RPR).unwrap();
    let subtitle = &info.placeholders[1].text;
    assert_eq!(subtitle.size_pt, Some(20.0));
    // `+mn-lt` はテーマ参照なので書体名として取り込まない
    assert_eq!(subtitle.fonts.latin, None);
  }

  #[test]
  fn text_properties_of_non_placeholder_shapes_are_not_attributed_to_placeholders() {
    // 兄弟シェイプのパスは同一（cSld/spTree/sp）なので、シェイプ境界を無視すると
    // "Decoration Only"（プレースホルダでない図形）が直前のプレースホルダの値になってしまう
    let info = parse(LAYOUT_WITH_DEF_RPR).unwrap();
    assert_eq!(info.placeholders.len(), 2);
    for placeholder in &info.placeholders {
      assert_ne!(
        placeholder.text.fonts.latin.as_deref(),
        Some("Decoration Only")
      );
      assert_ne!(placeholder.text.size_pt, Some(8.0));
    }
  }

  #[test]
  fn placeholders_without_text_body_have_no_measured_text_properties() {
    let info = parse(LAYOUT_XML).unwrap();
    assert_eq!(info.placeholders[0].text, RawTextProps::default());
  }

  /// 非対称な余白を持つ本文プレースホルダ（左右上下で異なる矩形）と、`a:xfrm` を持たないタイトルの2枚（#317）
  const LAYOUT_WITH_XFRM: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="obj">
  <p:cSld name="Content">
    <p:spTree>
      <p:nvGrpSpPr/>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Text Placeholder 2"/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="609600" y="1143000"/><a:ext cx="10972800" cy="5257800"/></a:xfrm>
        </p:spPr>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="4" name="Decoration"/><p:nvPr/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="0" y="0"/><a:ext cx="99" cy="99"/></a:xfrm>
        </p:spPr>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sldLayout>"#;

  #[test]
  fn parses_placeholder_rectangle_from_xfrm() {
    let info = parse(LAYOUT_WITH_XFRM).unwrap();
    let body = &info.placeholders[1].xfrm;
    assert_eq!(body.off, Some((609_600, 1_143_000)));
    assert_eq!(body.ext, Some((10_972_800, 5_257_800)));
  }

  #[test]
  fn placeholder_without_xfrm_has_no_rectangle() {
    let info = parse(LAYOUT_WITH_XFRM).unwrap();
    assert_eq!(info.placeholders[0].xfrm, RawXfrm::default());
  }

  #[test]
  fn rectangle_of_non_placeholder_shapes_is_not_attributed_to_placeholders() {
    // 兄弟シェイプの境界を無視すると "Decoration" の矩形が直前のプレースホルダの値になってしまう
    let info = parse(LAYOUT_WITH_XFRM).unwrap();
    for placeholder in &info.placeholders {
      assert_ne!(placeholder.xfrm.ext, Some((99, 99)));
    }
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
