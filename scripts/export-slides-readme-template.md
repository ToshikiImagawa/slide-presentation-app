# @slides/{{name}}

Slide presentation package.

## Usage

Specify this package via `VITE_SLIDE_PACKAGE` in `.env.local` (no npm install required — npm does not recognize the
`.spkg` extension as an installable tarball):

```bash
echo 'VITE_SLIDE_PACKAGE=./dist-slides/slides-{{name}}-1.0.0.spkg' >> .env.local

# 開発サーバー起動
npm run dev
```

Or specify the package directly:

```bash
VITE_SLIDE_PACKAGE=./dist-slides/slides-{{name}}-1.0.0.spkg npm run dev
```

If you've published and installed this package as an npm dependency instead, reference it by name:

```bash
VITE_SLIDE_PACKAGE=@slides/{{name}}
```

## Contents

- `slides.json` — スライドデータ
- {{assetCount}} asset files (images, voices, themes, fonts)
