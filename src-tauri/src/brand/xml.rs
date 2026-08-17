//! 各パーサが共有する XML 読み取りの土台（#167）。
//!
//! OOXML の名前空間接頭辞（`a:` / `p:`）は仕様上固定されないため、要素・属性はすべてローカル名で照合する。
//! 位置の判定は「親要素のパス」で行い、要素名の出現だけでは拾わない（同名要素が `a:fmtScheme` や
//! `p:cSld` 配下に大量に現れるため）。

use quick_xml::escape::unescape;
use quick_xml::events::{BytesStart, Event};
use quick_xml::name::QName;
use quick_xml::Reader;
use quick_xml::XmlVersion;

use super::color::{parse_hex, ColorRef, ColorSpec, ColorTransform};
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

/// `walk_elements_with_text` が巡回1件ごとに渡すノード。要素（開始・空要素）と文字データ（`a:t` 等）を
/// 同じ巡回で扱えるようにする（#318）。文字データを使わない既存の読み取り（`walk_elements`）は
/// `Element` だけを見ればよい
pub enum WalkNode<'a, 'b> {
  Element(&'a str, &'a BytesStart<'b>),
  /// 空白のみのテキストノード（要素間の整形用インデント等）は呼び出し側に渡さない（`trim` 済み）
  Text(&'a str),
}

/// 要素の開始（空要素を含む）とテキストノードを「親要素のパス・ノード」で前順に巡回する。
/// `stack[0]` はルート要素名で、`rel` はこの並びを前提にしている。
/// テキストノードの `stack` はそのノードを直接含む要素自身を末尾に持つ（要素の開始時点では
/// まだ自要素名が積まれていないのと対照的。文字データは要素の内容であって兄弟ではないため）
pub fn walk_elements_with_text(
  xml: &str,
  mut visit: impl FnMut(&[String], WalkNode<'_, '_>),
) -> Result<(), BrandError> {
  let mut reader = Reader::from_str(xml);
  // `trim_text(true)` は使わない: quick-xml は文字参照（`&#169;` 等）を `Event::Text` とは別の
  // `Event::GeneralRef` に分けて発行するため、実体参照に隣接するテキスト片の前後が「markup に
  // 隣接している」と判定されてしまい、参照の直後にある本来の空白（例: `&#169; 2026` の間の空白）まで
  // 削られる。空白のみのテキストノード（整形用インデント等）は下の `text.trim().is_empty()` で
  // 個別に読み飛ばすので、Reader 側の自動トリムは不要
  let mut stack: Vec<String> = Vec::new();
  loop {
    match reader.read_event() {
      Ok(Event::Eof) => return Ok(()),
      Ok(Event::Start(e)) => {
        let name = local_name(e.name());
        visit(&stack, WalkNode::Element(&name, &e));
        stack.push(name);
      }
      Ok(Event::Empty(e)) => {
        let name = local_name(e.name());
        visit(&stack, WalkNode::Element(&name, &e));
      }
      Ok(Event::Text(t)) => {
        // `decode()` は文字エンコーディングの変換のみで実体参照（`&amp;` 等）は展開しないため、
        // `unescape` を別途通す（属性値の `normalized_value` が内部で行っているのと同じ処理）
        let decoded = t.decode().map_err(|e| BrandError::Xml(e.to_string()))?;
        let text = unescape(&decoded).map_err(|e| BrandError::Xml(e.to_string()))?;
        if !text.trim().is_empty() {
          visit(&stack, WalkNode::Text(&text));
        }
      }
      // 文字参照・実体参照（`&#169;` / `&amp;` 等）。quick-xml は `Event::Text` に混ぜず
      // 独立したイベントとして発行するため、ここで文字へ解決してテキストの続きとして渡す
      Ok(Event::GeneralRef(r)) => {
        let name = r.decode().map_err(|e| BrandError::Xml(e.to_string()))?;
        let escaped = format!("&{name};");
        let resolved = unescape(&escaped).map_err(|e| BrandError::Xml(e.to_string()))?;
        visit(&stack, WalkNode::Text(&resolved));
      }
      Ok(Event::End(_)) => {
        stack.pop();
      }
      Ok(_) => {}
      Err(e) => return Err(BrandError::Xml(e.to_string())),
    }
  }
}

/// 要素の開始（空要素を含む）を「親要素のパス・自要素名・自要素」で前順に巡回する。
/// `stack[0]` はルート要素名で、`rel` はこの並びを前提にしている。
/// 文字データを見る必要が無い既存の読み取り（属性のみ）はすべてこちらを使う
/// （`walk_elements_with_text` の `Element` だけを通す薄いフィルタ）
pub fn walk_elements(
  xml: &str,
  mut visit: impl FnMut(&[String], &str, &BytesStart),
) -> Result<(), BrandError> {
  walk_elements_with_text(xml, |stack, node| {
    if let WalkNode::Element(name, e) = node {
      visit(stack, name, e);
    }
  })
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

/// パスが `prefix` から始まるなら、その後ろの相対パスを返す（`child_of` の「深さを問わない」版）
pub fn strip_path<'a>(path: &'a [String], prefix: &[&str]) -> Option<&'a [String]> {
  (path.len() >= prefix.len() && path[..prefix.len()] == *prefix).then(|| &path[prefix.len()..])
}

/// 「`containers` のいずれかの直下 1 段をシェイプ境界とし、境界からの相対パスで子要素を積む」走査を
/// 1 箇所に集約する（#334）。この形は slideMaster のロゴ・帯検出（`shapes.rs`）、slideLayout/slideMaster の
/// プレースホルダ書式・矩形抽出（`layout_xml.rs`/`master_xml.rs`）で共通して現れるが、`walk_elements` が
/// 渡すパスは要素名の並びだけで兄弟を区別できないため、これまで呼び出し側ごとに深さを手で数える
/// 副次状態（`Current` enum・`shape_depth: Option<usize>`）を書いていた
#[derive(Debug)]
pub struct ShapeCursor<'a> {
  containers: &'a [&'a str],
  boundary_depth: Option<usize>,
}

/// `ShapeCursor::observe` の結果
#[derive(Debug, PartialEq, Eq)]
pub enum ShapeEvent<'p> {
  /// `containers` のいずれかの直下 1 段（新しいシェイプの開始）。直前のシェイプの蓄積値は
  /// ここまでで確定しているため、呼び出し側はここで flush する
  Boundary,
  /// 直前の境界より深い位置。`inner` は境界要素自身を起点とした相対パス
  Inside(&'p [String]),
  /// まだ境界に到達していない（`containers` 配下に入る前の要素）
  Outside,
}

impl<'a> ShapeCursor<'a> {
  pub fn new(containers: &'a [&'a str]) -> Self {
    Self {
      containers,
      boundary_depth: None,
    }
  }

  /// 要素の親パス（`rel` 済み）を1つ観察する
  pub fn observe<'p>(&mut self, path: &'p [String]) -> ShapeEvent<'p> {
    if path
      .last()
      .is_some_and(|last| self.containers.contains(&last.as_str()))
    {
      self.boundary_depth = Some(path.len());
      return ShapeEvent::Boundary;
    }
    match self.boundary_depth {
      Some(depth) if path.len() > depth => ShapeEvent::Inside(&path[depth + 1..]),
      _ => ShapeEvent::Outside,
    }
  }
}

/// slideLayout（`layout_xml`）・slideMaster（`master_xml`）でプレースホルダを列挙する際のシェイプ境界。
/// `p:grpSp` 配下も個別のシェイプとして数える点で、`shapes.rs`（ロゴ・帯検出。`p:spTree` 直下のみ・
/// グループ非再帰）の境界とは異なる。両ファイルが同じ配列リテラルを書き写すと変更が同期しなくなるため、
/// この 1 箇所に集約する（#334）
pub const PLACEHOLDER_SHAPE_CONTAINERS: [&str; 2] = ["spTree", "grpSp"];

/// `inner`（シェイプ境界からの相対パス）が `p:txBody/a:lstStyle/a:lvl1pPr` 配下なら、
/// `a:lvl1pPr` 起点の相対パスを返す（#316）。`a:lvl2pPr` 以降は受け皿に対応する概念がないため対象外。
/// slideLayout のプレースホルダ（`layout_xml`）と slideMaster の固定テキスト図形（`shapes`。#318）が
/// 同じ形で `text_props::RawTextProps::visit` を呼ぶため、判定をこの1箇所に集約する
pub fn lvl1_style_rest(inner: &[String]) -> Option<&[String]> {
  let [tx_body, lst_style, lvl, rest @ ..] = inner else {
    return None;
  };
  (tx_body == "txBody" && lst_style == "lstStyle" && lvl == "lvl1pPr").then_some(rest)
}

/// `p:ph`（プレースホルダ宣言）を検出したら `type`/`idx` を返す。`p:nvSpPr`/`p:nvPicPr`/
/// `p:nvGraphicFramePr` 等、コンテナの種類を問わず `nvPr` 直下の `ph` だけを拾う（#317）。
/// `inner` は `ShapeCursor::observe` が返す `ShapeEvent::Inside` の相対パス。
/// slideLayout・slideMaster で同じ判定を手書きすると変更が同期しなくなるため、ここに1本化する
pub fn read_placeholder_marker(
  inner: &[String],
  name: &str,
  e: &BytesStart,
) -> Option<(Option<String>, Option<u32>)> {
  if name != "ph" || inner.last().map(String::as_str) != Some("nvPr") {
    return None;
  }
  Some((
    attr(e, "type"),
    attr(e, "idx").and_then(|v| v.trim().parse::<u32>().ok()),
  ))
}

/// `a:solidFill` 配下の色指定を積む。`inner` は `a:solidFill` を起点とした親要素の相対パスで、
/// `[]` なら基準色要素（`a:srgbClr` / `a:sysClr` / `a:schemeClr`）、1 段深ければ色変換
/// （`a:lumMod` / `a:lumOff` / `a:tint` / `a:shade`）として扱う。
///
/// 「単色塗り＝基準色＋変換の列」という OOXML の形の知識をこの 1 箇所に閉じる。背景（`layout_xml`）・
/// 図形の塗り（`shapes`）・文字色（`text_props`）で同じ構造が現れるため、読み取りを共有する
pub fn read_solid_fill(spec: &mut Option<ColorSpec>, inner: &[String], name: &str, e: &BytesStart) {
  if inner.is_empty() {
    if let Some(base) = base_color_ref(name, e) {
      *spec = Some(ColorSpec::new(base));
    }
    return;
  }
  if inner.len() == 1 {
    let transform = attr(e, "val").and_then(|v| ColorTransform::from_element(name, &v));
    if let (Some(transform), Some(spec)) = (transform, spec.as_mut()) {
      spec.transforms.push(transform);
    }
  }
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

  #[test]
  fn shape_cursor_reports_outside_before_the_first_boundary() {
    let mut cursor = ShapeCursor::new(&["spTree"]);
    assert_eq!(cursor.observe(&path(&["cSld"])), ShapeEvent::Outside);
  }

  #[test]
  fn shape_cursor_reports_boundary_then_relative_paths_inside() {
    let mut cursor = ShapeCursor::new(&["spTree"]);
    assert_eq!(
      cursor.observe(&path(&["cSld", "spTree"])),
      ShapeEvent::Boundary
    );
    assert_eq!(
      cursor.observe(&path(&["cSld", "spTree", "sp", "spPr", "xfrm"])),
      ShapeEvent::Inside(&path(&["spPr", "xfrm"]))
    );
  }

  #[test]
  fn shape_cursor_does_not_treat_unlisted_containers_as_boundaries() {
    // "grpSp" を containers に含めない場合、グループ配下の兄弟は境界にならず
    // 直前の境界（グループ自身）からの相対パスとして扱われる
    let mut cursor = ShapeCursor::new(&["spTree"]);
    assert_eq!(
      cursor.observe(&path(&["cSld", "spTree"])),
      ShapeEvent::Boundary
    );
    assert_eq!(
      cursor.observe(&path(&["cSld", "spTree", "grpSp"])),
      ShapeEvent::Inside(&path(&[]))
    );
  }

  #[test]
  fn shape_cursor_treats_every_listed_container_as_a_fresh_boundary() {
    let mut cursor = ShapeCursor::new(&["spTree", "grpSp"]);
    assert_eq!(
      cursor.observe(&path(&["cSld", "spTree"])),
      ShapeEvent::Boundary
    );
    assert_eq!(
      cursor.observe(&path(&["cSld", "spTree", "grpSp"])),
      ShapeEvent::Boundary
    );
    assert_eq!(
      cursor.observe(&path(&["cSld", "spTree", "grpSp", "sp", "nvSpPr", "nvPr"])),
      ShapeEvent::Inside(&path(&["nvSpPr", "nvPr"]))
    );
  }
}
