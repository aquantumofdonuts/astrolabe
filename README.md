# Astrolabe

A self-hostable observatory for your department’s tools. A freely navigable Three.js observatory provides the exploration; task-oriented search, a complete directory, and direct launch links keep everything reachable.

This is the orbital-observatory visual slice: 15 illustrative instruments across five editable categories, with a complete local catalog-authoring workflow. The sample names and descriptions are fictional. Demo instruments have no destination URL and open clearly marked previews; there is no simulated service health or live telemetry.

## Run locally

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

Open the URL Vite prints (normally http://127.0.0.1:5173). To test from another device on your network, explicitly bind with `npm run dev -- --host 0.0.0.0`.

```sh
npm test
npm run test:e2e
npm run build
npm run preview
```

Browser tests use Google Chrome if installed at `/usr/bin/google-chrome`, otherwise Playwright’s Chromium. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to choose another Chrome/Chromium executable, or install the bundled browser with `npx playwright install chromium`. The browser suite covers scene selection, flight through the sun and a 180-degree look back, camera boundaries, frame-by-frame label stability, search and keyboard launching, favorites, catalog editing/import/export, mobile layout, reduced motion, and WebGL fallback.

## Populate your universe

The shared source of truth is **`public/catalog.json`**. It is fetched at runtime, independently of the JavaScript bundle. Both views, search results, application details, and the launchpad read the same catalog.

1. Open **Catalog studio** in the lower left (the settings button on mobile).
2. Edit a sample or choose **Add instrument**. Supply a name, useful description, category, icon, URL, and comma-separated search keywords. Feature a tool to place it on the initial launchpad.
3. Use **Categories** to change category names, colors, descriptions, and icons, or create a category. Reassign its instruments before deleting a category.
4. Choose **Apply local preview** to try the changes. This saves an override in this browser’s local storage and displays a persistent preview banner. Other browsers still see the deployed catalog.
5. Choose **Export**, then replace `public/catalog.json` with the downloaded file. Rebuild your static deployment, or use the Docker workflow below, to make it available to everyone.

**Import** validates an existing JSON catalog before replacing the editor’s draft. **Restore deployed catalog** removes this browser’s preview and reloads the deployed catalog already fetched for the current page. Reload the page first if you have changed that file on the server.

Catalog studio is a local authoring utility, accessible to any visitor. It cannot write server files. Shared authenticated administration is intentionally outside this milestone; publishing is controlled by access to the deployed file/repository. A future admin service can persist this same catalog format without changing the visual model.

### Catalog format

```json
{
  "version": 1,
  "title": "The observatory",
  "categories": [
    {
      "id": "configure",
      "name": "Configure",
      "description": "Bring order to your infrastructure",
      "color": "#8bd1ad",
      "icon": "network"
    }
  ],
  "sites": [
    {
      "id": "network-atlas",
      "name": "Network Atlas",
      "description": "Back up switch configurations and compare changes.",
      "category": "configure",
      "icon": "network",
      "url": "https://ncm.example.internal/",
      "tags": ["ncm", "switch", "router", "backup", "config"],
      "featured": true
    }
  ]
}
```

Use stable, unique lowercase IDs containing letters, numbers, or hyphens; favorite/history preferences refer to these IDs. Categories and sites each have their own ID namespace. URLs must be absolute HTTP or HTTPS destinations without embedded credentials. `null` explicitly means a demo preview. Catalog validation rejects invalid references, unsupported URLs, duplicate IDs, invalid colors, and malformed fields. Icons: `radar`, `network`, `terminal`, `bot`, `activity`, `shield`, `workflow`, `database`, `code`, `search`, `globe`, `sparkles`.

In **Catalog studio → Instruments → Globe image**, upload PNG, JPEG, WebP, GIF, AVIF, BMP, or ICO files up to 10 MB (8192 pixels per side / 32 megapixels maximum). Browser decoding and Canvas resampling normalize them to a square WebP thumbnail, at most 512 × 512 and 128 KB encoded; JPEG is the fallback when WebP encoding is unavailable. Images retain their aspect ratio, fit within a dark padded surface, and lose embedded metadata. Animated formats use a still frame. No upload server or ImageMagick installation is required.

Assigned images replace any planetary or station model with a rotating globe. The image repeats on both hemispheres so an icon is recognizable from either side, with atmosphere, day/night shading, and animated night-side lights preserved. **Remove globe image** restores the original model. Existing node images can also be assigned to another instrument. Thumbnails appear in the editor, search, and Directory.

The optional instrument `image` field stores a normalized PNG/JPEG/WebP data URL inside the catalog. Apply local preview to save it in this browser; export/import includes the images with no separate asset files. Catalog imports accept up to 28 MB. Browser storage has a smaller browser-dependent quota: if a preview cannot be persisted, the editor explicitly reports a session-only preview and prompts export. Uploaded originals are never retained. Invalid image decoding falls back to a procedural globe without taking down the scene.

The import boundary allows 1–12 categories and up to 200 sites. The **3D evaluation layout is designed for approximately 8–20 instruments**. Larger collections should use Directory; a later milestone can add category drill-down and clustered layouts before expanding the 3D population.

## Self-host

### Docker

```sh
docker compose up --build -d
```

Open http://localhost:8080. Compose mounts `public/catalog.json` read-only into the static server. After replacing the catalog file, run `docker compose restart astrolabe` to refresh the file mount, then reload the page. Category and site changes need no application rebuild with this mount. The catalog is served with `Cache-Control: no-store`; hashed application assets are cached separately.

### Any static web server

Run `npm run build` and serve `dist/` at your domain’s root with Nginx, Caddy, or an existing internal web server. Keep `catalog.json` uncached. All fonts and graphics are local; there are no external runtime CDNs, analytics, or API services. Applications launch in a new tab using their existing authentication. Put the portal behind your department’s usual reverse proxy/SSO if access to the directory itself should be restricted.

## Interaction and accessibility

- Left-drag to orbit around the point under the pointer when the gesture starts. A solid surface supplies the exact pivot; empty space uses the cursor ray at the current viewing depth. The pivot stays fixed for that drag and is picked again on the next drag. No focus marker is displayed. The horizon stays upright and pitch stops short of the poles. Dragging has direct response and stops on release. Right-drag, middle-drag, or Shift-drag pans at the focus depth, so the scene follows the pointer at both close and distant views.
- Scroll to zoom toward the pointer, or use +/− to zoom toward the current focus. Zoom slows near a surface and does not pass through it. Select an instrument for a close view, or select a category to frame its entire constellation. **Recenter** repeats the approach; double-clicking a physical surface moves closer. Home or Reset returns to the overview. These short transitions can be interrupted by a fresh gesture; reduced motion makes them immediate. Selecting from scene labels, category navigation or search smoothly centers the destination.
- Focus the scene to use WASD for unrestricted flight, including through the core. R/F or E/Q move up/down, arrow keys aim, and Shift boosts travel. Keyboard navigation stays upright and stops when focus is lost. Touch: one finger orbits; two fingers pan and pinch to zoom. Wheel input is captured over the scene but leaves the mobile instrument list and other page content scrollable.
- Search with `Ctrl/⌘ K` or `/`. Results match every word across names, descriptions, category names/IDs, and keywords. Arrow keys select a result; Enter launches it immediately.
- Select a node to inspect it, then launch from the details panel (a focused dialog on smaller screens). Directory and the launchpad provide direct links.
- Star instruments to personalize the launchpad. Favorites and recent launches persist in this browser, independently of the shared catalog.
- Directory is the default on narrow screens and the automatic fallback when WebGL 2 is unavailable. Switching to it unloads the 3D renderer.
- **Quality: light** disables bloom and dynamic shadows and reduces pixel density and star count. The preference persists locally. All tools remain available in both quality modes.
- Ambient motion can be paused. OS reduced-motion preferences suppress it automatically. Keyboard focus, native modal focus trapping, a skip link, and named controls support operation without a mouse.

## Implementation

React + TypeScript + Vite, Three.js through React Three Fiber, local procedural geometry and shaders, and locally bundled variable fonts. The scene loads separately so the directory remains available while the 3D bundle loads, and switching to Directory unloads the renderer.

The solar system uses procedural ocean and ice worlds, rocky planets, banded gas giants with particulate rings, and rotating orbital habitats with paneled hulls, docking ports, and illuminated windows. Surfaces have distinct seeded geography, clouds, night-side lights, a day/night terminator, and atmospheric scattering at the limb. The larger primary star has animated plasma, a slowly breathing corona, and moving radial prominences. Geometry, shaders, habitat panel textures, and studio reflections are generated locally; there are no external asset/CDN requests. Full graphics adds bloom; light graphics preserves the planetary materials and content.

The environment layers a seeded star field over procedural nebulae and dark dust lanes. Stars vary in size, warm/cool color, and luminosity, with slow independent brightness cycles and rare diffraction flares. Short ship traces travel along curved routes between destinations; intermittent comets and a slow freighter cross the outskirts. Destination beacons pulse independently. Category selection adds colored halos to its members and emphasizes related traffic. Individual selection, including the active search result, uses the same halo plus the targeting HUD. Selecting another node or category clears the previous selection effects. All activity freezes with Pause or reduced motion; light quality reduces stars and traffic. Decorative effects do not intercept pointer or camera raycasts.

Constellations occupy an irregular spherical field, with different longitudes, elevations, and distances on both sides of the star. Destinations form loose, tilted groups with varied local distances and depth. The overview frames the wider field, and distant groups receive additional physical spacing to preserve readable labels. Positions are deterministic and existing positions stay fixed when categories or instruments are appended.

The application shares one interface theme in `src/interface.css`: Manrope typography, compact uppercase metadata, dark translucent panels, cyan controls, and category colors for content identity. Search, Directory, instrument details, Catalog studio, help, demo previews, and mobile dialogs use the same control states and type hierarchy. The mobile catalog editor keeps instrument selection in a horizontal strip above a full-width form.

The HUD uses unboxed, high-contrast HTML names with constant screen-space text size. Labels sit outside each destination's projected silhouette and remain stable during surface rotation. A short attachment mark identifies the body; targeting corners and category detail appear on hover, keyboard focus, or selection. Close-up labels stay inside the viewport. Category headings identify each group without adding physical category icons. Search, category filters, Directory, favorites, and direct launch links use the same catalog. Selecting an instrument opens a dismissible detail panel; selection smoothly flies to the destination using the reset camera easing. Category selection frames all group members without selecting an arbitrary tool. **Recenter** repeats the approach; a fresh drag interrupts the flight. Reduced motion freezes ambient motion and makes camera transitions immediate.

Visual references: [No Man's Sky's station redesign](https://www.nomanssky.com/orbital-update/) for strong silhouettes and architectural detail, and [Star Citizen's navigation HUD](https://support.robertsspaceindustries.com/hc/en-us/articles/360019449994-How-to-Quantum-Travel) for restrained destination marking. The geometry, materials, and interface here are original implementations.

The camera controller separates direct manipulation from finite eased transitions. Orbit rotates position and orientation together around a cursor-picked pivot held for the gesture, with world-up yaw and bounded pitch. Empty-space picking retains the current focus depth but moves the pivot onto the pointer ray, preventing an unrelated old focus from controlling the drag. One-finger orbit is rebased beneath the remaining finger after a pinch. Pan converts screen pixels into world units at the focus depth. Cursor-anchored zoom scales the camera-to-anchor vector, retains an anchor throughout a wheel burst, and cancels queued movement on reversal. Keyboard travel retains free movement within the scene boundary. Pointer cancellation, window blur, touch gesture changes, and UI keyboard focus are handled independently of scene selection.

The milestone has no backend, accounts, live health checks, chat integration, or shared preference database. Evaluate the visual direction, search vocabulary, category structure, and performance on actual department hardware before adding those features.
