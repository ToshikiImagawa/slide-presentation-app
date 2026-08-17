//! `a:defRPr`（既定文字プロパティ）のパースと継承解決（#316）。
//!
//! `a:fontScheme` が Office 既定のまま（`latin` が汎用欧文書体・`ea` が空・`script="Jpan"` が Office 既定の
//! 和文書体）で、**実際に使われている書体は slideLayout のプレースホルダの `a:defRPr` にしか書かれていない**
//! 構成が成立する。テーマの書体スキームに触らず、プレースホルダ側だけ設定して作られたテンプレートで起きる。
//! そのため書体は `a:defRPr` 由来の実測値を `a:fontScheme` より優先する。
//!
//! 文字サイズ（`sz`）も同じ `a:defRPr` にあり、レイアウト種別ごとの型階層（表紙タイトル / 章タイトル /
//! 本文）が読み取れる。抽出元を slideLayout のプレースホルダにするのは、slideMaster の `p:txStyles` が
//! Office 既定値のまま＝全段同一サイズで手がかりにならない場合があるため。
//!
//! `+mj-lt` / `+mn-ea` のようなテーマ参照（`+` 始まり）は書体名ではないので取り込まない。取り込むと
//! fontScheme 由来の値が「プレースホルダに明示された書体」に見えてしまい、優先順位の判断が壊れる。

use quick_xml::events::BytesStart;

use super::color::{ColorSpec, Rgb};
use super::master_xml::{ClrMap, MasterInfo};
use super::theme_xml::{ClrScheme, FontFace, FontScheme, ThemeInfo};
use super::xml::{attr, read_solid_fill, strip_path};

/// `a:defRPr` の子として現れる書体指定（`a:latin` / `a:ea` / `a:cs`）。
/// `a:fontScheme` の `FontFace` と違い `script="Jpan"` の経路は無い（`a:defRPr` に script 別書体は現れない）
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RawFontFace {
  pub latin: Option<String>,
  pub ea: Option<String>,
  pub cs: Option<String>,
}

/// `a:defRPr` の実測値。色は clrMap → clrScheme を当てるまで未解決のまま持つ
#[derive(Debug, Clone, Default, PartialEq)]
pub struct RawTextProps {
  /// `a:defRPr@sz`（1/100pt）を実 pt へ直した値
  pub size_pt: Option<f64>,
  /// `a:defRPr@b`（太字）
  pub bold: Option<bool>,
  /// `a:defRPr/a:solidFill` の色指定
  pub color: Option<ColorSpec>,
  pub fonts: RawFontFace,
}

impl RawTextProps {
  /// `a:lvl1pPr` を起点とした親要素の相対パス（`inner`）を渡すと、`a:defRPr` 自身とその配下を振り分けて
  /// 取り込む。`a:defRPr` の入れ子構造の知識をこの型に閉じるための唯一の入口で、slideLayout の
  /// プレースホルダ（`layout_xml`）と slideMaster の `p:txStyles`（`master_xml`）が同じ形で呼ぶ
  pub fn visit(&mut self, inner: &[String], name: &str, e: &BytesStart) {
    match inner {
      [] if name == "defRPr" => self.read_attributes(e),
      [first, below @ ..] if first == "defRPr" => self.visit_child(below, name, e),
      _ => {}
    }
  }

  /// `a:defRPr` 自身の属性を読む
  fn read_attributes(&mut self, e: &BytesStart) {
    // sz は 1/100pt。0 以下は不正値として捨てる
    self.size_pt = attr(e, "sz")
      .and_then(|v| v.trim().parse::<f64>().ok())
      .filter(|v| *v > 0.0)
      .map(|v| v / 100.0);
    self.bold = attr(e, "b").as_deref().and_then(parse_xml_bool);
  }

  /// `a:defRPr` 配下の要素を取り込む。`inner` は `a:defRPr` を起点とした親要素の相対パス
  fn visit_child(&mut self, inner: &[String], name: &str, e: &BytesStart) {
    if let Some(rest) = strip_path(inner, &["solidFill"]) {
      read_solid_fill(&mut self.color, rest, name, e);
      return;
    }
    if !inner.is_empty() {
      return;
    }
    // `+mj-lt` 等のテーマ参照は書体名ではないため取り込まない
    let Some(typeface) = attr(e, "typeface").filter(|v| !v.is_empty() && !v.starts_with('+'))
    else {
      return;
    };
    match name {
      "latin" => self.fonts.latin = Some(typeface),
      "ea" => self.fonts.ea = Some(typeface),
      "cs" => self.fonts.cs = Some(typeface),
      _ => {}
    }
  }

  /// 受け皿（`FontFamilySpec` の latin/ea）へ写る書体が明示されているか。`a:cs` は受け皿に写さないため
  /// 根拠には数えない（数えると「defRPr 由来」と報告した書体が実際は fontScheme 由来になりうる）
  fn has_typeface(&self) -> bool {
    self.fonts.latin.is_some() || self.fonts.ea.is_some()
  }

  /// `a:defRPr/a:solidFill` の色を clrMap → clrScheme の 2 段で確定させる。
  /// slideMaster の `p:txStyles`（`brand::resolve_text_style`）とプレースホルダで同じ経路を通す
  pub fn resolve_color(&self, scheme: &ClrScheme, map: &ClrMap) -> Option<Rgb> {
    self
      .color
      .as_ref()
      .and_then(|spec| super::resolve_color_spec(spec, scheme, map))
  }
}

/// OOXML の boolean 属性（`1`/`0`/`true`/`false`）。それ以外は指定なし扱い
fn parse_xml_bool(value: &str) -> Option<bool> {
  match value.trim() {
    "1" | "true" => Some(true),
    "0" | "false" => Some(false),
    _ => None,
  }
}

/// 書体の決定根拠（#316）。`a:fontScheme` は Office 既定値のまま（作者が触っていない）ことが多く、
/// 値が入っていても正しいとは限らない。どちらを採ったかを取り込みレポートに出せるように区別する
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, serde::Serialize)]
pub enum FontOrigin {
  /// 書体がどこからも取れなかった
  #[default]
  #[serde(rename = "none")]
  None,
  /// `a:fontScheme`（テーマの書体スキーム）由来
  #[serde(rename = "fontScheme")]
  FontScheme,
  /// `a:defRPr`（プレースホルダ / slideMaster の `p:txStyles`）に明示された実測値由来
  #[serde(rename = "defRPr")]
  DefRpr,
}

/// プレースホルダ種別（`p:ph@type`）から決まる継承元の系統（#316）。OOXML では表題系のプレースホルダが
/// `p:titleStyle` + `a:majorFont`、本文系が `p:bodyStyle` + `a:minorFont`、その他（ページ番号・フッタ等）が
/// `p:otherStyle` + `a:minorFont` を継承する。
///
/// この分類（`ST_PlaceholderType` の知識と「属性省略時は body」という既定）は抽出層にだけ置き、
/// 結果を JSON に載せてフロントへ渡す（フロントが `ph@type` から分類し直すと 2 言語で二重管理になる）
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PlaceholderKind {
  Title,
  /// 属性省略時の既定（ECMA-376 の `ST_PlaceholderType` の既定値が "body"）
  #[default]
  Body,
  Other,
}

impl PlaceholderKind {
  pub fn of(ph_type: Option<&str>) -> Self {
    match ph_type.unwrap_or("body") {
      "title" | "ctrTitle" => Self::Title,
      "body" | "subTitle" | "obj" => Self::Body,
      _ => Self::Other,
    }
  }

  /// 継承元（slideMaster の `p:txStyles` の段と theme の書体組）を選ぶ
  fn sources<'a>(
    self,
    master: &'a MasterInfo,
    fonts: &'a FontScheme,
  ) -> (&'a RawTextProps, &'a FontFace) {
    match self {
      Self::Title => (&master.title, &fonts.major),
      Self::Body => (&master.body, &fonts.minor),
      Self::Other => (&master.other, &fonts.minor),
    }
  }
}

/// プレースホルダ 1 件の既定文字プロパティ（継承解決済み）。色は `#rrggbb` に確定させる
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaceholderTextProps {
  /// 欧文書体
  pub latin: Option<String>,
  /// 和文書体（theme 側は `script="Jpan"` を `a:ea` より優先してここへ寄せる）
  pub ea: Option<String>,
  /// Complex Script 書体
  pub cs: Option<String>,
  /// 文字サイズ（pt）
  pub size_pt: Option<f64>,
  pub bold: Option<bool>,
  /// 解決済みの文字色
  pub color_hex: Option<String>,
  pub font_origin: FontOrigin,
}

/// プレースホルダ 1 件の実効値を OOXML の継承順で求める（#316）。
///
/// 解決順は「プレースホルダの `a:lstStyle`（slideLayout）→ slideMaster の `p:txStyles` → theme の
/// `a:fontScheme`」で、**項目ごとに独立して解決する**（サイズだけ layout・書体は master のような混在も
/// 正しく解ける）。継承元の段（titleStyle / bodyStyle / otherStyle）と書体組（majorFont / minorFont）は
/// `kind` から選ぶ。`color_map` はその layout の実効写像（`p:clrMapOvr` があればそれ）を渡す。
///
/// `font_origin` は latin / ea のいずれかが `a:defRPr` 由来なら `DefRpr` にする。テンプレート作者が
/// 明示的に書いた場所があるかどうかが、取り込みの信頼度の判断基準になる。
pub fn resolve(
  placeholder: &RawTextProps,
  kind: PlaceholderKind,
  master: &MasterInfo,
  theme: &ThemeInfo,
  color_map: &ClrMap,
) -> PlaceholderTextProps {
  let (master_style, theme_face) = kind.sources(master, &theme.fonts);
  let inherit = |ph: &Option<String>, ma: &Option<String>| ph.clone().or_else(|| ma.clone());
  // `a:ea` が空でも `script="Jpan"` から和文書体を拾える（theme_xml と同じ扱い）
  let theme_ea = || theme_face.jpan.clone().or_else(|| theme_face.ea.clone());
  let latin = inherit(&placeholder.fonts.latin, &master_style.fonts.latin)
    .or_else(|| theme_face.latin.clone());
  let ea = inherit(&placeholder.fonts.ea, &master_style.fonts.ea).or_else(theme_ea);
  let cs = inherit(&placeholder.fonts.cs, &master_style.fonts.cs).or_else(|| theme_face.cs.clone());

  // 実測値（defRPr）が無ければ、上で解決した値は theme（fontScheme）由来そのもの
  let font_origin = if placeholder.has_typeface() || master_style.has_typeface() {
    FontOrigin::DefRpr
  } else if latin.is_some() || ea.is_some() {
    FontOrigin::FontScheme
  } else {
    FontOrigin::None
  };

  PlaceholderTextProps {
    latin,
    ea,
    cs,
    size_pt: placeholder.size_pt.or(master_style.size_pt),
    bold: placeholder.bold.or(master_style.bold),
    color_hex: placeholder
      .resolve_color(&theme.colors, color_map)
      .or_else(|| master_style.resolve_color(&theme.colors, color_map))
      .map(Rgb::to_hex),
    font_origin,
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::brand::color::{ColorRef, ColorTransform};
  use crate::brand::xml::{rel, walk_elements};

  /// `a:defRPr` 1 つから `RawTextProps` を組み立てる。`layout_xml` / `master_xml` と同じ入口
  /// （`RawTextProps::visit`）を通すので、本番の呼び出しとずれない。
  /// `rel` がルート要素を落とすため、実物と同じく `a:lvl1pPr` で包んでから走査する
  fn parse_def_rpr(def_rpr: &str) -> RawTextProps {
    let xml = format!(r#"<a:lvl1pPr xmlns:a="a">{def_rpr}</a:lvl1pPr>"#);
    let mut props = RawTextProps::default();
    walk_elements(&xml, |stack, name, e| props.visit(rel(stack), name, e)).unwrap();
    props
  }

  fn scheme() -> ClrScheme {
    ClrScheme {
      dk1: Some(Rgb { r: 0, g: 0, b: 0 }),
      lt1: Some(Rgb {
        r: 0xff,
        g: 0xff,
        b: 0xff,
      }),
      accent1: Some(Rgb {
        r: 0x1f,
        g: 0x4e,
        b: 0x79,
      }),
      ..ClrScheme::default()
    }
  }

  fn face(latin: Option<&str>, ea: Option<&str>, jpan: Option<&str>) -> FontFace {
    FontFace {
      latin: latin.map(str::to_string),
      ea: ea.map(str::to_string),
      cs: None,
      jpan: jpan.map(str::to_string),
    }
  }

  /// `a:fontScheme` が Office 既定のまま（欧文が汎用書体・`ea` が空・`script="Jpan"` が Office 既定の
  /// 和文書体）の theme。実書体が `a:defRPr` にしか無いテンプレートを再現するための土台
  fn office_default_theme() -> ThemeInfo {
    ThemeInfo {
      name: None,
      colors: scheme(),
      fonts: FontScheme {
        major: face(Some("Calibri Light"), None, Some("游ゴシック Light")),
        minor: face(Some("Calibri"), None, Some("游ゴシック")),
      },
    }
  }

  /// 書体スキームを持たない theme（書体がどこからも取れないケース）
  fn theme_without_fonts() -> ThemeInfo {
    ThemeInfo {
      name: None,
      colors: scheme(),
      fonts: FontScheme::default(),
    }
  }

  fn master(title: RawTextProps, body: RawTextProps) -> MasterInfo {
    MasterInfo {
      title,
      body,
      ..MasterInfo::default()
    }
  }

  #[test]
  fn placeholder_def_rpr_wins_over_master_and_font_scheme() {
    // 継承の解決順: プレースホルダ（layout）→ slideMaster の txStyles → theme の fontScheme
    let placeholder = parse_def_rpr(
      r#"<a:defRPr sz="4000" b="1"><a:latin typeface="Corporate Display"/><a:ea typeface="コーポレート見出し"/></a:defRPr>"#,
    );
    let title_style = parse_def_rpr(
      r#"<a:defRPr sz="2800"><a:latin typeface="Master Sans"/><a:cs typeface="Master CS"/></a:defRPr>"#,
    );
    let resolved = resolve(
      &placeholder,
      PlaceholderKind::Title,
      &master(title_style, RawTextProps::default()),
      &office_default_theme(),
      &ClrMap::default(),
    );
    assert_eq!(resolved.latin.as_deref(), Some("Corporate Display"));
    assert_eq!(resolved.ea.as_deref(), Some("コーポレート見出し"));
    // プレースホルダに無い cs は master から、どちらにも無ければ theme から埋まる（項目ごとに独立して解決する）
    assert_eq!(resolved.cs.as_deref(), Some("Master CS"));
    assert_eq!(resolved.size_pt, Some(40.0));
    assert_eq!(resolved.bold, Some(true));
    assert_eq!(resolved.font_origin, FontOrigin::DefRpr);
  }

  #[test]
  fn master_tx_styles_fill_in_what_the_placeholder_omits() {
    let placeholder = parse_def_rpr(r#"<a:defRPr b="0"/>"#);
    let title_style =
      parse_def_rpr(r#"<a:defRPr sz="1800"><a:latin typeface="Master Sans"/></a:defRPr>"#);
    let resolved = resolve(
      &placeholder,
      PlaceholderKind::Title,
      &master(title_style, RawTextProps::default()),
      &office_default_theme(),
      &ClrMap::default(),
    );
    assert_eq!(resolved.latin.as_deref(), Some("Master Sans"));
    assert_eq!(resolved.size_pt, Some(18.0));
    // プレースホルダ側の明示（b="0"）は master より優先される
    assert_eq!(resolved.bold, Some(false));
    // 和文は defRPr のどちらにも無いので theme の script="Jpan" から埋まる
    assert_eq!(resolved.ea.as_deref(), Some("游ゴシック Light"));
    assert_eq!(resolved.font_origin, FontOrigin::DefRpr);
  }

  #[test]
  fn kind_selects_the_matching_tx_style_and_font_scheme_slot() {
    // 表題系は titleStyle + majorFont、本文系は bodyStyle + minorFont を継承する
    let title_style = parse_def_rpr(r#"<a:defRPr sz="4400"/>"#);
    let body_style = parse_def_rpr(r#"<a:defRPr sz="1800"/>"#);
    let master = master(title_style, body_style);

    let title = resolve(
      &RawTextProps::default(),
      PlaceholderKind::Title,
      &master,
      &office_default_theme(),
      &ClrMap::default(),
    );
    assert_eq!(title.size_pt, Some(44.0));
    assert_eq!(title.latin.as_deref(), Some("Calibri Light"));

    let body = resolve(
      &RawTextProps::default(),
      PlaceholderKind::Body,
      &master,
      &office_default_theme(),
      &ClrMap::default(),
    );
    assert_eq!(body.size_pt, Some(18.0));
    assert_eq!(body.latin.as_deref(), Some("Calibri"));
    assert_eq!(body.ea.as_deref(), Some("游ゴシック"));
  }

  #[test]
  fn placeholder_kind_defaults_to_body_when_the_type_attribute_is_absent() {
    // ECMA-376 の `ST_PlaceholderType` の既定値は "body"
    assert_eq!(PlaceholderKind::of(None), PlaceholderKind::Body);
    assert_eq!(
      PlaceholderKind::of(Some("ctrTitle")),
      PlaceholderKind::Title
    );
    assert_eq!(PlaceholderKind::of(Some("subTitle")), PlaceholderKind::Body);
    assert_eq!(PlaceholderKind::of(Some("sldNum")), PlaceholderKind::Other);
  }

  #[test]
  fn theme_reference_typefaces_do_not_count_as_measured_values() {
    // `+mj-lt` / `+mn-ea` は書体名ではなくテーマ参照。取り込むと fontScheme 由来の値が
    // 「プレースホルダに明示された書体」に見えてしまう
    let placeholder = parse_def_rpr(
      r#"<a:defRPr sz="2000"><a:latin typeface="+mj-lt"/><a:ea typeface="+mj-ea"/></a:defRPr>"#,
    );
    let resolved = resolve(
      &placeholder,
      PlaceholderKind::Title,
      &MasterInfo::default(),
      &office_default_theme(),
      &ClrMap::default(),
    );
    assert_eq!(resolved.latin.as_deref(), Some("Calibri Light"));
    assert_eq!(resolved.ea.as_deref(), Some("游ゴシック Light"));
    assert_eq!(resolved.font_origin, FontOrigin::FontScheme);
    // サイズは実測値なので残る（書体の根拠とは独立）
    assert_eq!(resolved.size_pt, Some(20.0));
  }

  #[test]
  fn complex_script_only_def_rpr_is_not_reported_as_a_measured_font() {
    // `a:cs` は受け皿（latin/ea）に写らないため、これだけを明示した defRPr は書体の根拠にしない
    let placeholder = parse_def_rpr(r#"<a:defRPr><a:cs typeface="Complex Only"/></a:defRPr>"#);
    let resolved = resolve(
      &placeholder,
      PlaceholderKind::Title,
      &MasterInfo::default(),
      &office_default_theme(),
      &ClrMap::default(),
    );
    assert_eq!(resolved.cs.as_deref(), Some("Complex Only"));
    assert_eq!(resolved.latin.as_deref(), Some("Calibri Light"));
    assert_eq!(resolved.font_origin, FontOrigin::FontScheme);
  }

  #[test]
  fn scheme_color_is_resolved_through_the_clr_map() {
    // `schemeClr val="tx1"` は clrMap（tx1=lt1 の反転写像）→ clrScheme の 2 段で解決する。
    // 写像を飛ばすと文字色が反転する
    let placeholder =
      parse_def_rpr(r#"<a:defRPr><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:defRPr>"#);
    let inverted = ClrMap {
      tx1: "lt1".to_string(),
      ..ClrMap::default()
    };
    let resolved = resolve(
      &placeholder,
      PlaceholderKind::Title,
      &MasterInfo::default(),
      &theme_without_fonts(),
      &inverted,
    );
    assert_eq!(resolved.color_hex.as_deref(), Some("#ffffff"));

    // 標準写像（tx1=dk1）なら同じ参照が黒になる
    let resolved = resolve(
      &placeholder,
      PlaceholderKind::Title,
      &MasterInfo::default(),
      &theme_without_fonts(),
      &ClrMap::default(),
    );
    assert_eq!(resolved.color_hex.as_deref(), Some("#000000"));
  }

  #[test]
  fn scheme_color_transforms_are_applied_in_document_order() {
    let placeholder = parse_def_rpr(
      r#"<a:defRPr><a:solidFill><a:schemeClr val="accent1"><a:lumMod val="75000"/><a:lumOff val="25000"/></a:schemeClr></a:solidFill></a:defRPr>"#,
    );
    assert_eq!(
      placeholder.color.as_ref().map(|c| c.base.clone()),
      Some(ColorRef::Scheme("accent1".to_string()))
    );
    assert_eq!(
      placeholder.color.as_ref().map(|c| c.transforms.clone()),
      Some(vec![
        ColorTransform::LumMod(0.75),
        ColorTransform::LumOff(0.25)
      ])
    );
    let resolved = resolve(
      &placeholder,
      PlaceholderKind::Title,
      &MasterInfo::default(),
      &theme_without_fonts(),
      &ClrMap::default(),
    );
    // accent1（#1f4e79）を明るくした色になる（基準色そのままではない）
    let hex = resolved.color_hex.expect("color");
    assert_ne!(hex, "#1f4e79");
    assert!(hex.starts_with('#') && hex.len() == 7);
  }

  #[test]
  fn falls_back_to_the_font_scheme_when_nothing_is_measured() {
    // 既定値のみ（defRPr がどこにも無い）のケース: 書体は fontScheme 由来、サイズ・太字・色は無い
    let resolved = resolve(
      &RawTextProps::default(),
      PlaceholderKind::Title,
      &MasterInfo::default(),
      &office_default_theme(),
      &ClrMap::default(),
    );
    assert_eq!(resolved.latin.as_deref(), Some("Calibri Light"));
    assert_eq!(resolved.ea.as_deref(), Some("游ゴシック Light"));
    assert_eq!(resolved.size_pt, None);
    assert_eq!(resolved.bold, None);
    assert_eq!(resolved.color_hex, None);
    assert_eq!(resolved.font_origin, FontOrigin::FontScheme);
  }

  #[test]
  fn font_origin_is_none_when_even_the_font_scheme_is_empty() {
    let resolved = resolve(
      &RawTextProps::default(),
      PlaceholderKind::Title,
      &MasterInfo::default(),
      &theme_without_fonts(),
      &ClrMap::default(),
    );
    assert_eq!(resolved.latin, None);
    assert_eq!(resolved.font_origin, FontOrigin::None);
  }

  #[test]
  fn invalid_size_and_bold_values_are_ignored() {
    let props = parse_def_rpr(r#"<a:defRPr sz="0" b="maybe"/>"#);
    assert_eq!(props.size_pt, None);
    assert_eq!(props.bold, None);
    let props = parse_def_rpr(r#"<a:defRPr sz="-1200"/>"#);
    assert_eq!(props.size_pt, None);
  }

  #[test]
  fn resolve_is_deterministic() {
    let placeholder = parse_def_rpr(
      r#"<a:defRPr sz="3200" b="1"><a:latin typeface="Corporate Display"/><a:solidFill><a:schemeClr val="accent1"><a:lumMod val="60000"/></a:schemeClr></a:solidFill></a:defRPr>"#,
    );
    let first = resolve(
      &placeholder,
      PlaceholderKind::Title,
      &MasterInfo::default(),
      &office_default_theme(),
      &ClrMap::default(),
    );
    for _ in 0..5 {
      assert_eq!(
        resolve(
          &placeholder,
          PlaceholderKind::Title,
          &MasterInfo::default(),
          &office_default_theme(),
          &ClrMap::default(),
        ),
        first
      );
    }
  }
}
