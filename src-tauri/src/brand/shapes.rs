//! slideMaster の `p:cSld/p:spTree` 直下の形状（ロゴ候補・帯候補の生データ）を読む（#168）。
//!
//! `p:pic`（画像プレースホルダ）と `p:sp`（塗り付き矩形等）のうち spTree の直下 1 段だけを対象にする。
//! `p:grpSp` 配下やプレースホルダ本文の書式は対象外（ロゴ・帯は通常 spTree 直下に置かれるため、
//! グループ化された装飾まで拾うとヒューリスティクスの誤爆が増える）。
//!
//! 色は他パーサと同じ「基準色 + 変換の出現順」を `ColorSpec` に積むだけで、clrMap → clrScheme の解決は
//! 呼び出し側（`heuristics::classify_bands`）に委ねる。

use quick_xml::events::BytesStart;

use super::color::ColorSpec;
use super::text_props::RawTextProps;
use super::xml::{
  attr, lvl1_style_rest, read_placeholder_marker, read_solid_fill, rel, strip_path,
  walk_elements_with_text, ShapeCursor, ShapeEvent, WalkNode,
};
use super::BrandError;

/// slideMaster の spTree 直下 1 段がシェイプ境界（`p:grpSp` 配下は再帰しない。#168）
const SHAPE_CONTAINERS: [&str; 1] = ["spTree"];

/// `a:xfrm/a:off` と `a:xfrm/a:ext`（EMU）。どちらか欠けている形状はヒューリスティクスの対象から外す
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct RawXfrm {
  pub off: Option<(i64, i64)>,
  pub ext: Option<(i64, i64)>,
}

/// `p:pic`（画像）の生データ
#[derive(Debug, Clone, Default, PartialEq)]
pub struct RawPic {
  /// `p:nvPicPr/p:cNvPr@name`（ロゴ候補ランキングの name hint に使う）
  pub name: Option<String>,
  /// `p:blipFill/a:blip@r:embed`。この part 自身の関係から media part を解決する
  pub embed_rid: Option<String>,
  pub xfrm: RawXfrm,
}

/// `p:sp` のテキスト内容（固定テキスト/ページ番号候補の生データ。#318）。
/// `a:t` ランの結合文字列と、`a:lstStyle/a:lvl1pPr/a:defRPr` から読む既定文字プロパティを持つ
#[derive(Debug, Clone, Default, PartialEq)]
pub struct RawShapeText {
  /// `a:t` ランの結合文字列。`a:fld@type="slidenum"` はここに `{index}` として埋め込む
  /// （他の `a:fld` 種別 `datetime`/`footer` 等は無視する。#318 の確定方針）。
  /// 段落（`a:p`）の境切りは `\n` で表す
  pub content: String,
  pub props: RawTextProps,
}

/// `p:sp`（塗り付き形状。帯候補・固定テキスト候補の生データ）
#[derive(Debug, Clone, Default, PartialEq)]
pub struct RawShape {
  pub name: Option<String>,
  /// `p:spPr/a:solidFill` の色指定（未解決）。塗りが無い形状（多くのプレースホルダ）は `None`
  pub fill: Option<ColorSpec>,
  pub xfrm: RawXfrm,
  /// `p:nvSpPr/p:nvPr/p:ph` の有無。固定テキスト候補の列挙でプレースホルダを除外する用途（#318）
  pub is_placeholder: bool,
  pub text: RawShapeText,
  /// `p:spPr/a:prstGeom@prst`（"ellipse"/"rect" 等）。ブランドマーク候補の円/正方形判定に使う（#346）
  pub prst_geom: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct RawShapes {
  pub pics: Vec<RawPic>,
  pub shapes: Vec<RawShape>,
}

/// 構築中の形状（spTree 直下の境界で確定させ、次の境界で確定済みのものを結果へ積む）。
/// `Sp` は `Pic` より大幅に大きい（`RawShapeText`/`RawTextProps` を持つ）ため `Box` で間接化し、
/// enum 全体のサイズを小さい方の変種（`Pic`）に近づける（`clippy::large_enum_variant`）
enum Current {
  None,
  Pic(RawPic),
  Sp(Box<RawShape>),
}

pub fn parse_shapes(xml: &str) -> Result<RawShapes, BrandError> {
  let mut out = RawShapes::default();
  let mut current = Current::None;
  let mut cursor = ShapeCursor::new(&SHAPE_CONTAINERS);
  walk_elements_with_text(xml, |stack, node| {
    let path = rel(stack);
    match node {
      WalkNode::Element(name, e) => {
        visit_element(&mut out, &mut current, &mut cursor, path, name, e)
      }
      WalkNode::Text(text) => visit_text(&mut current, &mut cursor, path, text),
    }
  })?;
  flush(&mut current, &mut out);
  Ok(out)
}

fn flush(current: &mut Current, out: &mut RawShapes) {
  match std::mem::replace(current, Current::None) {
    Current::Pic(pic) => out.pics.push(pic),
    Current::Sp(sp) => out.shapes.push(*sp),
    Current::None => {}
  }
}

fn visit_element(
  out: &mut RawShapes,
  current: &mut Current,
  cursor: &mut ShapeCursor,
  path: &[String],
  name: &str,
  e: &BytesStart,
) {
  match cursor.observe(path) {
    // spTree 直下 1 段＝新しい形状の境界。直前の形状はここまでで確定している（XML は木構造で、
    // 兄弟要素の開始は前の兄弟の全子要素を読み終えた後にしか来ないため、境界ごとに flush してよい）
    ShapeEvent::Boundary => {
      flush(current, out);
      *current = match name {
        "pic" => Current::Pic(RawPic::default()),
        "sp" => Current::Sp(Box::default()),
        _ => Current::None,
      };
    }
    // `p:grpSp` 配下等（current が None）はここで弾かれるので、内部の同名要素を誤って拾わない
    ShapeEvent::Inside(inner) => match current {
      Current::Pic(pic) => visit_pic(pic, inner, name, e),
      Current::Sp(sp) => visit_shape_element(sp, inner, name, e),
      Current::None => {}
    },
    ShapeEvent::Outside => {}
  }
}

/// テキストノード（`a:t` の文字データ）を、直前の要素巡回で確定した境界（`cursor`）と結び付ける。
/// `path` はそのテキストを直接含む要素自身を末尾に持つ（`walk_elements_with_text` の規約）
fn visit_text(current: &mut Current, cursor: &mut ShapeCursor, path: &[String], text: &str) {
  let Current::Sp(sp) = current else { return };
  let ShapeEvent::Inside(inner) = cursor.observe(path) else {
    return;
  };
  // `a:t` が `p:txBody/a:p/a:r` の直下にある（実行テキスト）場合のみ取り込む。
  // `p:txBody/a:p/a:fld` 配下の `a:t`（フィールドのキャッシュ済み表示文字列）は、
  // `visit_shape_element` の `a:fld` 処理で別途扱うためここでは取り込まない
  if strip_path(inner, &["txBody"]).is_some_and(|rest| rest == ["p", "r", "t"]) {
    sp.text.content.push_str(text);
  }
}

fn visit_pic(pic: &mut RawPic, inner: &[String], name: &str, e: &BytesStart) {
  if inner == ["nvPicPr"] && name == "cNvPr" {
    pic.name = attr(e, "name");
  } else if inner == ["blipFill"] && name == "blip" {
    pic.embed_rid = attr(e, "embed");
  } else {
    apply_xfrm(&mut pic.xfrm, inner, name, e);
  }
}

fn visit_shape_element(sp: &mut RawShape, inner: &[String], name: &str, e: &BytesStart) {
  if inner == ["nvSpPr"] && name == "cNvPr" {
    sp.name = attr(e, "name");
    return;
  }
  if read_placeholder_marker(inner, name, e).is_some() {
    sp.is_placeholder = true;
    return;
  }
  if inner == ["spPr"] && name == "prstGeom" {
    sp.prst_geom = attr(e, "prst");
    return;
  }
  if let Some(rest) = strip_path(inner, &["spPr", "solidFill"]) {
    read_solid_fill(&mut sp.fill, rest, name, e);
    return;
  }
  if let Some(rest) = lvl1_style_rest(inner) {
    sp.text.props.visit(rest, name, e);
    return;
  }
  // 2 段落目以降の開始（`p:txBody/a:p`）＝直前の段落の続きではないことを示す区切り
  if inner == ["txBody"] && name == "p" {
    if !sp.text.content.is_empty() {
      sp.text.content.push('\n');
    }
    return;
  }
  // `a:fld@type="slidenum"` のみ `{index}` として取り込む（`datetime`/`footer` 等は無視する。
  // #318 の確定方針）。フィールドのキャッシュ済み表示文字列（`a:fld/a:t`）は取り込まない
  // （`visit_text` は `a:r/a:t` だけを拾うため、ここで何もしなければ自然に無視される）
  if name == "fld"
    && strip_path(inner, &["txBody"]).is_some_and(|rest| rest == ["p"])
    && attr(e, "type").as_deref() == Some("slidenum")
  {
    sp.text.content.push_str("{index}");
    return;
  }
  apply_xfrm(&mut sp.xfrm, inner, name, e);
}

/// `p:spPr/a:xfrm/a:off|a:ext`（pic・sp で共通）
fn apply_xfrm(xfrm: &mut RawXfrm, inner: &[String], name: &str, e: &BytesStart) {
  if inner != ["spPr", "xfrm"] {
    return;
  }
  read_xfrm_child(xfrm, name, e);
}

/// `a:xfrm` の子要素（`a:off`/`a:ext`）を読む。呼び出し側で「今 `p:spPr/a:xfrm` 配下にいる」ことを
/// 確認した上で呼ぶ。プレースホルダの矩形抽出（`layout_xml`/`master_xml`。#317）もこの読み取りを共有する
pub fn read_xfrm_child(xfrm: &mut RawXfrm, name: &str, e: &BytesStart) {
  match name {
    "off" => {
      if let (Some(x), Some(y)) = (parse_i64(e, "x"), parse_i64(e, "y")) {
        xfrm.off = Some((x, y));
      }
    }
    "ext" => {
      if let (Some(cx), Some(cy)) = (parse_i64(e, "cx"), parse_i64(e, "cy")) {
        xfrm.ext = Some((cx, cy));
      }
    }
    _ => {}
  }
}

fn parse_i64(e: &BytesStart, key: &str) -> Option<i64> {
  attr(e, key)?.trim().parse::<i64>().ok()
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::brand::color::{ColorRef, ColorTransform, Rgb};

  /// 実物の slideMaster を模した spTree（ロゴ画像 1 個・上帯/左帯の矩形 2 個・塗り無しのプレースホルダ 1 個）
  const XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr/>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title Placeholder 1"/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Top Band"/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="457200"/></a:xfrm>
          <a:solidFill><a:schemeClr val="accent1"><a:lumMod val="75000"/></a:schemeClr></a:solidFill>
        </p:spPr>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="4" name="Left Band"/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="0" y="0"/><a:ext cx="609600" cy="6858000"/></a:xfrm>
          <a:solidFill><a:srgbClr val="1F4E79"/></a:solidFill>
        </p:spPr>
      </p:sp>
      <p:pic>
        <p:nvPicPr><p:cNvPr id="5" name="Company Logo"/></p:nvPicPr>
        <p:blipFill><a:blip r:embed="rId9"/></p:blipFill>
        <p:spPr><a:xfrm><a:off x="10500000" y="6400000"/><a:ext cx="900000" cy="300000"/></a:xfrm></p:spPr>
      </p:pic>
    </p:spTree>
  </p:cSld>
</p:sldMaster>"#;

  #[test]
  fn collects_pics_and_shapes_at_sp_tree_depth() {
    let parsed = parse_shapes(XML).unwrap();
    assert_eq!(parsed.shapes.len(), 3); // title placeholder + 2 bands
    assert_eq!(parsed.pics.len(), 1);
  }

  #[test]
  fn reads_pic_name_embed_and_geometry() {
    let parsed = parse_shapes(XML).unwrap();
    let pic = &parsed.pics[0];
    assert_eq!(pic.name.as_deref(), Some("Company Logo"));
    assert_eq!(pic.embed_rid.as_deref(), Some("rId9"));
    assert_eq!(pic.xfrm.off, Some((10_500_000, 6_400_000)));
    assert_eq!(pic.xfrm.ext, Some((900_000, 300_000)));
  }

  #[test]
  fn placeholder_without_fill_has_no_color_spec() {
    let parsed = parse_shapes(XML).unwrap();
    let title = parsed
      .shapes
      .iter()
      .find(|s| s.name.as_deref() == Some("Title Placeholder 1"))
      .unwrap();
    assert_eq!(title.fill, None);
    assert_eq!(title.xfrm, RawXfrm::default());
  }

  #[test]
  fn resolves_scheme_fill_with_transform_and_fixed_fill() {
    let parsed = parse_shapes(XML).unwrap();
    let top = parsed
      .shapes
      .iter()
      .find(|s| s.name.as_deref() == Some("Top Band"))
      .unwrap();
    let fill = top.fill.clone().expect("top band fill");
    assert_eq!(fill.base, ColorRef::Scheme("accent1".to_string()));
    assert_eq!(fill.transforms, vec![ColorTransform::LumMod(0.75)]);
    assert_eq!(top.xfrm.off, Some((0, 0)));
    assert_eq!(top.xfrm.ext, Some((12_192_000, 457_200)));

    let left = parsed
      .shapes
      .iter()
      .find(|s| s.name.as_deref() == Some("Left Band"))
      .unwrap();
    assert_eq!(
      left.fill.as_ref().unwrap().base,
      ColorRef::Fixed(Rgb {
        r: 0x1f,
        g: 0x4e,
        b: 0x79
      })
    );
  }

  #[test]
  fn ignores_shapes_nested_inside_groups() {
    let xml = r#"<p:sldMaster xmlns:p="p" xmlns:a="a">
      <p:cSld><p:spTree>
        <p:grpSp>
          <p:sp><p:nvSpPr><p:cNvPr name="Nested"/></p:nvSpPr><p:spPr/></p:sp>
        </p:grpSp>
      </p:spTree></p:cSld>
    </p:sldMaster>"#;
    let parsed = parse_shapes(xml).unwrap();
    assert_eq!(parsed.shapes.len(), 0);
    assert_eq!(parsed.pics.len(), 0);
  }

  #[test]
  fn flags_placeholder_shapes_and_leaves_others_unflagged() {
    let parsed = parse_shapes(XML).unwrap();
    let title = parsed
      .shapes
      .iter()
      .find(|s| s.name.as_deref() == Some("Title Placeholder 1"))
      .unwrap();
    assert!(title.is_placeholder);
    let top = parsed
      .shapes
      .iter()
      .find(|s| s.name.as_deref() == Some("Top Band"))
      .unwrap();
    assert!(!top.is_placeholder);
  }

  /// 固定テキスト（複数ラン・複数段落）とページ番号フィールドを持つ非プレースホルダの図形（#318）
  const XML_WITH_TEXT: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Footer"/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="457200" y="6400800"/><a:ext cx="5000000" cy="300000"/></a:xfrm></p:spPr>
        <p:txBody>
          <a:lstStyle>
            <a:lvl1pPr>
              <a:defRPr sz="1000"><a:solidFill><a:srgbClr val="808080"/></a:solidFill><a:latin typeface="Corporate Sans"/></a:defRPr>
            </a:lvl1pPr>
          </a:lstStyle>
          <a:p><a:r><a:rPr lang="ja-JP"/><a:t>&#169; 2026 </a:t></a:r><a:r><a:t>Acme Corp</a:t></a:r></a:p>
          <a:p><a:fld id="{GUID}" type="slidenum"><a:rPr lang="ja-JP"/><a:t>1</a:t></a:fld></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Date"/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm></p:spPr>
        <p:txBody>
          <a:p><a:fld id="{GUID2}" type="datetime1"><a:t>2026/08/17</a:t></a:fld></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="4" name="Title Placeholder"/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
        <p:txBody>
          <a:p><a:r><a:t>タイトルのプレースホルダテキスト</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sldMaster>"#;

  #[test]
  fn collects_run_text_across_multiple_runs_and_paragraphs() {
    let parsed = parse_shapes(XML_WITH_TEXT).unwrap();
    let footer = parsed
      .shapes
      .iter()
      .find(|s| s.name.as_deref() == Some("Footer"))
      .unwrap();
    assert_eq!(footer.text.content, "© 2026 Acme Corp\n{index}");
  }

  #[test]
  fn reads_def_rpr_text_properties_for_text_shape() {
    let parsed = parse_shapes(XML_WITH_TEXT).unwrap();
    let footer = parsed
      .shapes
      .iter()
      .find(|s| s.name.as_deref() == Some("Footer"))
      .unwrap();
    assert_eq!(footer.text.props.size_pt, Some(10.0));
    assert_eq!(
      footer.text.props.fonts.latin.as_deref(),
      Some("Corporate Sans")
    );
    assert_eq!(
      footer.text.props.color.as_ref().map(|c| c.base.clone()),
      Some(ColorRef::Fixed(Rgb {
        r: 0x80,
        g: 0x80,
        b: 0x80
      }))
    );
  }

  #[test]
  fn ignores_non_slidenum_fields() {
    let parsed = parse_shapes(XML_WITH_TEXT).unwrap();
    let date = parsed
      .shapes
      .iter()
      .find(|s| s.name.as_deref() == Some("Date"))
      .unwrap();
    // `datetime` フィールドは無視するので、キャッシュ済み表示文字列も `{index}` も content に現れない
    assert_eq!(date.text.content, "");
  }

  #[test]
  fn placeholder_text_shape_is_flagged_and_still_carries_its_text() {
    let parsed = parse_shapes(XML_WITH_TEXT).unwrap();
    let title = parsed
      .shapes
      .iter()
      .find(|s| s.name.as_deref() == Some("Title Placeholder"))
      .unwrap();
    assert!(title.is_placeholder);
    // テキストの取り込み自体はプレースホルダかどうかを問わない。
    // 候補への採否（除外）は呼び出し側（`heuristics::list_text_candidates`）の責務
    assert_eq!(title.text.content, "タイトルのプレースホルダテキスト");
  }

  #[test]
  fn text_parsing_is_deterministic() {
    let first = parse_shapes(XML_WITH_TEXT).unwrap();
    for _ in 0..5 {
      assert_eq!(parse_shapes(XML_WITH_TEXT).unwrap(), first);
    }
  }

  #[test]
  fn parse_is_deterministic() {
    let first = parse_shapes(XML).unwrap();
    for _ in 0..5 {
      assert_eq!(parse_shapes(XML).unwrap(), first);
    }
  }

  #[test]
  fn malformed_xml_is_an_error_not_a_panic() {
    assert!(matches!(
      parse_shapes("<p:sldMaster><p:cSld></p:sldMaster>"),
      Err(BrandError::Xml(_))
    ));
  }

  /// ブランドマーク候補向けの小図形（円・正方形）を持つ spTree（#346）
  const XML_WITH_MARKS: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Dot 1"/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="0" y="0"/><a:ext cx="100000" cy="100000"/></a:xfrm>
          <a:prstGeom prst="ellipse"/>
          <a:solidFill><a:srgbClr val="1F4E79"/></a:solidFill>
        </p:spPr>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Square 1"/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="200000" y="0"/><a:ext cx="100000" cy="100000"/></a:xfrm>
          <a:prstGeom prst="rect"/>
          <a:solidFill><a:srgbClr val="1F4E79"/></a:solidFill>
        </p:spPr>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sldMaster>"#;

  #[test]
  fn reads_prst_geom_for_ellipse_and_rect_shapes() {
    let parsed = parse_shapes(XML_WITH_MARKS).unwrap();
    let dot = parsed
      .shapes
      .iter()
      .find(|s| s.name.as_deref() == Some("Dot 1"))
      .unwrap();
    assert_eq!(dot.prst_geom.as_deref(), Some("ellipse"));
    let square = parsed
      .shapes
      .iter()
      .find(|s| s.name.as_deref() == Some("Square 1"))
      .unwrap();
    assert_eq!(square.prst_geom.as_deref(), Some("rect"));
  }
}
