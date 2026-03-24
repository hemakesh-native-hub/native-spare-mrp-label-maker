# Label Maker — Native × Urban Company

A React web app for generating **Inner LM** and **Outer LM** regulatory product labels.
Labels are designed as 320×320 px frames, corresponding to 80×80 mm physical stickers.

---

## Features

- **Two label types:** Inner LM (individual product sticker) and Outer LM (shipping box sticker)
- **Live preview:** 320×320 px real-time label preview as you type
- **Optional fields:** Toggle Net Weight, Gross Weight, Manufactured On on/off — hidden fields leave no gaps
- **Accurate Figma spec:** font sizes, weights, spacing, and logo placeholder dimensions match the design spec exactly
- **SVG export:** Download the label as an `.svg` file with embedded font declarations
- **Custom font:** Uses *Open Sauce One* (woff2/ttf) applied globally and in the label preview

---

## Project Structure

```
label-maker/
├── public/
│   ├── fonts/                  ← Place your font files here (see below)
│   │   ├── OpenSauceOne-Regular.woff2
│   │   ├── OpenSauceOne-Regular.ttf
│   │   ├── OpenSauceOne-Medium.woff2
│   │   ├── OpenSauceOne-Medium.ttf
│   │   ├── OpenSauceOne-SemiBold.woff2
│   │   └── OpenSauceOne-SemiBold.ttf
│   └── logos/                  ← Place logo image files here (optional)
│       ├── native-logo.svg
│       └── urban-company-logo.svg
├── src/
│   ├── App.jsx                 ← Main application (form + preview)
│   ├── index.css               ← Global styles + @font-face declarations
│   └── main.jsx                ← React entry point
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
└── vite.config.js
```

---

## Font Setup

1. Place your **Open Sauce One** font files under `public/fonts/`:

   | File | Weight |
   |------|--------|
   | `OpenSauceOne-Regular.woff2` / `.ttf` | 400 — Regular |
   | `OpenSauceOne-Medium.woff2` / `.ttf` | 500 — Medium |
   | `OpenSauceOne-SemiBold.woff2` / `.ttf` | 600 — SemiBold |

   > The filenames above match the `@font-face` declarations in `src/index.css`.
   > If your files have different names, update the `src:` paths in `index.css` accordingly.

2. The font is applied globally to the entire app and to the label preview via inline `fontFamily` styles.

---

## Logo Replacement

The NATIVE and Urban Company logos render as grey placeholder rectangles.
To replace them with real images:

1. Place your image files in `public/logos/`
2. In `src/App.jsx`, find the `LogoBar` component and replace each placeholder `<div>` with:

```jsx
<img src="/logos/native-logo.svg" alt="NATIVE" style={{ width: 64, height: 8, objectFit: 'contain' }} />
<img src="/logos/urban-company-logo.svg" alt="Urban Company" style={{ width: 49, height: 14, objectFit: 'contain' }} />
```

---

## Getting Started

### Prerequisites

- **Node.js** v18 or later
- **npm** v9 or later

### Install & Run

```bash
# 1. Clone the repo
git clone https://github.com/your-org/label-maker.git
cd label-maker

# 2. Install dependencies
npm install

# 3. Add font files to public/fonts/ (see Font Setup above)

# 4. Start the dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
# Output is in the dist/ folder
npm run preview  # Preview the production build locally
```

---

## Label Spec Reference

| Property | Value |
|----------|-------|
| Frame size | 320 × 320 px |
| Frame padding | top 20px · bottom 16px · left/right 20px |
| Product name | 14px · Medium (500) |
| Field label | 5px · SemiBold (600) · #757575 |
| Field value | 5px · Regular (400) · #757575 |
| Row gap | 6px |
| Logo bar height | 14px |
| NATIVE logo | 8 × 64 px |
| Urban Company logo | 14 × 49 px |
| "NOT FOR RETAIL SALE" | 5px · SemiBold (600) |

---

## Tech Stack

- [React 18](https://react.dev/)
- [Vite 5](https://vitejs.dev/)
- [Tailwind CSS 3](https://tailwindcss.com/)
