//! theme part（`a:theme` = theme1.xml）のパーサ（#167）。
//!
//! 取るのは `a:clrScheme` の 12 スロットと `a:fontScheme` の書体名だけ。`a:fmtScheme`（図形の既定塗り）や
//! `a:extraClrSchemeLst` にも同名の色要素が現れるため、要素名の出現だけで拾わずパスで位置を確定させる。
//!
//! 和文書体は `a:ea@typeface` と `a:font script="Jpan"@typeface` の 2 箇所に分かれて入り、
//! テンプレートによってどちらか一方しか書かれていないため両方を拾う（目視転写で必ず落ちる情報）。

use quick_xml::events::BytesStart;

use super::color::{ColorRef, Rgb};
use super::xml::{attr, base_color_ref, child_of, rel, walk_elements};
use super::BrandError;

/// `a:clrScheme` の 12 スロット。キー名と並びは OOXML の定義順（dk1/lt1/dk2/lt2/accent1-6/hlink/folHlink）に揃える。
/// 値が取れなかったスロットは `null` として残す（#168 の並置比較で「欠落」を項目単位に出せるようにする）
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClrScheme {
  pub dk1: Option<Rgb>,
  pub lt1: Option<Rgb>,
  pub dk2: Option<Rgb>,
  pub lt2: Option<Rgb>,
  pub accent1: Option<Rgb>,
  pub accent2: Option<Rgb>,
  pub accent3: Option<Rgb>,
  pub accent4: Option<Rgb>,
  pub accent5: Option<Rgb>,
  pub accent6: Option<Rgb>,
  pub hlink: Option<Rgb>,
  pub fol_hlink: Option<Rgb>,
}

impl ClrScheme {
  /// スロット名で色を引く。`light1`/`dark1` 等の別名も同じスロットに寄せる
  /// （`a:schemeClr@val` には両方の綴りが現れる）。clrMap を通した後の名前を渡すこと
  pub fn slot(&self, name: &str) -> Option<Rgb> {
    match name {
      "dk1" | "dark1" => self.dk1,
      "lt1" | "light1" => self.lt1,
      "dk2" | "dark2" => self.dk2,
      "lt2" | "light2" => self.lt2,
      "accent1" => self.accent1,
      "accent2" => self.accent2,
      "accent3" => self.accent3,
      "accent4" => self.accent4,
      "accent5" => self.accent5,
      "accent6" => self.accent6,
      "hlink" => self.hlink,
      "folHlink" => self.fol_hlink,
      _ => None,
    }
  }

  /// スロット名に色を書き込む。未知のスロット名は無視する
  fn set(&mut self, name: &str, color: Rgb) {
    let target = match name {
      "dk1" => &mut self.dk1,
      "lt1" => &mut self.lt1,
      "dk2" => &mut self.dk2,
      "lt2" => &mut self.lt2,
      "accent1" => &mut self.accent1,
      "accent2" => &mut self.accent2,
      "accent3" => &mut self.accent3,
      "accent4" => &mut self.accent4,
      "accent5" => &mut self.accent5,
      "accent6" => &mut self.accent6,
      "hlink" => &mut self.hlink,
      "folHlink" => &mut self.fol_hlink,
      _ => return,
    };
    *target = Some(color);
  }
}

/// 書体の 1 組（`a:majorFont` = 見出し / `a:minorFont` = 本文）
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FontFace {
  /// `a:latin@typeface`（欧文）
  pub latin: Option<String>,
  /// `a:ea@typeface`（East Asian。和文が入るがテンプレートによっては空）
  pub ea: Option<String>,
  /// `a:cs@typeface`（Complex Script）
  pub cs: Option<String>,
  /// `a:font script="Jpan"@typeface`（`ea` が空でも和文書体を拾える経路）
  pub jpan: Option<String>,
}

/// `a:fontScheme` の見出し/本文の書体
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FontScheme {
  pub major: FontFace,
  pub minor: FontFace,
}

/// theme part から抽出した内容
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ThemeInfo {
  /// `a:theme@name`（テンプレート名。UI の表示と `theme/<slug>.json` の命名に使う）
  pub name: Option<String>,
  pub colors: ClrScheme,
  pub fonts: FontScheme,
}

/// theme XML をパースする。位置が合わない同名要素は無視するため、未知の拡張が混ざっても結果は変わらない
pub fn parse(xml: &str) -> Result<ThemeInfo, BrandError> {
  let mut info = ThemeInfo::default();
  walk_elements(xml, |stack, name, e| {
    // ルート要素（a:theme / a:themeOverride）の属性から名前を取る
    if stack.is_empty() {
      info.name = attr(e, "name").filter(|v| !v.is_empty());
    }
    visit(&mut info, stack, name, e);
  })?;
  Ok(info)
}

/// 親要素のパス（`stack`）と自要素名から、拾う位置に一致するものだけを取り込む
fn visit(info: &mut ThemeInfo, stack: &[String], name: &str, e: &BytesStart) {
  let parent = rel(stack);

  // themeElements/clrScheme/<スロット>/srgbClr|sysClr
  if let Some(slot) = child_of(parent, &["themeElements", "clrScheme"]) {
    // スロット直下は確定色のみ（schemeClr は現れない）
    if let Some(ColorRef::Fixed(color)) = base_color_ref(name, e) {
      info.colors.set(slot, color);
    }
    return;
  }

  // themeElements/fontScheme/majorFont|minorFont/latin|ea|cs|font
  if let Some(font_kind) = child_of(parent, &["themeElements", "fontScheme"]) {
    let face = match font_kind {
      "majorFont" => &mut info.fonts.major,
      "minorFont" => &mut info.fonts.minor,
      _ => return,
    };
    let Some(typeface) = attr(e, "typeface").filter(|v| !v.is_empty()) else {
      return;
    };
    match name {
      "latin" => face.latin = Some(typeface),
      "ea" => face.ea = Some(typeface),
      "cs" => face.cs = Some(typeface),
      // script 別の追加書体。和文（Jpan）だけを拾う
      "font" if attr(e, "script").as_deref() == Some("Jpan") => face.jpan = Some(typeface),
      _ => {}
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  /// 実物の theme1.xml と同じ入れ子（fmtScheme・extraClrSchemeLst のノイズ入り）を最小構成で再現する
  const THEME_XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Parcel">
  <a:themeElements>
    <a:clrScheme name="Parcel">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="4A5356"/></a:dk2>
      <a:lt2><a:srgbClr val="E8E3CE"/></a:lt2>
      <a:accent1><a:srgbClr val="F6A21D"/></a:accent1>
      <a:accent2><a:srgbClr val="FE7A61"/></a:accent2>
      <a:accent3><a:srgbClr val="A796B4"/></a:accent3>
      <a:accent4><a:srgbClr val="6BB1C9"/></a:accent4>
      <a:accent5><a:srgbClr val="9BB55B"/></a:accent5>
      <a:accent6><a:srgbClr val="D3AE4F"/></a:accent6>
      <a:hlink><a:srgbClr val="00B0F0"/></a:hlink>
      <a:folHlink><a:srgbClr val="738F97"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Parcel">
      <a:majorFont>
        <a:latin typeface="Trebuchet MS"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
        <a:font script="Jpan" typeface="ヒラギノ角ゴ ProN W3"/>
        <a:font script="Hang" typeface="맑은 고딕"/>
      </a:majorFont>
      <a:minorFont>
        <a:latin typeface="Trebuchet MS"/>
        <a:ea typeface="游ゴシック"/>
        <a:cs typeface="Arial"/>
      </a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Office">
      <a:fillStyleLst>
        <a:solidFill><a:srgbClr val="DEADBE"/></a:solidFill>
      </a:fillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
  <a:extraClrSchemeLst>
    <a:extraClrScheme>
      <a:clrScheme name="other">
        <a:dk1><a:srgbClr val="123456"/></a:dk1>
        <a:accent1><a:srgbClr val="654321"/></a:accent1>
      </a:clrScheme>
    </a:extraClrScheme>
  </a:extraClrSchemeLst>
</a:theme>"#;

  #[test]
  fn parses_all_12_color_slots() {
    let info = parse(THEME_XML).unwrap();
    let hex = |slot: &str| info.colors.slot(slot).map(Rgb::to_hex);
    // sysClr は lastClr（実効値）を採る。val="windowText" のままでは色にならない
    assert_eq!(hex("dk1").as_deref(), Some("#000000"));
    assert_eq!(hex("lt1").as_deref(), Some("#ffffff"));
    assert_eq!(hex("dk2").as_deref(), Some("#4a5356"));
    assert_eq!(hex("lt2").as_deref(), Some("#e8e3ce"));
    assert_eq!(hex("accent1").as_deref(), Some("#f6a21d"));
    assert_eq!(hex("accent2").as_deref(), Some("#fe7a61"));
    assert_eq!(hex("accent3").as_deref(), Some("#a796b4"));
    assert_eq!(hex("accent4").as_deref(), Some("#6bb1c9"));
    assert_eq!(hex("accent5").as_deref(), Some("#9bb55b"));
    assert_eq!(hex("accent6").as_deref(), Some("#d3ae4f"));
    assert_eq!(hex("hlink").as_deref(), Some("#00b0f0"));
    assert_eq!(hex("folHlink").as_deref(), Some("#738f97"));
  }

  #[test]
  fn ignores_colors_outside_theme_elements_clr_scheme() {
    let info = parse(THEME_XML).unwrap();
    // extraClrSchemeLst の dk1（#123456）や fmtScheme の塗り（#deadbe）に上書きされていない
    assert_eq!(info.colors.dk1.map(Rgb::to_hex).as_deref(), Some("#000000"));
    assert_eq!(
      info.colors.accent1.map(Rgb::to_hex).as_deref(),
      Some("#f6a21d")
    );
  }

  #[test]
  fn parses_font_scheme_including_jpan_script() {
    let info = parse(THEME_XML).unwrap();
    assert_eq!(info.name.as_deref(), Some("Parcel"));
    assert_eq!(info.fonts.major.latin.as_deref(), Some("Trebuchet MS"));
    // typeface="" は書体名として無意味なので None のまま残す
    assert_eq!(info.fonts.major.ea, None);
    assert_eq!(info.fonts.major.cs, None);
    // ea が空でも script="Jpan" から和文書体を拾える
    assert_eq!(
      info.fonts.major.jpan.as_deref(),
      Some("ヒラギノ角ゴ ProN W3")
    );
    assert_eq!(info.fonts.minor.ea.as_deref(), Some("游ゴシック"));
    assert_eq!(info.fonts.minor.cs.as_deref(), Some("Arial"));
    // Jpan 以外の script は拾わない
    assert_eq!(info.fonts.minor.jpan, None);
  }

  #[test]
  fn slot_accepts_light_dark_aliases() {
    let info = parse(THEME_XML).unwrap();
    assert_eq!(info.colors.slot("light1"), info.colors.slot("lt1"));
    assert_eq!(info.colors.slot("dark2"), info.colors.slot("dk2"));
    assert_eq!(info.colors.slot("phClr"), None);
  }

  #[test]
  fn malformed_xml_is_an_error_not_a_panic() {
    assert!(matches!(
      parse("<a:theme><a:themeElements></a:theme>"),
      Err(BrandError::Xml(_))
    ));
  }

  #[test]
  fn parse_is_deterministic() {
    let first = parse(THEME_XML).unwrap();
    for _ in 0..5 {
      assert_eq!(parse(THEME_XML).unwrap(), first);
    }
  }
}
