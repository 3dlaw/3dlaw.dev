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
- `src/components/Sculpture.astro` and `src/scripts/sculpture.ts` — The previous
  sculpture study, retained as source but no longer included on the homepage.
- `examples/article.md` — Starter for future Markdown articles.

## Content

Worldbuilding and the model-behavior exploration are marked as in development.
The Writing page has an intentional empty state until the first piece is ready.
The imagery is conceptual; it does not establish story details or finished work.

## Hosting

Astro generates a static site for GitHub Pages at `https://3dlaw.dev`.
Publishing uses the existing **manual** GitHub Actions workflow. Pushing a branch
does not deploy it. Review the design locally before merging and publishing.

No external fonts or image services are required. Three.js is bundled locally.

## The depths — enclosed room study v0.3

The homepage uses 3DLaw as its title, restores the shared header, and invites the
visitor to descend. The button opens an enclosed room. Page scrolling never
changes the camera or current room. Return above (or Escape) closes the room
view; Return below resumes the same visit, including a paused hallway transition.

Each room has a floor, ceiling, and an opening in each wall. The current template
is 10 × 10 metres with a 4-metre ceiling. Hallways are 6 metres long, 2.6 metres
wide, and 2.7 metres tall. Every hallway ends in another copy of the room.

Click a visible hallway to travel through it. Drag to look around, use the three
look buttons, or select a hallway from the accessible Hallways menu. WASD and
free walking are removed. The prototype map contains nine rooms with connected
opposite edges; every exit has a corresponding route back.

### Customizing the environment

| File | Responsibility |
| --- | --- |
| `src/data/room-design.ts` | Room and hallway dimensions; plain surface colors |
| `src/data/room-map.ts` | Room IDs, names, and the destination of each exit |
| `src/data/room-movement.ts` | Camera height, field of view, entry drop, turning and travel speeds |
| `src/scripts/world-scene.ts` | Builds the room template, surrounding rooms, and clickable openings |
| `src/scripts/world.ts` | Camera animation, click/drag controls, current-room state, pause/resume |
| `src/scripts/exploration.ts` | Entrance button, loading, return-above behavior, and focus |
| `src/components/Exploration.astro` | Homepage title/invitation and room controls |
| `src/styles/exploration.css` | Title, header, full-screen room view, and controls |
| `public/room-fallback.png` | Still geometry preview used during loading or graphics failure |

Edit the dimensions/colors to change every instance of the common room template.
Edit an exit in the map to change its destination; update its reverse exit when
you want a two-way connection. Add room records before map validation. Changing
camera motion does not require changing the geometry or connections.

The entrance currently uses a brief fade and small downward camera movement.
The entry animation is isolated so that a ladder sequence can replace it later.
A custom modeled room can replace the geometry builder while preserving its four
exit locations and the navigation graph. This pass uses one common template;
per-room custom models and materials have not yet been implemented.

The current scene renders a small repeated neighborhood, then recenters local
coordinates after hallway travel. This is intentional: the graph can evolve
without tying room IDs to permanent physical coordinates. Future room-specific
assets must be loaded for the destination before the camera crosses its threshold.

Reduced-motion mode completes camera transitions immediately. Rendering stops
while idle, above ground, or in a hidden tab. If WebGL fails, the still image,
return button, and header navigation remain available. The still image is an
independent render of the same geometry, not a browser screenshot.

### Preview checklist

1. Check the restored header, 3DLaw title, invitation, and Descend button.
2. Enter and inspect the ceiling and all four hallway openings.
3. Click a hallway; verify arrival in the next room and travel back.
4. Return above, then below: position and room should be preserved.
5. Try the Hallways menu and look buttons with keyboard or touch.

Build, TypeScript, room connections, geometry clearance, entry lifecycle, and
patch application are checked before delivery. Actual browser rendering and
animation feel still require local review.
