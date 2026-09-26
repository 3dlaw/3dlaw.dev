# 3DLaw.dev

Dan Lawrence's personal website: a place for creative work, technical exploration,
writing, and ongoing experiments.

## Development

Use Node.js 24 and install the pinned dependencies:

```sh
npm ci
npm run dev
```

On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.
Astro prints the local preview URL, normally `http://localhost:4321`.

```sh
npm run build
npm run preview
```

## Structure

- `src/pages/` — Home, Projects, Writing, About, and project introductions.
- `src/layouts/` — Shared navigation, footer, and article layout.
- `src/styles/global.css` — Colors, typography, spacing, and responsive layouts.
- `src/components/ProjectArt.astro` — Inline vector artwork for project cards.
- `src/components/Sculpture.astro` and `src/scripts/sculpture.ts` — Interactive
  homepage form, built with native WebGL and a static SVG fallback.
- `examples/article.md` — Starter for future Markdown articles.

The homepage sculpture is a temporary visual study, not the final 3DLAW logo.
It can later be replaced with a custom model. Motion can be paused, follows the
system's reduced-motion preference, and stops while off screen or in a hidden tab.

## Content

Worldbuilding and the model-behavior exploration are marked as in development.
The Writing page has an intentional empty state until the first piece is ready.
The imagery is conceptual; it does not establish story details or finished work.

## Hosting

Astro generates a static site for GitHub Pages at `https://3dlaw.dev`.
Publishing uses the existing **manual** GitHub Actions workflow. Pushing a branch
does not deploy it. Review the design locally before merging and publishing.

No external fonts, image services, or new runtime dependencies are required.
