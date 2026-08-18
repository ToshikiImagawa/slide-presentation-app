//! 配布された OOXML テンプレート（`.pptx` / `.potx` / `.thmx`）からブランド情報を抽出する（#167 / #168）。
//!
//! 目視転写では構造的に落ちる情報（`p:clrMap` の `bg1`/`tx1` 割当、`a:font script="Jpan"` の和文書体、
//! `p:txStyles/…/a:defRPr@sz` の実 pt）を XML として読む。バイナリ読取は権限方針上 Rust 側に閉じる。
//!
//! - 12 キー・書体名・pt は決定的抽出（#167）。同一入力から必ず同一出力になる
//!   （ネットワーク・時刻・乱数・`HashMap` の走査順に依存しない）。
//! - ロゴ候補・帯候補（`logo_candidates` / `band_candidates`）はヒューリスティクス（#168）の出力で、
//!   誤爆しうる前提の**候補**にすぎない。採否・上書きは並置比較ダイアログで人が決める（自動確定しない）。
//! - 出力は宣言的データ（12 キーの色・書体名・pt・候補の幾何と画像バイト列）のみで、
//!   **生成 CSS 文字列は含めない**（Epic #173 の方針）。受け皿（`ThemeData` の `colors` / `fonts` / `tokens` /
//!   `masters`）へ写すのは呼び出し側（フロントの `compile()`）の責務。

use std::fs::File;
use std::io::{BufReader, Read, Seek};
use std::path::Path;

mod color;
mod eot;
mod heuristics;
mod layout_xml;
mod master_xml;
mod opc;
mod shapes;
mod text_props;
mod theme_xml;
mod xml;

use color::{apply_transforms, ColorRef, ColorSpec, Rgb};
use master_xml::{ClrMap, MasterInfo};
use opc::{EmbeddedFont, OpcPackage, SlideSize};
use shapes::RawXfrm;
use text_props::{PlaceholderKind, PlaceholderTextProps, RawTextProps};
use theme_xml::{ClrScheme, FontScheme, ThemeInfo};

/// 抽出エラー。UI へは `to_string()` で返すため、内部パス等を含めない
#[derive(Debug)]
pub enum BrandError {
  /// ファイルが開けない・読めない
  Io(String),
  /// zip として壊れている（暗号化・非対応の圧縮方式を含む）
  Archive(String),
  /// 上限（ファイルサイズ / エントリ数 / part サイズ）を超えた
  TooLarge(String),
  /// zip エントリ名が part 名として不正（絶対パス・`..` 等）
  UnsafePath(String),
  /// 必須の part が無い
  MissingPart(String),
  /// XML として壊れている
  Xml(String),
}

impl std::fmt::Display for BrandError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      BrandError::Io(msg) => write!(f, "テンプレートを読み込めません: {msg}"),
      BrandError::Archive(msg) => write!(f, "テンプレートの形式が不正です: {msg}"),
      BrandError::TooLarge(msg) => write!(f, "テンプレートが大きすぎます: {msg}"),
      BrandError::UnsafePath(name) => write!(
        f,
        "テンプレートに不正なパスのエントリが含まれています: {name}"
      ),
      BrandError::MissingPart(part) => write!(f, "テンプレートに必要な要素がありません: {part}"),
      BrandError::Xml(msg) => write!(f, "テンプレートの XML が不正です: {msg}"),
    }
  }
}

impl std::error::Error for BrandError {}

/// `p:clrMap` を適用した 12 キーの色。受け皿（`theme/<slug>.json` の 12 キー）が実際に使う値
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MappedColors {
  pub bg1: Option<Rgb>,
  pub tx1: Option<Rgb>,
  pub bg2: Option<Rgb>,
  pub tx2: Option<Rgb>,
  pub accent1: Option<Rgb>,
  pub accent2: Option<Rgb>,
  pub accent3: Option<Rgb>,
  pub accent4: Option<Rgb>,
  pub accent5: Option<Rgb>,
  pub accent6: Option<Rgb>,
  pub hlink: Option<Rgb>,
  pub fol_hlink: Option<Rgb>,
}

/// `p:txStyles` の第 1 レベル既定を解決した値
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextStyle {
  /// 実 pt（`a:defRPr@sz` の 1/100pt を換算）
  pub size_pt: Option<f64>,
  /// 解決済みの文字色
  pub color: Option<Rgb>,
}

/// マスターの既定テキストスタイル
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextStyles {
  pub title: TextStyle,
  pub body: TextStyle,
  pub other: TextStyle,
}

/// base64 / 画像バイト列（サムネイル・ロゴ候補）。IPC は JSON なので生バイト列は載せられない
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaAsset {
  pub content_type: String,
  pub base64: String,
}

/// ロゴ候補（#168 のヒューリスティクス出力）。並置比較ダイアログで人が選ぶ・上書きする前提の**候補**であり、
/// 自動確定はしない
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogoCandidate {
  /// `p:cNvPr@name`（"Company Logo" 等）。ランキングの name hint にも使った値をそのまま見せる
  pub name_hint: Option<String>,
  pub image: MediaAsset,
  pub width_emu: i64,
  pub height_emu: i64,
  pub x_emu: i64,
  pub y_emu: i64,
}

/// 帯候補（#168 のヒューリスティクス出力）。`anchor`/`orientation` はフロントの
/// `BandMasterDecoration`（`src/data/types.ts`）とそのまま対応する
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BandCandidate {
  pub orientation: String,
  pub anchor: String,
  pub color_hex: String,
  pub thickness_emu: i64,
}

/// 固定テキスト/ページ番号候補（#318）。`BandCandidate` と同じく、採否は人が確認ダイアログで決める前提の
/// **候補**。`anchor`/`offset` への変換（`bandToDecoration` と同じ EMU→px 換算を使う）はフロント（`compile()`）の責務
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextCandidate {
  /// `a:t` ランの結合文字列。`a:fld type="slidenum"` は `{index}` に置き換え済み
  pub content: String,
  pub x_emu: i64,
  pub y_emu: i64,
  pub width_emu: i64,
  pub height_emu: i64,
  /// 文字サイズ（pt）。`a:lstStyle/a:lvl1pPr/a:defRPr@sz` の実測値
  pub size_pt: Option<f64>,
  pub color_hex: Option<String>,
}

/// slideLayout の1プレースホルダ（`p:ph@type`/`@idx`）
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaceholderProfile {
  pub ph_type: Option<String>,
  pub idx: Option<u32>,
  /// `ph_type` を OOXML の分類規則（`ST_PlaceholderType`・属性省略時は "body"）で表題系/本文系/その他へ
  /// 寄せた種別（#316）。抽出側が継承元の選択に使った値をそのまま公開することで、フロントが同じ分類表を
  /// 持たずに済む（2 言語で二重管理しない）
  pub kind: PlaceholderKind,
  /// 継承解決済みの既定文字プロパティ（#316）。書体は `a:defRPr` の実測値を `a:fontScheme` より優先する。
  /// 文字サイズはレイアウト種別ごとの型階層（表紙タイトル / 章タイトル / 本文）の抽出元になる
  pub text: PlaceholderTextProps,
  /// `p:spPr/a:xfrm/a:off@x`（EMU）。layout 側に無ければ所属 slideMaster の同じプレースホルダから
  /// 継承する（#317）。`off`/`ext` のどちらかが欠けている場合は 4 フィールドすべて `None`（部分的な
  /// 矩形は本文領域の計算に使えないため、`compile()` 側の判断を単純にする）
  pub x_emu: Option<i64>,
  pub y_emu: Option<i64>,
  /// `p:spPr/a:xfrm/a:ext@cx`（EMU）
  pub cx_emu: Option<i64>,
  pub cy_emu: Option<i64>,
}

/// slideLayout から抽出した内容（#192）。ロゴ・帯のヒューリスティクスは slideMaster 側のみで行う設計
/// （#168）を変えないため、ここに含めるのは名前・種別・プレースホルダ構成・背景のみ
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideLayoutProfile {
  pub part: String,
  pub name: Option<String>,
  pub layout_type: Option<String>,
  pub placeholders: Vec<PlaceholderProfile>,
  /// `p:bg/p:bgPr/a:solidFill` を **その layout が属する slideMaster の clrMap** で解決した色。
  /// clrMap は master ごとに異なり得るため、他 master の clrMap を当てると色が反転しうる
  pub background_color_hex: Option<String>,
}

/// slideMaster 1枚から抽出した内容（#192）。複数 slideMaster を持つテンプレートでは `BrandProfile.masters`
/// に配列で列挙される（列挙順は `p:sldMasterIdLst` の記述順）
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MasterProfile {
  pub part: String,
  /// この master 自身の clrMap を通して確定した 12 キー（#300）。複数 slideMaster を持つテンプレート
  /// （ライト用/ダーク用が別々に定義されている等）では master ごとに異なり得るため、`BrandProfile.mappedColors`
  /// （常に1枚目基準）に頼らずここから選べるようにする
  pub mapped_colors: MappedColors,
  /// 配下の slideLayout（列挙順は `p:sldLayoutIdLst` の記述順）
  pub slide_layouts: Vec<SlideLayoutProfile>,
}

/// 決定的抽出の結果。色はすべて `#rrggbb` に確定済み。ロゴ・帯候補はヒューリスティクスの出力であり、
/// 誤爆しうる前提の**候補**（採否は #168 の確認ダイアログで人が決める）
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrandProfile {
  /// `a:theme@name`（テンプレート名）
  pub name: Option<String>,
  /// 読んだ theme part 名。`.thmx` は theme part をバリアント込みで複数持つため、どれを読んだか示せるようにする
  pub theme_part: String,
  /// 読んだ slideMaster part 名（theme 単体のパッケージでは `null`）
  pub slide_master_part: Option<String>,
  /// テンプレートファイル本体の sha256（hex）。同一テンプレートの再取り込みで人の上書きを引き継ぐキーにする
  pub template_hash: String,
  /// presentation 本体から読んだスライドサイズ（EMU）。ロゴ候補ランキング・帯検出の幾何判定の基準
  pub slide_size: Option<SlideSize>,
  /// パッケージの埋め込みサムネイル（`docProps/thumbnail.jpeg` 等）。並置比較ダイアログの左パネルに使う
  pub thumbnail: Option<MediaAsset>,
  /// ランキング済みのロゴ候補（先頭が最有力）
  pub logo_candidates: Vec<LogoCandidate>,
  /// 検出した帯候補
  pub band_candidates: Vec<BandCandidate>,
  /// 検出した固定テキスト/ページ番号候補（#318）
  pub text_candidates: Vec<TextCandidate>,
  /// `p:embeddedFontLst` に列挙された埋め込みフォント（#318）。非圧縮 EOT の実体は `payload` に持つ
  /// （#321 段階1）。圧縮（MicroType Express）フォントは対象外で書体名のみ
  pub embedded_fonts: Vec<EmbeddedFont>,
  /// `a:clrScheme` の 12 スロット
  pub colors: ClrScheme,
  /// `p:clrMap`（12 キーが clrScheme のどのスロットを指すか）
  pub color_map: ClrMap,
  /// clrMap 適用後の 12 キー
  pub mapped_colors: MappedColors,
  /// `a:fontScheme` の見出し / 本文書体
  pub fonts: FontScheme,
  pub text_styles: TextStyles,
  /// 全 slideMaster と配下の slideLayout の列挙（#192）。1 枚目は `slide_master_part`/`mapped_colors` 等の
  /// 単数フィールドと同じ内容で、後方互換のため単数フィールド側は変更していない。取り込み確認ダイアログの
  /// レイアウト種別割り当てに使う
  pub masters: Vec<MasterProfile>,
}

/// テンプレートファイルからブランド情報を抽出する。ネットワークアクセスはせず、ディスクへも書き出さない
pub fn extract_brand_profile(path: &Path) -> Result<BrandProfile, BrandError> {
  let file = File::open(path).map_err(|e| BrandError::Io(e.to_string()))?;
  extract(BufReader::new(file))
}

/// リーダから抽出する（テストがメモリ上の zip を渡せるように分けている）
fn extract<R: Read + Seek>(mut reader: R) -> Result<BrandProfile, BrandError> {
  let template_hash = hash_reader(&mut reader)?;
  let mut package = OpcPackage::open(reader)?;
  let parts = package.locate_brand_parts()?;

  let theme = theme_xml::parse(&package.read_text(&parts.theme)?)?;
  // slideMaster が無いパッケージ（theme 単体）は標準の clrMap で代替する
  let master = match &parts.slide_master {
    Some(part) => master_xml::parse(&package.read_text(part)?)?,
    None => MasterInfo::default(),
  };

  let slide_size = match &parts.presentation {
    Some(part) => opc::parse_slide_size(&package.read_text(part)?)?,
    None => None,
  };

  let (logo_candidates, band_candidates, text_candidates) = match (&parts.slide_master, slide_size)
  {
    (Some(master_part), Some(size)) => {
      let raw = shapes::parse_shapes(&package.read_text(master_part)?)?;
      let logos = heuristics::rank_logo_candidates(&raw.pics, size)
        .into_iter()
        .filter_map(|ranked| resolve_logo_candidate(&mut package, master_part, ranked))
        .collect();
      let bands = heuristics::classify_bands(&raw.shapes, &theme.colors, &master.color_map, size)
        .into_iter()
        .map(|b| BandCandidate {
          orientation: b.orientation.to_string(),
          anchor: b.anchor.to_string(),
          color_hex: b.color.to_hex(),
          thickness_emu: b.thickness_emu,
        })
        .collect();
      let texts = heuristics::list_text_candidates(&raw.shapes, &theme.colors, &master.color_map)
        .into_iter()
        .map(|t| TextCandidate {
          content: t.content,
          x_emu: t.x_emu,
          y_emu: t.y_emu,
          width_emu: t.width_emu,
          height_emu: t.height_emu,
          size_pt: t.size_pt,
          color_hex: t.color.map(Rgb::to_hex),
        })
        .collect();
      (logos, bands, texts)
    }
    _ => (Vec::new(), Vec::new(), Vec::new()),
  };

  // presentation.xml の宣言を読み、非圧縮 EOT のフォント実体を展開する（#321 段階1）。
  // 圧縮（MicroType Express）・壊れたヘッダ・sfnt マジック不一致は例外にせず書体名のみへ退避する
  let mut embedded_fonts = Vec::new();
  if let Some(part) = &parts.presentation {
    embedded_fonts = opc::parse_embedded_fonts(&package.read_text(part)?)?;
    for font in embedded_fonts.iter_mut() {
      font.payload = resolve_embedded_font_payload(&mut package, part, font);
    }
  }

  // トップレベルの `mapped_colors`（常に1枚目基準）と `masters[0].mapped_colors` は本来同一値でなければならない。
  // 独立に計算すると「両者が一致する」という不変条件がテストでしか守れなくなるため、1度だけ計算した値を
  // 1枚目の MasterProfile 側にも clone で渡して構造的に一致を保証する（#300）
  let mapped_colors = map_colors(&theme.colors, &master.color_map);

  // 1 枚目の master は上で既にパース済みの `master`（clrMap と txStyles）と `mapped_colors` を再利用する
  // （同じ XML を二重にパースせず、map_colors も呼び直さない）
  let masters = parts
    .slide_masters
    .iter()
    .enumerate()
    .map(|(i, master_part)| -> Result<MasterProfile, BrandError> {
      let parsed = if i == 0 {
        None
      } else {
        Some(master_xml::parse(&package.read_text(master_part)?)?)
      };
      let master_mapped_colors = match &parsed {
        Some(info) => map_colors(&theme.colors, &info.color_map),
        None => mapped_colors.clone(),
      };
      build_master_profile(
        &mut package,
        master_part,
        &theme,
        parsed.as_ref().unwrap_or(&master),
        master_mapped_colors,
      )
    })
    .collect::<Result<Vec<_>, _>>()?;

  let thumbnail = extract_thumbnail(&mut package);

  Ok(BrandProfile {
    name: theme.name,
    theme_part: parts.theme,
    slide_master_part: parts.slide_master,
    template_hash,
    slide_size,
    thumbnail,
    logo_candidates,
    band_candidates,
    text_candidates,
    embedded_fonts,
    mapped_colors,
    text_styles: TextStyles {
      title: resolve_text_style(&master.title, &theme.colors, &master.color_map),
      body: resolve_text_style(&master.body, &theme.colors, &master.color_map),
      other: resolve_text_style(&master.other, &theme.colors, &master.color_map),
    },
    colors: theme.colors,
    color_map: master.color_map,
    fonts: theme.fonts,
    masters,
  })
}

/// slideMaster 1枚から `MasterProfile`（配下の slideLayout 一覧）を組み立てる。`master` は呼び出し側が
/// パース済みの「その master 自身」の内容を渡す（clrMap は master ごとに異なり得るため、他 master の
/// clrMap を当てるとレイアウトの背景色や文字色が反転しうる）。`mapped_colors` も呼び出し側が同じ
/// `master.color_map` から計算済みの値を渡す（この関数の中で再計算しない）
fn build_master_profile(
  package: &mut OpcPackage<impl Read + Seek>,
  master_part: &str,
  theme: &ThemeInfo,
  master: &MasterInfo,
  mapped_colors: MappedColors,
) -> Result<MasterProfile, BrandError> {
  let layout_parts = package.resolve_slide_layouts(master_part)?;
  let slide_layouts = layout_parts
    .into_iter()
    .map(|part| build_slide_layout_profile(&mut *package, part, theme, master))
    .collect::<Result<Vec<_>, _>>()?;
  Ok(MasterProfile {
    part: master_part.to_string(),
    mapped_colors,
    slide_layouts,
  })
}

/// slideLayout 1枚から `SlideLayoutProfile` を組み立て、背景色とプレースホルダの文字色を「そのlayoutが持つ
/// clrMapOvr（あれば）、無ければ所属masterのclrMap」で解決する（#300。反転レイアウトを master のclrMapで
/// 解決すると反転が無視される）。プレースホルダの既定文字プロパティは所属 master の `p:txStyles` と
/// theme の `a:fontScheme` を継承元にして解決する（#316）
fn build_slide_layout_profile(
  package: &mut OpcPackage<impl Read + Seek>,
  part: String,
  theme: &ThemeInfo,
  master: &MasterInfo,
) -> Result<SlideLayoutProfile, BrandError> {
  let info = layout_xml::parse(&package.read_text(&part)?)?;
  let effective_color_map = info
    .color_map_override
    .as_ref()
    .unwrap_or(&master.color_map);
  let background_color_hex = info
    .background
    .as_ref()
    .and_then(|spec| resolve_color_spec(spec, &theme.colors, effective_color_map))
    .map(Rgb::to_hex);
  Ok(SlideLayoutProfile {
    part,
    name: info.name,
    layout_type: info.layout_type,
    placeholders: info
      .placeholders
      .into_iter()
      .map(|p| {
        let kind = PlaceholderKind::of(p.ph_type.as_deref());
        let (x_emu, y_emu, cx_emu, cy_emu) = resolve_placeholder_xfrm(&p.xfrm, p.idx, kind, master);
        PlaceholderProfile {
          text: text_props::resolve(&p.text, kind, master, theme, effective_color_map),
          kind,
          ph_type: p.ph_type,
          idx: p.idx,
          x_emu,
          y_emu,
          cx_emu,
          cy_emu,
        }
      })
      .collect(),
    background_color_hex,
  })
}

/// layout のプレースホルダ矩形を継承込みで解決する（#317）。`off`（位置）と `ext`（サイズ）は
/// `text_props::resolve` と同じ「項目ごとに独立して解決する」考え方で個別に継承元へフォールバックする。
/// 最終的に両方が揃わなければ 4 フィールドすべて `None` にする（片方だけの矩形は本文領域の計算に使えない）
fn resolve_placeholder_xfrm(
  layout_xfrm: &RawXfrm,
  idx: Option<u32>,
  kind: PlaceholderKind,
  master: &MasterInfo,
) -> (Option<i64>, Option<i64>, Option<i64>, Option<i64>) {
  let master_xfrm = find_master_placeholder_xfrm(master, idx, kind);
  let off = layout_xfrm.off.or_else(|| master_xfrm.and_then(|x| x.off));
  let ext = layout_xfrm.ext.or_else(|| master_xfrm.and_then(|x| x.ext));
  match (off, ext) {
    (Some((x, y)), Some((cx, cy))) => (Some(x), Some(y), Some(cx), Some(cy)),
    _ => (None, None, None, None),
  }
}

/// 所属 slideMaster から継承元のプレースホルダ矩形を選ぶ。`idx` が一致するものを優先し、
/// 無ければ種別（`kind`）が一致する最初のもの（記述順の先頭）にフォールバックする
fn find_master_placeholder_xfrm(
  master: &MasterInfo,
  idx: Option<u32>,
  kind: PlaceholderKind,
) -> Option<&RawXfrm> {
  if let Some(idx) = idx {
    if let Some(found) = master.placeholders.iter().find(|p| p.idx == Some(idx)) {
      return Some(&found.xfrm);
    }
  }
  master
    .placeholders
    .iter()
    .find(|p| PlaceholderKind::of(p.ph_type.as_deref()) == kind)
    .map(|p| &p.xfrm)
}

/// テンプレートファイル本体の sha256（hex）。読み終えたら先頭へ戻す（後続の zip オープンに同じ reader を使うため）
fn hash_reader<R: Read + Seek>(reader: &mut R) -> Result<String, BrandError> {
  use sha2::{Digest, Sha256};
  reader.rewind().map_err(|e| BrandError::Io(e.to_string()))?;
  let mut hasher = Sha256::new();
  let mut buf = [0u8; 64 * 1024];
  loop {
    let read = reader
      .read(&mut buf)
      .map_err(|e| BrandError::Io(e.to_string()))?;
    if read == 0 {
      break;
    }
    hasher.update(&buf[..read]);
  }
  reader.rewind().map_err(|e| BrandError::Io(e.to_string()))?;
  Ok(format!("{:x}", hasher.finalize()))
}

/// part を読んで `MediaAsset`（content type + base64）にする。読めない・content type 不明のいずれでも
/// `None`（呼び出し側はその 1 件だけを諦める。1 件の画像事故で並置比較ダイアログ全体を失敗させない）
fn read_media_asset(
  package: &mut OpcPackage<impl Read + Seek>,
  part: &str,
  default_content_type: &str,
) -> Option<MediaAsset> {
  let bytes = package.read_bytes(part).ok()?;
  let content_type = package
    .content_type_of(part)
    .unwrap_or_else(|| default_content_type.to_string());
  Some(MediaAsset {
    content_type,
    base64: encode_base64(&bytes),
  })
}

/// ランキング済みロゴ候補の `r:embed` を media part へ解決し、バイト列を読む。
/// 参照が壊れている場合も、その 1 件だけを諦めて `None` を返す
fn resolve_logo_candidate(
  package: &mut OpcPackage<impl Read + Seek>,
  master_part: &str,
  ranked: heuristics::RankedLogo,
) -> Option<LogoCandidate> {
  let media_part = package
    .resolve_relationship_id(master_part, &ranked.embed_rid)
    .ok()??;
  Some(LogoCandidate {
    name_hint: ranked.name_hint,
    image: read_media_asset(package, &media_part, "application/octet-stream")?,
    width_emu: ranked.width_emu,
    height_emu: ranked.height_emu,
    x_emu: ranked.x_emu,
    y_emu: ranked.y_emu,
  })
}

/// 埋め込みフォントの実体を解決する（#321 段階1）。`p:regular` を優先し、無ければ `p:bold` を試す。
/// 参照が無い・解決できない・圧縮されている・壊れている・sfnt マジック不一致のいずれでも `None`
/// （例外にせず #318 の書体名のみの挙動へ退避する）
fn resolve_embedded_font_payload(
  package: &mut OpcPackage<impl Read + Seek>,
  presentation_part: &str,
  font: &EmbeddedFont,
) -> Option<MediaAsset> {
  for rid in [&font.regular_rid, &font.bold_rid].into_iter().flatten() {
    let Ok(Some(part)) = package.resolve_relationship_id(presentation_part, rid) else {
      continue;
    };
    let Ok(bytes) = package.read_bytes(&part) else {
      continue;
    };
    if let Some(sfnt) = eot::extract_sfnt_from_eot(&bytes) {
      return Some(MediaAsset {
        content_type: eot::sfnt_content_type(sfnt).to_string(),
        base64: encode_base64(sfnt),
      });
    }
  }
  None
}

/// パッケージの埋め込みサムネイル（root の `_rels/.rels` にある `metadata/thumbnail` 関係）。
/// 無い・壊れているテンプレートは多い（自己生成しない編集ソフトもある）ため、無ければ黙って `None`
fn extract_thumbnail(package: &mut OpcPackage<impl Read + Seek>) -> Option<MediaAsset> {
  let part = package.find_relationship_target("", "thumbnail").ok()??;
  read_media_asset(package, &part, "image/jpeg")
}

fn encode_base64(bytes: &[u8]) -> String {
  use base64::engine::general_purpose::STANDARD;
  use base64::Engine as _;
  STANDARD.encode(bytes)
}

/// clrMap を通して 12 キーを確定させる
fn map_colors(scheme: &ClrScheme, map: &ClrMap) -> MappedColors {
  let resolve = |key: &str| scheme.slot(map.resolve(key));
  MappedColors {
    bg1: resolve("bg1"),
    tx1: resolve("tx1"),
    bg2: resolve("bg2"),
    tx2: resolve("tx2"),
    accent1: resolve("accent1"),
    accent2: resolve("accent2"),
    accent3: resolve("accent3"),
    accent4: resolve("accent4"),
    accent5: resolve("accent5"),
    accent6: resolve("accent6"),
    hlink: resolve("hlink"),
    fol_hlink: resolve("folHlink"),
  }
}

fn resolve_text_style(raw: &RawTextProps, scheme: &ClrScheme, map: &ClrMap) -> TextStyle {
  TextStyle {
    size_pt: raw.size_pt,
    color: raw.resolve_color(scheme, map),
  }
}

/// 未解決の色指定を確定色へ解決する。
/// `schemeClr` は clrMap → clrScheme の 2 段で引き、変換（lumMod/lumOff/tint/shade）を出現順に適用する。
/// `heuristics::classify_bands`（帯の塗り解決）からも使うため `pub(super)`
pub(super) fn resolve_color_spec(
  spec: &ColorSpec,
  scheme: &ClrScheme,
  map: &ClrMap,
) -> Option<Rgb> {
  let base = match &spec.base {
    ColorRef::Fixed(rgb) => *rgb,
    ColorRef::Scheme(name) => scheme.slot(map.resolve(name))?,
  };
  Some(apply_transforms(base, &spec.transforms))
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::io::{Cursor, Write};
  use zip::write::SimpleFileOptions;
  use zip::{CompressionMethod, ZipWriter};

  const CT_THEME: &str = "application/vnd.openxmlformats-officedocument.theme+xml";
  const CT_THEME_MANAGER: &str = "application/vnd.openxmlformats-officedocument.themeManager+xml";
  const CT_PRESENTATION: &str =
    "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml";
  const CT_SLIDE_MASTER: &str =
    "application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml";
  const REL_NS: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

  /// 名前と `accent1` だけを差し替えた 12 スロットの theme part（part を取り違えたら値で分かるようにする）
  fn theme_part(name: &str, accent1: &str) -> String {
    format!(
      r#"<?xml version="1.0" encoding="UTF-8"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="{name}">
  <a:themeElements>
    <a:clrScheme name="{name}">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="44546A"/></a:dk2>
      <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
      <a:accent1><a:srgbClr val="{accent1}"/></a:accent1>
      <a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
      <a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>
      <a:accent4><a:srgbClr val="FFC000"/></a:accent4>
      <a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
      <a:accent6><a:srgbClr val="70AD47"/></a:accent6>
      <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
      <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="{name}">
      <a:majorFont><a:latin typeface="Yu Gothic UI"/><a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="游ゴシック Light"/></a:majorFont>
      <a:minorFont><a:latin typeface="Yu Gothic"/><a:ea typeface="游ゴシック"/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
  </a:themeElements>
</a:theme>"#
    )
  }

  /// ダークテーマの写像（bg1=dk1 / tx1=lt1）を持つ slideMaster part
  const MASTER_PART: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:clrMap bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:txStyles>
    <p:titleStyle>
      <a:lvl1pPr><a:defRPr sz="4400"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:defRPr></a:lvl1pPr>
    </p:titleStyle>
    <p:bodyStyle>
      <a:lvl1pPr><a:defRPr sz="2000"><a:solidFill><a:schemeClr val="accent1"><a:lumMod val="75000"/></a:schemeClr></a:solidFill></a:defRPr></a:lvl1pPr>
    </p:bodyStyle>
    <p:otherStyle>
      <a:lvl1pPr><a:defRPr sz="1400"/></a:lvl1pPr>
    </p:otherStyle>
  </p:txStyles>
</p:sldMaster>"#;

  const PRESENTATION_PART: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldMasterIdLst><p:sldMasterId id="2147483696" r:id="rId1"/></p:sldMasterIdLst>
</p:presentation>"#;

  fn relationships(entries: &[(&str, &str, &str)]) -> String {
    let body: String = entries
      .iter()
      .map(|(id, kind, target)| {
        format!(r#"<Relationship Id="{id}" Type="{REL_NS}/{kind}" Target="{target}"/>"#)
      })
      .collect();
    format!(
      r#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{body}</Relationships>"#
    )
  }

  fn content_types(overrides: &[(&str, &str)]) -> String {
    let body: String = overrides
      .iter()
      .map(|(part, ct)| format!(r#"<Override PartName="{part}" ContentType="{ct}"/>"#))
      .collect();
    format!(
      r#"<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>{body}</Types>"#
    )
  }

  fn build_zip(entries: &[(&str, &str)]) -> Vec<u8> {
    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    // Stored 固定にして圧縮方式の feature に依存しないテストにする
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    for (name, content) in entries {
      writer.start_file(*name, options).unwrap();
      writer.write_all(content.as_bytes()).unwrap();
    }
    writer.finish().unwrap().into_inner()
  }

  /// `.pptx` 形（slideMaster は theme2 を指す＝名前順の先頭ではない）のパッケージ
  fn pptx_package() -> Vec<u8> {
    let types = content_types(&[
      ("/ppt/presentation.xml", CT_PRESENTATION),
      ("/ppt/slideMasters/slideMaster1.xml", CT_SLIDE_MASTER),
      ("/ppt/theme/theme1.xml", CT_THEME),
      ("/ppt/theme/theme2.xml", CT_THEME),
    ]);
    let root_rels = relationships(&[("rId1", "officeDocument", "ppt/presentation.xml")]);
    // 実物と同じく presentation 側にも theme 関係が付く（こちらは decoy を指す）。
    // マスター側の theme が優先されることを固定する
    let pres_rels = relationships(&[
      ("rId1", "slideMaster", "slideMasters/slideMaster1.xml"),
      ("rId2", "theme", "theme/theme1.xml"),
    ]);
    let master_rels = relationships(&[("rId12", "theme", "../theme/theme2.xml")]);
    let decoy = theme_part("Decoy", "FF0000");
    let real = theme_part("Corporate", "1F4E79");
    build_zip(&[
      ("[Content_Types].xml", &types),
      ("_rels/.rels", &root_rels),
      ("ppt/presentation.xml", PRESENTATION_PART),
      ("ppt/_rels/presentation.xml.rels", &pres_rels),
      ("ppt/slideMasters/slideMaster1.xml", MASTER_PART),
      ("ppt/slideMasters/_rels/slideMaster1.xml.rels", &master_rels),
      ("ppt/theme/theme1.xml", &decoy),
      ("ppt/theme/theme2.xml", &real),
    ])
  }

  /// `.thmx` 形（officeDocument が themeManager を指し、バリアントの theme part も同梱される）のパッケージ。
  /// 関係の張り方は実物の Office テーマ（`Parcel.thmx` 等）と同じ
  fn thmx_package() -> Vec<u8> {
    let types = content_types(&[
      ("/theme/theme/themeManager.xml", CT_THEME_MANAGER),
      ("/theme/theme/theme1.xml", CT_THEME),
      ("/theme/presentation.xml", CT_PRESENTATION),
      ("/theme/slideMasters/slideMaster1.xml", CT_SLIDE_MASTER),
      ("/themeVariants/variant1/theme/theme/theme1.xml", CT_THEME),
    ]);
    let root_rels = relationships(&[("rId1", "officeDocument", "theme/theme/themeManager.xml")]);
    let manager_rels = relationships(&[
      ("rId1", "theme", "theme1.xml"),
      ("rId5", "officeDocument", "../presentation.xml"),
    ]);
    let pres_rels = relationships(&[("rId1", "slideMaster", "slideMasters/slideMaster1.xml")]);
    let master_rels = relationships(&[("rId12", "theme", "../theme/theme1.xml")]);
    let real = theme_part("Corporate", "1F4E79");
    let variant = theme_part("Variant", "00FF00");
    build_zip(&[
      ("[Content_Types].xml", &types),
      ("_rels/.rels", &root_rels),
      (
        "theme/theme/themeManager.xml",
        r#"<a:themeManager xmlns:a="a"/>"#,
      ),
      ("theme/theme/_rels/themeManager.xml.rels", &manager_rels),
      ("theme/theme/theme1.xml", &real),
      ("theme/presentation.xml", PRESENTATION_PART),
      ("theme/_rels/presentation.xml.rels", &pres_rels),
      ("theme/slideMasters/slideMaster1.xml", MASTER_PART),
      (
        "theme/slideMasters/_rels/slideMaster1.xml.rels",
        &master_rels,
      ),
      ("themeVariants/variant1/theme/theme/theme1.xml", &variant),
    ])
  }

  fn extract_bytes(bytes: &[u8]) -> Result<BrandProfile, BrandError> {
    extract(Cursor::new(bytes.to_vec()))
  }

  #[test]
  fn extracts_12_colors_and_fonts_from_pptx_package() {
    let profile = extract_bytes(&pptx_package()).unwrap();
    // 関係を辿って theme2 に到達している（名前順の先頭 theme1 は decoy）
    assert_eq!(profile.theme_part, "ppt/theme/theme2.xml");
    assert_eq!(profile.name.as_deref(), Some("Corporate"));
    assert_eq!(
      profile.slide_master_part.as_deref(),
      Some("ppt/slideMasters/slideMaster1.xml")
    );

    // clrScheme の 12 スロットすべてが確定している
    let hex = |slot: &str| {
      profile
        .colors
        .slot(slot)
        .map(Rgb::to_hex)
        .unwrap_or_default()
    };
    assert_eq!(hex("dk1"), "#000000");
    assert_eq!(hex("lt1"), "#ffffff");
    assert_eq!(hex("dk2"), "#44546a");
    assert_eq!(hex("lt2"), "#e7e6e6");
    assert_eq!(hex("accent1"), "#1f4e79");
    assert_eq!(hex("accent2"), "#ed7d31");
    assert_eq!(hex("accent3"), "#a5a5a5");
    assert_eq!(hex("accent4"), "#ffc000");
    assert_eq!(hex("accent5"), "#5b9bd5");
    assert_eq!(hex("accent6"), "#70ad47");
    assert_eq!(hex("hlink"), "#0563c1");
    assert_eq!(hex("folHlink"), "#954f72");

    // 書体名（ea が空でも script="Jpan" から和文を拾う）
    assert_eq!(profile.fonts.major.latin.as_deref(), Some("Yu Gothic UI"));
    assert_eq!(
      profile.fonts.major.jpan.as_deref(),
      Some("游ゴシック Light")
    );
    assert_eq!(profile.fonts.minor.ea.as_deref(), Some("游ゴシック"));
  }

  #[test]
  fn applies_clr_map_so_dark_templates_are_not_inverted() {
    let profile = extract_bytes(&pptx_package()).unwrap();
    // clrMap が bg1=dk1 / tx1=lt1（ダークテーマ）なので、背景は黒・文字は白になる。
    // 写像を飛ばして bg1=lt1 と決め打ちすると逆になる
    assert_eq!(profile.color_map.bg1, "dk1");
    assert_eq!(
      profile.mapped_colors.bg1.map(Rgb::to_hex).as_deref(),
      Some("#000000")
    );
    assert_eq!(
      profile.mapped_colors.tx1.map(Rgb::to_hex).as_deref(),
      Some("#ffffff")
    );
    assert_eq!(
      profile.mapped_colors.bg2.map(Rgb::to_hex).as_deref(),
      Some("#44546a")
    );
    assert_eq!(
      profile.mapped_colors.tx2.map(Rgb::to_hex).as_deref(),
      Some("#e7e6e6")
    );
    assert_eq!(
      profile.mapped_colors.accent1.map(Rgb::to_hex).as_deref(),
      Some("#1f4e79")
    );
    assert_eq!(
      profile.mapped_colors.fol_hlink.map(Rgb::to_hex).as_deref(),
      Some("#954f72")
    );
  }

  #[test]
  fn resolves_text_styles_in_points_with_scheme_colors() {
    let profile = extract_bytes(&pptx_package()).unwrap();
    assert_eq!(profile.text_styles.title.size_pt, Some(44.0));
    assert_eq!(profile.text_styles.body.size_pt, Some(20.0));
    assert_eq!(profile.text_styles.other.size_pt, Some(14.0));
    // title の色は schemeClr val="tx1" → clrMap で lt1 → #ffffff
    assert_eq!(
      profile.text_styles.title.color.map(Rgb::to_hex).as_deref(),
      Some("#ffffff")
    );
    // body は accent1 に lumMod 75% がかかるので原色より暗い
    let body = profile.text_styles.body.color.expect("body color");
    assert_ne!(body.to_hex(), "#1f4e79");
    assert!(body.r <= 0x1f && body.b <= 0x79);
    assert_eq!(profile.text_styles.other.color, None);
  }

  #[test]
  fn extracts_from_thmx_package_without_picking_a_variant() {
    let profile = extract_bytes(&thmx_package()).unwrap();
    // officeDocument → themeManager → theme の経路で本体テーマに到達し、バリアントを掴まない
    assert_eq!(profile.theme_part, "theme/theme/theme1.xml");
    assert_eq!(profile.name.as_deref(), Some("Corporate"));
    assert_eq!(
      profile.colors.accent1.map(Rgb::to_hex).as_deref(),
      Some("#1f4e79")
    );
    // themeManager の officeDocument を辿って slideMaster にも到達している（clrMap が読める）
    assert_eq!(
      profile.slide_master_part.as_deref(),
      Some("theme/slideMasters/slideMaster1.xml")
    );
    assert_eq!(profile.color_map.bg1, "dk1");
  }

  #[test]
  fn falls_back_to_content_type_search_when_relationships_are_missing() {
    // rels を一切持たないパッケージでも content type 検索で theme を引ける（slideMaster は無いので標準写像）
    let types = content_types(&[("/ppt/theme/theme1.xml", CT_THEME)]);
    let theme = theme_part("Bare", "1F4E79");
    let bytes = build_zip(&[
      ("[Content_Types].xml", &types),
      ("ppt/theme/theme1.xml", &theme),
    ]);
    let profile = extract_bytes(&bytes).unwrap();
    assert_eq!(profile.theme_part, "ppt/theme/theme1.xml");
    assert_eq!(profile.slide_master_part, None);
    // 標準写像（bg1=lt1 / tx1=dk1）で 12 キーが確定する
    assert_eq!(profile.color_map.bg1, "lt1");
    assert_eq!(
      profile.mapped_colors.bg1.map(Rgb::to_hex).as_deref(),
      Some("#ffffff")
    );
    assert_eq!(
      profile.mapped_colors.tx1.map(Rgb::to_hex).as_deref(),
      Some("#000000")
    );
  }

  #[test]
  fn missing_theme_part_is_an_error() {
    let types = content_types(&[]);
    let bytes = build_zip(&[("[Content_Types].xml", &types)]);
    assert!(matches!(
      extract_bytes(&bytes),
      Err(BrandError::MissingPart(_))
    ));
  }

  #[test]
  fn missing_content_types_is_an_error() {
    let bytes = build_zip(&[("ppt/theme/theme1.xml", &theme_part("X", "000000"))]);
    assert!(matches!(
      extract_bytes(&bytes),
      Err(BrandError::MissingPart(_))
    ));
  }

  #[test]
  fn not_a_zip_is_an_error_not_a_panic() {
    assert!(matches!(
      extract_bytes(b"this is not a zip file"),
      Err(BrandError::Archive(_))
    ));
    assert!(matches!(extract_bytes(&[]), Err(BrandError::Archive(_))));
  }

  #[test]
  fn entry_with_unsafe_path_is_rejected() {
    let types = content_types(&[("/ppt/theme/theme1.xml", CT_THEME)]);
    let bytes = build_zip(&[
      ("[Content_Types].xml", &types),
      ("ppt/theme/theme1.xml", &theme_part("X", "000000")),
      ("../../etc/passwd", "root:x:0:0"),
    ]);
    assert!(matches!(
      extract_bytes(&bytes),
      Err(BrandError::UnsafePath(_))
    ));
  }

  #[test]
  fn too_many_entries_is_rejected() {
    let names: Vec<String> = (0..9_000).map(|i| format!("filler/{i}.bin")).collect();
    let entries: Vec<(&str, &str)> = names.iter().map(|name| (name.as_str(), "")).collect();
    let bytes = build_zip(&entries);
    assert!(matches!(
      extract_bytes(&bytes),
      Err(BrandError::TooLarge(_))
    ));
  }

  #[test]
  fn oversized_part_is_rejected() {
    // 展開後 9MiB の part は上限（8MiB）を超えるので読む前に弾く
    let huge = "a".repeat(9 * 1024 * 1024);
    let bytes = build_zip(&[("[Content_Types].xml", &huge)]);
    assert!(matches!(
      extract_bytes(&bytes),
      Err(BrandError::TooLarge(_))
    ));
  }

  #[test]
  fn extraction_is_deterministic() {
    // 同一入力から必ず同一出力になる（受け入れ基準の再現性）
    let bytes = pptx_package();
    let first = serde_json::to_string(&extract_bytes(&bytes).unwrap()).unwrap();
    for _ in 0..5 {
      assert_eq!(
        serde_json::to_string(&extract_bytes(&bytes).unwrap()).unwrap(),
        first
      );
    }
  }

  #[test]
  fn template_hash_is_deterministic_and_input_sensitive() {
    let bytes = pptx_package();
    let hash = extract_bytes(&bytes).unwrap().template_hash;
    assert_eq!(hash.len(), 64);
    assert!(hash.bytes().all(|b| b.is_ascii_hexdigit()));
    assert_eq!(extract_bytes(&bytes).unwrap().template_hash, hash);
    // 中身が違う（decoy の accent1 が違う）テンプレートは別ハッシュになる
    assert_ne!(extract_bytes(&thmx_package()).unwrap().template_hash, hash);
  }

  /// presentation の `p:sldSz`・slideMaster の spTree（帯・ロゴ）・root のサムネイル関係を持つパッケージ（#168）
  fn pptx_package_with_shapes_and_thumbnail() -> Vec<u8> {
    const PRESENTATION_WITH_SIZE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldMasterIdLst><p:sldMasterId id="2147483696" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldSz cx="12192000" cy="6858000"/>
</p:presentation>"#;
    const MASTER_WITH_SHAPES: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title Placeholder 1"/></p:nvSpPr>
        <p:spPr/>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Top Band"/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="457200"/></a:xfrm>
          <a:solidFill><a:srgbClr val="1F4E79"/></a:solidFill>
        </p:spPr>
      </p:sp>
      <p:pic>
        <p:nvPicPr><p:cNvPr id="4" name="Company Logo"/></p:nvPicPr>
        <p:blipFill><a:blip r:embed="rId9"/></p:blipFill>
        <p:spPr><a:xfrm><a:off x="10500000" y="6400000"/><a:ext cx="900000" cy="300000"/></a:xfrm></p:spPr>
      </p:pic>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
</p:sldMaster>"#;

    let types = content_types(&[
      ("/ppt/presentation.xml", CT_PRESENTATION),
      ("/ppt/slideMasters/slideMaster1.xml", CT_SLIDE_MASTER),
      ("/ppt/theme/theme1.xml", CT_THEME),
      ("/docProps/thumbnail.jpeg", "image/jpeg"),
      ("/ppt/media/image1.png", "image/png"),
    ]);
    let root_rels = relationships(&[
      ("rId1", "officeDocument", "ppt/presentation.xml"),
      ("rId2", "metadata/thumbnail", "docProps/thumbnail.jpeg"),
    ]);
    let pres_rels = relationships(&[("rId1", "slideMaster", "slideMasters/slideMaster1.xml")]);
    let master_rels = relationships(&[
      ("rId12", "theme", "../theme/theme1.xml"),
      ("rId9", "image", "../media/image1.png"),
    ]);
    let theme = theme_part("Corporate", "1F4E79");
    build_zip(&[
      ("[Content_Types].xml", &types),
      ("_rels/.rels", &root_rels),
      ("ppt/presentation.xml", PRESENTATION_WITH_SIZE),
      ("ppt/_rels/presentation.xml.rels", &pres_rels),
      ("ppt/slideMasters/slideMaster1.xml", MASTER_WITH_SHAPES),
      ("ppt/slideMasters/_rels/slideMaster1.xml.rels", &master_rels),
      ("ppt/theme/theme1.xml", &theme),
      ("ppt/media/image1.png", "fake-logo-bytes"),
      ("docProps/thumbnail.jpeg", "fake-thumbnail-bytes"),
    ])
  }

  #[test]
  fn extracts_slide_size_from_presentation() {
    let profile = extract_bytes(&pptx_package_with_shapes_and_thumbnail()).unwrap();
    assert_eq!(
      profile.slide_size,
      Some(SlideSize {
        width_emu: 12_192_000,
        height_emu: 6_858_000
      })
    );
  }

  #[test]
  fn extracts_thumbnail_via_root_relationship() {
    let profile = extract_bytes(&pptx_package_with_shapes_and_thumbnail()).unwrap();
    let thumbnail = profile.thumbnail.expect("thumbnail");
    assert_eq!(thumbnail.content_type, "image/jpeg");
    use base64::Engine as _;
    assert_eq!(
      base64::engine::general_purpose::STANDARD
        .decode(&thumbnail.base64)
        .unwrap(),
      b"fake-thumbnail-bytes"
    );
  }

  #[test]
  fn extracts_and_ranks_logo_candidate_with_resolved_image_bytes() {
    let profile = extract_bytes(&pptx_package_with_shapes_and_thumbnail()).unwrap();
    assert_eq!(profile.logo_candidates.len(), 1);
    let logo = &profile.logo_candidates[0];
    assert_eq!(logo.name_hint.as_deref(), Some("Company Logo"));
    assert_eq!(logo.width_emu, 900_000);
    assert_eq!(logo.height_emu, 300_000);
    assert_eq!(logo.image.content_type, "image/png");
    use base64::Engine as _;
    assert_eq!(
      base64::engine::general_purpose::STANDARD
        .decode(&logo.image.base64)
        .unwrap(),
      b"fake-logo-bytes"
    );
  }

  #[test]
  fn detects_top_band_candidate_from_master_shapes() {
    let profile = extract_bytes(&pptx_package_with_shapes_and_thumbnail()).unwrap();
    assert_eq!(profile.band_candidates.len(), 1);
    let band = &profile.band_candidates[0];
    assert_eq!(band.orientation, "horizontal");
    assert_eq!(band.anchor, "top-center");
    assert_eq!(band.color_hex, "#1f4e79");
    assert_eq!(band.thickness_emu, 457_200);
  }

  #[test]
  fn shapes_and_thumbnail_extraction_is_deterministic() {
    let bytes = pptx_package_with_shapes_and_thumbnail();
    let first = serde_json::to_string(&extract_bytes(&bytes).unwrap()).unwrap();
    for _ in 0..5 {
      assert_eq!(
        serde_json::to_string(&extract_bytes(&bytes).unwrap()).unwrap(),
        first
      );
    }
  }

  /// 固定テキスト・ページ番号・埋め込みフォントを持つパッケージ（#318）。
  /// - `p:hf ftr="0"`（フッタ非表示指定）が付いていても、フッタは普通の `p:sp` として置かれているため候補に出る
  /// - タイトルプレースホルダにもテキストがあるが、プレースホルダなので候補から除外される
  /// - `p:embeddedFontLst` に2書体（bold の有無が異なる）を持ち、`ppt/fonts/font1.fntdata` は
  ///   EOT ヘッダとして壊れているダミーバイト列（#321: 実体の取り込みに失敗し書体名のみへ安全に退避することを
  ///   確認する用途。`rId6`/`rId7` は関係先自体が無く未解決になる）
  fn pptx_package_with_text_candidates_and_embedded_fonts() -> Vec<u8> {
    const PRESENTATION_WITH_FONTS: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" embedTrueTypeFonts="1">
  <p:sldMasterIdLst><p:sldMasterId id="2147483696" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldSz cx="12192000" cy="6858000"/>
  <p:embeddedFontLst>
    <p:embeddedFont>
      <p:font typeface="Corporate Sans" pitchFamily="34" charset="0"/>
      <p:regular r:id="rId5"/>
      <p:bold r:id="rId6"/>
    </p:embeddedFont>
    <p:embeddedFont>
      <p:font typeface="Corporate Sans Light"/>
      <p:regular r:id="rId7"/>
    </p:embeddedFont>
  </p:embeddedFontLst>
</p:presentation>"#;
    const MASTER_WITH_TEXT: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title Placeholder 1"/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:p><a:r><a:t>タイトルのプレースホルダテキスト</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Footer"/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="457200" y="6400800"/><a:ext cx="5000000" cy="300000"/></a:xfrm></p:spPr>
        <p:txBody>
          <a:lstStyle><a:lvl1pPr><a:defRPr sz="1000"><a:solidFill><a:srgbClr val="808080"/></a:solidFill></a:defRPr></a:lvl1pPr></a:lstStyle>
          <a:p><a:r><a:t>Acme Corp — </a:t></a:r><a:fld id="{GUID}" type="slidenum"><a:t>1</a:t></a:fld></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:hf ftr="0"/>
</p:sldMaster>"#;

    let types = content_types(&[
      ("/ppt/presentation.xml", CT_PRESENTATION),
      ("/ppt/slideMasters/slideMaster1.xml", CT_SLIDE_MASTER),
      ("/ppt/theme/theme1.xml", CT_THEME),
      ("/ppt/fonts/font1.fntdata", "application/x-font-ttf"),
    ]);
    let root_rels = relationships(&[("rId1", "officeDocument", "ppt/presentation.xml")]);
    let pres_rels = relationships(&[
      ("rId1", "slideMaster", "slideMasters/slideMaster1.xml"),
      ("rId5", "font", "fonts/font1.fntdata"),
    ]);
    let master_rels = relationships(&[("rId12", "theme", "../theme/theme1.xml")]);
    let theme = theme_part("Corporate", "1F4E79");
    build_zip(&[
      ("[Content_Types].xml", &types),
      ("_rels/.rels", &root_rels),
      ("ppt/presentation.xml", PRESENTATION_WITH_FONTS),
      ("ppt/_rels/presentation.xml.rels", &pres_rels),
      ("ppt/slideMasters/slideMaster1.xml", MASTER_WITH_TEXT),
      ("ppt/slideMasters/_rels/slideMaster1.xml.rels", &master_rels),
      ("ppt/theme/theme1.xml", &theme),
      // EOT ヘッダとして解釈しても EOTSize がバイト列長を超え壊れている（sfnt マジックも持たない）
      // ダミーバイト列（#321: 例外にせず安全に取り込みを諦めることを確認する対象）
      (
        "ppt/fonts/font1.fntdata",
        "\u{0}\u{1}not-a-real-font-EOT-payload",
      ),
    ])
  }

  #[test]
  fn lists_fixed_text_candidate_excluding_placeholder_text() {
    let profile = extract_bytes(&pptx_package_with_text_candidates_and_embedded_fonts()).unwrap();
    assert_eq!(profile.text_candidates.len(), 1);
    let footer = &profile.text_candidates[0];
    assert_eq!(footer.content, "Acme Corp — {index}");
    assert_eq!(footer.x_emu, 457_200);
    assert_eq!(footer.y_emu, 6_400_800);
    assert_eq!(footer.width_emu, 5_000_000);
    assert_eq!(footer.height_emu, 300_000);
    assert_eq!(footer.size_pt, Some(10.0));
    assert_eq!(footer.color_hex.as_deref(), Some("#808080"));
    // タイトルプレースホルダのテキストは候補に混入しない
    assert!(!profile
      .text_candidates
      .iter()
      .any(|c| c.content.contains("プレースホルダ")));
  }

  #[test]
  fn text_candidate_appears_even_when_master_hf_hides_the_footer_placeholder() {
    // `p:hf ftr="0"`（フッタプレースホルダ非表示）があっても、固定テキストは普通の p:sp として
    // 置かれているため候補に出る（ftr の値では判定しないという #318 の確定方針）
    let profile = extract_bytes(&pptx_package_with_text_candidates_and_embedded_fonts()).unwrap();
    assert_eq!(profile.text_candidates.len(), 1);
  }

  #[test]
  fn lists_embedded_fonts_with_style_flags_without_touching_font_bytes() {
    let profile = extract_bytes(&pptx_package_with_text_candidates_and_embedded_fonts()).unwrap();
    assert_eq!(profile.embedded_fonts.len(), 2);
    assert_eq!(profile.embedded_fonts[0].typeface, "Corporate Sans");
    assert!(profile.embedded_fonts[0].has_regular);
    assert!(profile.embedded_fonts[0].has_bold);
    assert_eq!(profile.embedded_fonts[1].typeface, "Corporate Sans Light");
    assert!(!profile.embedded_fonts[1].has_bold);
  }

  #[test]
  fn broken_embedded_font_header_falls_back_to_typeface_only_without_panicking() {
    // #321: `rId5` は壊れた EOT ヘッダ、`rId6`/`rId7` は関係先が存在しない未解決参照。
    // いずれも例外を起こさず、実体を取り込まず書体名のみへ安全に退避する
    let profile = extract_bytes(&pptx_package_with_text_candidates_and_embedded_fonts()).unwrap();
    assert_eq!(profile.embedded_fonts[0].payload, None);
    assert_eq!(profile.embedded_fonts[1].payload, None);
  }

  #[test]
  fn text_and_embedded_font_extraction_is_deterministic() {
    let bytes = pptx_package_with_text_candidates_and_embedded_fonts();
    let first = serde_json::to_string(&extract_bytes(&bytes).unwrap()).unwrap();
    for _ in 0..5 {
      assert_eq!(
        serde_json::to_string(&extract_bytes(&bytes).unwrap()).unwrap(),
        first
      );
    }
  }

  /// 非圧縮 EOT でラップされたフォント実体（`rId5` → `fonts/font1.fntdata`）を1書体だけ持つパッケージ（#321）。
  /// sfnt 本体は `OTTO` マジックのダミー（中身の妥当性までは検証しないため実データでなくてよい）
  fn pptx_package_with_embedded_font_payload() -> Vec<u8> {
    const PRESENTATION_WITH_FONT: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldMasterIdLst><p:sldMasterId id="2147483696" r:id="rId1"/></p:sldMasterIdLst>
  <p:embeddedFontLst>
    <p:embeddedFont>
      <p:font typeface="Corporate Sans"/>
      <p:regular r:id="rId5"/>
    </p:embeddedFont>
  </p:embeddedFontLst>
</p:presentation>"#;

    let types = content_types(&[
      ("/ppt/presentation.xml", CT_PRESENTATION),
      ("/ppt/slideMasters/slideMaster1.xml", CT_SLIDE_MASTER),
      ("/ppt/theme/theme1.xml", CT_THEME),
      ("/ppt/fonts/font1.fntdata", "application/x-font-ttf"),
    ]);
    let root_rels = relationships(&[("rId1", "officeDocument", "ppt/presentation.xml")]);
    let pres_rels = relationships(&[
      ("rId1", "slideMaster", "slideMasters/slideMaster1.xml"),
      ("rId5", "font", "fonts/font1.fntdata"),
    ]);
    let master_rels = relationships(&[("rId12", "theme", "../theme/theme1.xml")]);
    let theme = theme_part("Corporate", "1F4E79");
    let font_data = eot::eot_wrapped("OTTOfake-cff-outline-data", 0);
    build_zip(&[
      ("[Content_Types].xml", &types),
      ("_rels/.rels", &root_rels),
      ("ppt/presentation.xml", PRESENTATION_WITH_FONT),
      ("ppt/_rels/presentation.xml.rels", &pres_rels),
      ("ppt/slideMasters/slideMaster1.xml", MASTER_PART),
      ("ppt/slideMasters/_rels/slideMaster1.xml.rels", &master_rels),
      ("ppt/theme/theme1.xml", &theme),
      ("ppt/fonts/font1.fntdata", &font_data),
    ])
  }

  #[test]
  fn extracts_uncompressed_eot_font_payload_with_validated_sfnt_magic() {
    let profile = extract_bytes(&pptx_package_with_embedded_font_payload()).unwrap();
    assert_eq!(profile.embedded_fonts.len(), 1);
    let payload = profile.embedded_fonts[0]
      .payload
      .as_ref()
      .expect("非圧縮 EOT は実体を取り込める");
    assert_eq!(payload.content_type, "font/otf");
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
      .decode(&payload.base64)
      .unwrap();
    assert_eq!(&bytes, b"OTTOfake-cff-outline-data");
  }

  #[test]
  fn serialized_profile_uses_camel_case_and_hex_colors() {
    let json = serde_json::to_value(extract_bytes(&pptx_package()).unwrap()).unwrap();
    assert_eq!(json["themePart"], "ppt/theme/theme2.xml");
    assert_eq!(json["mappedColors"]["folHlink"], "#954f72");
    assert_eq!(json["colors"]["accent1"], "#1f4e79");
    assert_eq!(json["colorMap"]["bg1"], "dk1");
    assert_eq!(json["textStyles"]["title"]["sizePt"], 44.0);
    assert_eq!(json["fonts"]["major"]["jpan"], "游ゴシック Light");
    // 生成 CSS 文字列は出力しない（Epic #173 の方針）
    assert!(!serde_json::to_string(&json).unwrap().contains("--theme-"));
  }

  /// 実テンプレートからの抽出を確認する（実ファイルは fixture としてリポジトリに置けないため CI では走らせない）。
  ///
  /// ```sh
  /// BRAND_SAMPLE="/Applications/Microsoft PowerPoint.app/Contents/Resources/Office Themes/Parcel.thmx" \
  ///   cargo test --manifest-path src-tauri/Cargo.toml brand::tests::real_template -- --ignored --nocapture
  /// ```
  #[test]
  #[ignore = "BRAND_SAMPLE で実ファイル（.pptx/.potx/.thmx）のパスを渡したときだけ実行する"]
  fn real_template_extraction_is_reproducible() {
    let path = std::env::var("BRAND_SAMPLE")
      .expect("BRAND_SAMPLE に .pptx / .potx / .thmx のパスを指定してください");
    let profile = extract_brand_profile(Path::new(&path)).expect("抽出に失敗しました");
    println!("{}", serde_json::to_string_pretty(&profile).unwrap());

    // 12 キーすべてが解決できていること。キー名を手で並べず serde 出力を走査するので、
    // MappedColors を増減してもこの検証が静かに 11 キー検証へ劣化しない
    let mapped = serde_json::to_value(&profile.mapped_colors).unwrap();
    let mapped = mapped.as_object().expect("mappedColors はオブジェクト");
    assert_eq!(mapped.len(), 12, "12 キーそろっていません");
    for (key, value) in mapped {
      assert!(!value.is_null(), "{key} が解決できていません");
    }
    assert!(
      profile.fonts.major.latin.is_some()
        || profile.fonts.major.jpan.is_some()
        || profile.fonts.major.ea.is_some(),
      "見出し書体が取れていません"
    );

    // 再現性: 2 回読んで同一出力
    let again = extract_brand_profile(Path::new(&path)).unwrap();
    assert_eq!(
      serde_json::to_string(&again).unwrap(),
      serde_json::to_string(&profile).unwrap()
    );
  }

  /// 2 枚の slideMaster（明・暗の対照的な clrMap）を持ち、それぞれに複数 slideLayout を割り当てたパッケージ（#192）。
  /// slideLayout2 枚（master1 配下）と slideLayout1 枚（master2 配下）の背景はいずれも `schemeClr val="bg1"` で、
  /// 所属 master の clrMap を通して初めて色が確定する（同じ参照でも master が違えば別の色になることを固定する）
  fn pptx_package_with_multiple_masters_and_layouts() -> Vec<u8> {
    // bodyStyle にだけ書体を明示する（layout のプレースホルダが省略した項目の継承元になる。#316）
    // cSld/spTree に本文プレースホルダ（idx=1）の矩形を持つ。LAYOUT2_CONTENT の body プレースホルダは
    // `a:xfrm` を持たないため、この矩形が継承元になる（#317）
    const MASTER1: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr/>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title Placeholder 1"/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="457200" y="274638"/><a:ext cx="11277600" cy="1143000"/></a:xfrm></p:spPr>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Text Placeholder 2"/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="609600" y="1600200"/><a:ext cx="10972800" cy="4525963"/></a:xfrm></p:spPr>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="2147483650" r:id="rId10"/>
    <p:sldLayoutId id="2147483651" r:id="rId11"/>
  </p:sldLayoutIdLst>
  <p:txStyles>
    <p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle>
    <p:bodyStyle><a:lvl1pPr><a:defRPr sz="2400"><a:latin typeface="Master Body Sans"/></a:defRPr></a:lvl1pPr></p:bodyStyle>
  </p:txStyles>
</p:sldMaster>"#;
    const MASTER2: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:clrMap bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="2147483652" r:id="rId20"/>
  </p:sldLayoutIdLst>
</p:sldMaster>"#;
    const LAYOUT1_TITLE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="title">
  <p:cSld name="Title Slide">
    <p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></p:bgPr></p:bg>
    <p:spTree/>
  </p:cSld>
</p:sldLayout>"#;
    // master1 自身の clrMap は bg1=lt1（明）だが、この layout は clrMapOvr で bg1=dk1（暗）に反転する（#300）。
    // 反転を無視して master の clrMap を当てると背景が白になってしまう
    const LAYOUT2_CONTENT: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="obj">
  <p:clrMapOvr>
    <p:overrideClrMapping bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  </p:clrMapOvr>
  <p:cSld name="Content">
    <p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></p:bgPr></p:bg>
    <p:spTree>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/>
        <p:txBody>
          <a:lstStyle><a:lvl1pPr><a:defRPr sz="4000" b="1">
            <a:solidFill><a:schemeClr val="tx1"/></a:solidFill>
            <a:latin typeface="Corporate Display"/><a:ea typeface="コーポレート見出し"/>
          </a:defRPr></a:lvl1pPr></a:lstStyle>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Body"/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>
        <p:txBody>
          <a:lstStyle><a:lvl1pPr><a:defRPr sz="1800"><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></a:lstStyle>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sldLayout>"#;
    // master2 は p:txStyles を持たず、この layout のプレースホルダも defRPr を持たない
    // （書体が theme の fontScheme 由来になる「既定値のみ」のケース。#316）
    const LAYOUT3_SECTION: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="secHead">
  <p:cSld name="Section Divider">
    <p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></p:bgPr></p:bg>
    <p:spTree>
      <p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>
    </p:spTree>
  </p:cSld>
</p:sldLayout>"#;

    let types = content_types(&[
      ("/ppt/presentation.xml", CT_PRESENTATION),
      ("/ppt/slideMasters/slideMaster1.xml", CT_SLIDE_MASTER),
      ("/ppt/slideMasters/slideMaster2.xml", CT_SLIDE_MASTER),
      ("/ppt/theme/theme1.xml", CT_THEME),
    ]);
    let root_rels = relationships(&[("rId1", "officeDocument", "ppt/presentation.xml")]);
    let pres_rels = relationships(&[
      ("rId1", "slideMaster", "slideMasters/slideMaster1.xml"),
      ("rId2", "slideMaster", "slideMasters/slideMaster2.xml"),
    ]);
    // presentation.xml の p:sldMasterIdLst の記述順が rId の番号順と逆でも、記述順（master2 が先）が優先される
    const PRESENTATION_TWO_MASTERS: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483700" r:id="rId2"/>
    <p:sldMasterId id="2147483701" r:id="rId1"/>
  </p:sldMasterIdLst>
</p:presentation>"#;
    let master1_rels = relationships(&[
      ("rId12", "theme", "../theme/theme1.xml"),
      ("rId10", "slideLayout", "../slideLayouts/slideLayout1.xml"),
      ("rId11", "slideLayout", "../slideLayouts/slideLayout2.xml"),
    ]);
    let master2_rels = relationships(&[
      ("rId12", "theme", "../theme/theme1.xml"),
      ("rId20", "slideLayout", "../slideLayouts/slideLayout3.xml"),
    ]);
    let theme = theme_part("Corporate", "1F4E79");
    build_zip(&[
      ("[Content_Types].xml", &types),
      ("_rels/.rels", &root_rels),
      ("ppt/presentation.xml", PRESENTATION_TWO_MASTERS),
      ("ppt/_rels/presentation.xml.rels", &pres_rels),
      ("ppt/slideMasters/slideMaster1.xml", MASTER1),
      (
        "ppt/slideMasters/_rels/slideMaster1.xml.rels",
        &master1_rels,
      ),
      ("ppt/slideMasters/slideMaster2.xml", MASTER2),
      (
        "ppt/slideMasters/_rels/slideMaster2.xml.rels",
        &master2_rels,
      ),
      ("ppt/slideLayouts/slideLayout1.xml", LAYOUT1_TITLE),
      ("ppt/slideLayouts/slideLayout2.xml", LAYOUT2_CONTENT),
      ("ppt/slideLayouts/slideLayout3.xml", LAYOUT3_SECTION),
      ("ppt/theme/theme1.xml", &theme),
    ])
  }

  #[test]
  fn enumerates_all_slide_masters_in_document_order() {
    let profile = extract_bytes(&pptx_package_with_multiple_masters_and_layouts()).unwrap();
    // sldMasterIdLst の記述順（master2 が先）で列挙される。rId の番号順（master1 が先）ではない
    assert_eq!(profile.masters.len(), 2);
    assert_eq!(profile.masters[0].part, "ppt/slideMasters/slideMaster2.xml");
    assert_eq!(profile.masters[1].part, "ppt/slideMasters/slideMaster1.xml");
    // 単数フィールドは 1 枚目（= masters[0]）と一致する（#185/#192 契約の後方互換）
    assert_eq!(
      profile.slide_master_part.as_deref(),
      Some(profile.masters[0].part.as_str())
    );
  }

  #[test]
  fn enumerates_slide_layouts_with_name_type_and_placeholders() {
    let profile = extract_bytes(&pptx_package_with_multiple_masters_and_layouts()).unwrap();
    let master1 = &profile.masters[1]; // slideMaster1（記述順で2番目）
    assert_eq!(master1.slide_layouts.len(), 2);
    assert_eq!(
      master1.slide_layouts[0].name.as_deref(),
      Some("Title Slide")
    );
    assert_eq!(
      master1.slide_layouts[0].layout_type.as_deref(),
      Some("title")
    );
    assert_eq!(master1.slide_layouts[0].placeholders.len(), 0);

    assert_eq!(master1.slide_layouts[1].name.as_deref(), Some("Content"));
    assert_eq!(master1.slide_layouts[1].layout_type.as_deref(), Some("obj"));
    assert_eq!(master1.slide_layouts[1].placeholders.len(), 2);
    assert_eq!(
      master1.slide_layouts[1].placeholders[0].ph_type.as_deref(),
      Some("title")
    );
    assert_eq!(
      master1.slide_layouts[1].placeholders[1].ph_type.as_deref(),
      Some("body")
    );
    assert_eq!(master1.slide_layouts[1].placeholders[1].idx, Some(1));

    let master2 = &profile.masters[0]; // slideMaster2（記述順で1番目）
    assert_eq!(master2.slide_layouts.len(), 1);
    assert_eq!(
      master2.slide_layouts[0].name.as_deref(),
      Some("Section Divider")
    );
    assert_eq!(
      master2.slide_layouts[0].layout_type.as_deref(),
      Some("secHead")
    );
  }

  #[test]
  fn resolves_layout_background_using_its_own_master_clr_map() {
    // 同じ `schemeClr val="bg1"` でも、slideMaster1（bg1=lt1 = 白）と slideMaster2（bg1=dk1 = 黒）で
    // 解決結果が異なる。他 master の clrMap を当てると反転する（#192 の受け入れ基準）
    let profile = extract_bytes(&pptx_package_with_multiple_masters_and_layouts()).unwrap();
    let master1_title = &profile.masters[1].slide_layouts[0];
    assert_eq!(
      master1_title.background_color_hex.as_deref(),
      Some("#ffffff")
    );

    let master2_section = &profile.masters[0].slide_layouts[0];
    assert_eq!(
      master2_section.background_color_hex.as_deref(),
      Some("#000000")
    );
  }

  #[test]
  fn layout_with_clr_map_ovr_resolves_against_its_own_inverted_map_not_the_master() {
    // master1（bg1=lt1=白）配下の "Content" layout は clrMapOvr で bg1=dk1 に反転しているため、
    // master の clrMap（白）ではなく反転後（黒）で解決される（#300 の受け入れ基準）
    let profile = extract_bytes(&pptx_package_with_multiple_masters_and_layouts()).unwrap();
    let master1_content = &profile.masters[1].slide_layouts[1];
    assert_eq!(master1_content.name.as_deref(), Some("Content"));
    assert_eq!(
      master1_content.background_color_hex.as_deref(),
      Some("#000000")
    );
  }

  #[test]
  fn each_master_exposes_its_own_mapped_colors() {
    // master1（bg1=lt1）と master2（bg1=dk1）は同じ theme（clrScheme）を共有するが、clrMap が対照的なため
    // mapped_colors の bg1/tx1 が反転する。フロントがどの master を基準にするか選ぶための情報（#300）
    let profile = extract_bytes(&pptx_package_with_multiple_masters_and_layouts()).unwrap();
    let master1 = &profile.masters[1]; // slideMaster1（bg1=lt1）
    let master2 = &profile.masters[0]; // slideMaster2（bg1=dk1）
    assert_eq!(
      master1.mapped_colors.bg1.map(Rgb::to_hex).as_deref(),
      Some("#ffffff")
    );
    assert_eq!(
      master1.mapped_colors.tx1.map(Rgb::to_hex).as_deref(),
      Some("#000000")
    );
    assert_eq!(
      master2.mapped_colors.bg1.map(Rgb::to_hex).as_deref(),
      Some("#000000")
    );
    assert_eq!(
      master2.mapped_colors.tx1.map(Rgb::to_hex).as_deref(),
      Some("#ffffff")
    );
    // accent 系は clrMap が同じ割当（accent1="accent1" 等）のため両 master で一致する
    assert_eq!(master1.mapped_colors.accent1, master2.mapped_colors.accent1);
  }

  #[test]
  fn resolves_placeholder_default_text_properties_through_the_inheritance_chain() {
    // プレースホルダ（layout）→ slideMaster の p:txStyles → theme の a:fontScheme の順に解決する（#316）
    let profile = extract_bytes(&pptx_package_with_multiple_masters_and_layouts()).unwrap();
    let content = &profile.masters[1].slide_layouts[1]; // slideMaster1 配下の "Content"

    let title = &content.placeholders[0].text;
    assert_eq!(title.latin.as_deref(), Some("Corporate Display"));
    assert_eq!(title.ea.as_deref(), Some("コーポレート見出し"));
    assert_eq!(title.size_pt, Some(40.0));
    assert_eq!(title.bold, Some(true));
    assert_eq!(title.font_origin, text_props::FontOrigin::DefRpr);

    let body = &content.placeholders[1].text;
    // layout 側は `+mn-lt`（テーマ参照）なので書体は slideMaster の bodyStyle から継承し、
    // サイズは layout 側の実測値（18pt）が master（24pt）に勝つ
    assert_eq!(body.latin.as_deref(), Some("Master Body Sans"));
    assert_eq!(body.size_pt, Some(18.0));
    assert_eq!(body.font_origin, text_props::FontOrigin::DefRpr);
  }

  #[test]
  fn inherits_placeholder_rectangle_from_master_when_layout_omits_xfrm() {
    // "Content" layout（slideMaster1 配下）のプレースホルダは `a:xfrm` を持たないため、
    // 所属 slideMaster の cSld/spTree にある同じプレースホルダの矩形を継承する（#317）。
    // タイトルは種別一致、本文は idx=1 一致で解決する
    let profile = extract_bytes(&pptx_package_with_multiple_masters_and_layouts()).unwrap();
    let content = &profile.masters[1].slide_layouts[1];

    let title = &content.placeholders[0];
    assert_eq!(title.x_emu, Some(457_200));
    assert_eq!(title.y_emu, Some(274_638));
    assert_eq!(title.cx_emu, Some(11_277_600));
    assert_eq!(title.cy_emu, Some(1_143_000));

    let body = &content.placeholders[1];
    assert_eq!(body.x_emu, Some(609_600));
    assert_eq!(body.y_emu, Some(1_600_200));
    assert_eq!(body.cx_emu, Some(10_972_800));
    assert_eq!(body.cy_emu, Some(4_525_963));
  }

  #[test]
  fn placeholder_rectangle_is_omitted_when_neither_layout_nor_master_has_xfrm() {
    // slideMaster2 は cSld を持たず（継承元が無い）、配下の "Section Divider" layout の
    // プレースホルダも `a:xfrm` を持たないため、矩形は4フィールドとも None のままになる（#317）
    let profile = extract_bytes(&pptx_package_with_multiple_masters_and_layouts()).unwrap();
    let section = &profile.masters[0].slide_layouts[0].placeholders[0];
    assert_eq!(section.x_emu, None);
    assert_eq!(section.y_emu, None);
    assert_eq!(section.cx_emu, None);
    assert_eq!(section.cy_emu, None);
  }

  #[test]
  fn placeholder_text_color_uses_the_layouts_own_clr_map_override() {
    // "Content" layout は clrMapOvr で tx1=lt1 に反転している（#300）。プレースホルダの
    // `schemeClr val="tx1"` も背景と同じ写像で解決しなければ文字色が反転する（#316）
    let profile = extract_bytes(&pptx_package_with_multiple_masters_and_layouts()).unwrap();
    let title = &profile.masters[1].slide_layouts[1].placeholders[0].text;
    assert_eq!(title.color_hex.as_deref(), Some("#ffffff"));
  }

  #[test]
  fn placeholder_without_def_rpr_falls_back_to_the_font_scheme() {
    // master2（p:txStyles なし）配下の layout で、プレースホルダも defRPr を持たない場合は
    // theme の fontScheme 由来になり、根拠がそう報告される（#316）
    let profile = extract_bytes(&pptx_package_with_multiple_masters_and_layouts()).unwrap();
    let title = &profile.masters[0].slide_layouts[0].placeholders[0].text;
    assert_eq!(title.latin.as_deref(), Some("Yu Gothic UI"));
    // ea が空でも script="Jpan" から和文書体を拾う
    assert_eq!(title.ea.as_deref(), Some("游ゴシック Light"));
    assert_eq!(title.size_pt, None);
    assert_eq!(title.font_origin, text_props::FontOrigin::FontScheme);
  }

  #[test]
  fn serialized_placeholder_uses_camel_case_keys_and_kind() {
    // 値そのものは上の 2 テストで固定済みなので、ここでは JSON のキー名と enum の表記だけを見る
    let profile = extract_bytes(&pptx_package_with_multiple_masters_and_layouts()).unwrap();
    let json = serde_json::to_value(&profile).unwrap();
    let placeholder = &json["masters"][1]["slideLayouts"][1]["placeholders"][0];
    // 分類は Rust 側の結果をそのまま公開する（フロントが ph@type から再分類しない。#316）
    assert_eq!(placeholder["kind"], "title");
    assert_eq!(placeholder["phType"], "title");
    for key in ["latin", "ea", "sizePt", "bold", "colorHex", "fontOrigin"] {
      assert!(
        !placeholder["text"][key].is_null(),
        "text.{key} が JSON に出ていません"
      );
    }
    assert_eq!(placeholder["text"]["fontOrigin"], "defRPr");
    let section = &json["masters"][0]["slideLayouts"][0]["placeholders"][0];
    assert_eq!(section["text"]["fontOrigin"], "fontScheme");
  }

  #[test]
  fn single_master_template_keeps_legacy_fields_unchanged() {
    // master 1 枚のテンプレートでは、追加した `masters` フィールドが増えるだけで、
    // 既存の単数フィールドの値は従来どおり（#192 の回帰なし基準）
    let profile = extract_bytes(&pptx_package()).unwrap();
    assert_eq!(profile.masters.len(), 1);
    assert_eq!(
      profile.masters[0].part,
      profile.slide_master_part.clone().unwrap()
    );
    assert_eq!(profile.masters[0].slide_layouts.len(), 0);
    assert_eq!(profile.masters[0].mapped_colors, profile.mapped_colors);
  }

  #[test]
  fn multi_master_extraction_is_deterministic() {
    let bytes = pptx_package_with_multiple_masters_and_layouts();
    let first = serde_json::to_string(&extract_bytes(&bytes).unwrap()).unwrap();
    for _ in 0..5 {
      assert_eq!(
        serde_json::to_string(&extract_bytes(&bytes).unwrap()).unwrap(),
        first
      );
    }
  }
}
