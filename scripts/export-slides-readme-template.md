# @slides/{{name}}

Slide presentation package.

## Install

```bash
npm install ./dist-slides/slides-{{name}}-1.0.0.tgz
```

## Usage

```bash
# .env.local に設定
echo 'VITE_SLIDE_PACKAGE=@slides/{{name}}' >> .env.local

# 開発サーバー起動
npm run dev
```

Or specify the package directly:

```bash
VITE_SLIDE_PACKAGE=@slides/{{name}} npm run dev
```

## Contents

- `slides.json` — スライドデータ
- {{assetCount}} asset files (images, voices, themes, fonts)
