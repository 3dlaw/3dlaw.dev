# 3DLaw.dev

A place for creative work, technical exploration, writing, and experiments.
Built with Astro and Three.js; published as a static site on GitHub Pages.

## Local development

Use Node.js 24. From the project directory:

```sh
npm ci
npm run dev
```

The local address is normally `http://localhost:4321`. If PowerShell blocks
`npm.ps1`, use Command Prompt or `npm.cmd`.

```sh
npm run check
npm test
npm run preview
```

`check` type-checks the TypeScript. `test` first builds the seven static pages,
then runs the movement, geometry, navigation, and DOM lifecycle tests. `preview`
serves the most recent production build.

## The depths — independent rooms, v0.4

The homepage has a centered 3DLaw title, the normal site navigation, and an
invitation to descend. The button opens a full-screen room. Scrolling has no
connection to the room or camera. Return above closes the scene; Return below
resumes the same room and position during this page visit. Navigating to another
web page or reloading starts a new visit; persistent saves are not implemented.

There is **one current room**, with a ceiling, floor, and a short dark passage on
each wall. Each passage is capped by an opaque black surface. No adjoining room
is drawn and no continuous world grid exists. The five initial rooms share an
8 × 10 × 3.5 metre template, with 2.1 × 2.55 metre entrances and 1.55 metre stubs.
Their names, palettes, page links, and connections are independent data.

### Controls

| Action | Input |
| --- | --- |
| Walk forward/back | W / S, or up/down arrows |
| Step left/right | A / D |
| Turn with keyboard | Left/right arrows |
| Look around | Click and drag inside the room |
| Enter a passage | Click the opening/label, or walk into its darkness |
| Mouse look | Select Mouse look; move the mouse without holding a button |
| Interact in mouse look | E, Enter, or left click while aiming at a passage |
| Release the mouse | Escape |
| Close a drawer / return above | Escape, one layer at a time |
| Touch movement | Hold the on-screen arrow buttons; drag elsewhere to look |
| Skip directly to a room or page | Directory |

Walking keys work while the canvas is focused. Clicking inside the room focuses
it. Tabbing to a button, opening a drawer, switching tabs, or returning above
stops movement. Held keys must be released and pressed again after a passage
transition. This prevents unintentional travel through several rooms.

The camera has a steady 1.65 metre eye height and 65° vertical field of view.
Movement accelerates gently, stops quickly, and slides along walls. There is no
head bob, roll, sprint, or jumping. Controls includes sensitivity and a Gentle
transitions option; the latter starts enabled for the OS reduced-motion setting.

### How room changes work

A click nudges the camera at most half a metre along a collision-safe line and
fades into darkness. Walking into a passage invokes the same change. The current
room is replaced while the screen is fully black, then the destination appears
with the camera facing inward from its specified entrance. Gentle transitions
use a short fade with no automatic camera approach. The default lasts about
0.9 seconds; no long hallway traversal or alignment animation is involved.

Every initial connection is two-way, including deliberately non-grid loops.
A passage's `arrival` field names the doorway in the destination. Rewiring an
exit does not require moving either room or building connecting geometry.

### Customization

| Source | Responsibility |
| --- | --- |
| `src/data/room-map.ts` | Named room nodes, scene/palette keys, page content links, exits, arrival doorway |
| `src/data/room-design.ts` | Template dimensions and per-room color palettes |
| `src/data/room-movement.ts` | Walking, circular collision, camera settings, safe arrival/approach positions |
| `src/data/room-transition.ts` | Concealment and reveal timing |
| `src/scripts/world-scene.ts` | One room's geometry, matte materials, lighting, portal targets and label anchors |
| `src/scripts/room-scenes.ts` | Selects the scene builder for each room; the old scene is disposed at the concealed swap |
| `src/scripts/world.ts` | Renderer, input, transitions, projected labels, current-room state |
| `src/scripts/exploration.ts` | Lazy entry, dialogs, focus, Return above, pending-load cancellation |
| `src/components/Exploration.astro` | Homepage and room interface |
| `src/styles/exploration.css` | Homepage, room HUD, directory, controls, responsive layout |

To add a room, add a `RoomNode` with `scene: 'chamber'`, provide a palette, and connect an existing exit
using its room ID. Set `arrival` to the destination doorway. For a two-way link,
also set that doorway's return connection. The current tests deliberately enforce
two-way links; update that expectation if intentionally adding one-way doors.

The current scene is a plain architectural foundation. Authored models, sound,
props, physics objects, gameplay, a ladder descent, and saved progress are not
implemented yet. A custom scene can replace `createRoomScene` while exposing its
portal targets, label anchors, occluders, and disposal. Different room geometry
will also need corresponding collision and spawn data: replacing the visual mesh
alone does not update the walker collision shape. For asynchronous assets, keep
the screen concealed until the destination is ready, then resume the reveal.

### Runtime and fallback

Three.js loads when the visitor descends. There are no external textures, fonts,
analytics, or remote asset dependencies. Rendering stops while idle, in a drawer,
on the surface, and in a hidden tab. Context loss disables scene movement and
keeps the Directory's ordinary page links available; restoration resumes rendering.
If graphics cannot start, the Directory and Return above remain usable. No old
room screenshot is shown as if it were the live scene.

## Verification and hands-on review

Automated checks exercise swept collision, diagonal speed, frame-rate consistency,
stopping distance, all doorway triggers/arrivals, sealed geometry, click occlusion,
reciprocal non-grid links, concealed swaps, and the actual controller's input and
entry lifecycle using a simulated DOM and a renderer substitute.

These tests **do not exercise a real WebGL context**. The development browser was
blocked by its access policy. An offline projection was used to check geometry
and framing; it is not a browser screenshot. Run the following hands-on checks:

1. Descend. Check that the ceiling, forward opening, and side entrances read as
   one room on a desktop display. Narrow screens show a smaller horizontal view.
2. Walk, strafe, turn, and drag to look. Release input: movement should stop
   promptly. Walk into walls and around doorway edges: no clipping or snagging.
3. Click a passage. The screen should briefly conceal the change and reveal a
   new room name/palette. Turn around and take the entrance behind you to return.
4. Walk into a passage while holding W. Arrive once, stop, then release/repress
   W to resume walking. Try other directions and loop through several rooms.
5. Return above during movement or a transition, then Return below. The visit
   should resume; scrolling on the homepage must never reset it.
6. Open Directory and Controls while walking. Walking must stop. Test direct
   room jumps, page links, Tab/Enter, arrow-key navigation, and Escape layering.
7. Try Mouse look. Escape should release the pointer without leaving the room.
   A separate Escape returns above. Test Gentle transitions and sensitivity.
8. On touch hardware, hold a movement arrow while dragging to look with another
   finger. Opening a drawer or cancelling the gesture must stop walking.

## Other site content and publishing

`src/pages/` contains Home, Projects, Writing, About, and project introductions.
The original sculpture source is retained but is not imported on the homepage.
`examples/article.md` is a starter for future writing. Worldbuilding and Beneath
the surface remain projects in development; the room descriptions add no story canon.

Publishing uses the existing manual GitHub Actions workflow. Local patches and
preview commands do not publish the site. Review locally before merging or
running the publishing workflow.
