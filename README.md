# Astrolabe

A self-hostable observatory for your department’s tools. A freely navigable Three.js observatory provides the exploration; task-oriented search, a complete directory, and direct launch links keep everything reachable.

The included catalog contains 15 fictional instruments across five editable categories. All sample URLs are `null`, so launching a sample opens a clearly marked demo preview. Add your own HTTP/HTTPS destinations through Catalog studio or by editing `public/catalog.json`. The application is a static frontend with no backend, accounts, live health checks, or shared preference database.

## Run locally

Use Node.js 22.12+ on the 22.x release line, or Node.js 24.x, with npm. These versions satisfy the locked Vite and Vitest requirements. The Docker build uses Node.js 22.

```sh
npm ci
npm run dev
```

Open the URL Vite prints (normally http://127.0.0.1:5173). To test from another device on your network, explicitly bind with `npm run dev -- --host 0.0.0.0`.

To build and inspect the production bundle:

```sh
npm run build
npm run preview
```

Preview serves `dist/` on the URL Vite prints (normally http://127.0.0.1:4173). It requires a build first and is intended for local verification. Changes to `public/catalog.json` appear immediately in the development server; rebuild to copy them into `dist/` for preview or a static deployment.

### Checks

```sh
npm test
npx prettier --check README.md
```

Unit tests cover catalog validation and search, portable image validation, constellation placement, camera movement, focus framing, and HUD label projection.

For browser tests, install Playwright’s Chromium unless a usable Chrome/Chromium executable is already available:

```sh
npx playwright install chromium
npm run test:e2e
```

On Linux, `npx playwright install --with-deps chromium` also installs required system libraries. The browser configuration prefers `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, then `/usr/bin/google-chrome`, then bundled Chromium. It starts a Vite development server on `127.0.0.1:4173` automatically. To test an already running deployment instead, set `ASTROLABE_TEST_BASE_URL`, for example:

```sh
ASTROLABE_TEST_BASE_URL=http://127.0.0.1:8080 npm run test:e2e
```

Browser tests cover scene selection, camera controls and boundaries, label stability, search and keyboard launching, favorites, catalog editing/import/export, globe images, responsive layouts, reduced motion, and WebGL fallback. They use software-rendering flags for Chromium; assess graphics performance separately on the devices that will run the portal.

`npm run format` formats source, tests, configuration, the sample catalog, and this README in place.

## Populate your universe

The shared source of truth is **`public/catalog.json`**. It is fetched at runtime, independently of the JavaScript bundle. The 3D view, Directory, search results, instrument details, and launchpad read the same validated catalog. A valid deployed catalog must load before a saved browser preview can be restored.

1. Open **Catalog studio** in the lower left (the settings button on mobile).
2. Edit a sample or choose **Add instrument**. Supply a name, useful description, category, icon, and URL. Add comma-separated search keywords as needed; leave the keyword field empty for no tags. Leave the URL blank for a demo preview. Feature a tool to make it eligible for the initial launchpad.
3. Use **Categories** to change category names, colors, descriptions, and icons, or create a category. Reassign its instruments before deleting a category.
4. Choose **Apply local preview** to try the changes. This saves an override in this browser’s local storage and displays a persistent preview banner. Other browsers still see the deployed catalog.
5. Choose **Export**, then replace `public/catalog.json` with the downloaded file. Publish it using the Docker or static-server workflow below. Export validates the editor draft and does not require applying a local preview first.

**Import** validates an existing JSON catalog before replacing the editor’s draft. **Restore deployed catalog** removes this browser’s preview and reloads the deployed catalog already fetched for the current page. Reload the page first if you have changed that file on the server.

Catalog studio is a local authoring utility accessible to any visitor. It cannot write server files; publishing is controlled by access to the deployed file or repository. Local previews, favorites, recent launches, and graphics quality are stored per browser origin and are not synchronized between devices. If browser storage is unavailable or full, changes may last only for the current session; export your catalog to keep it.

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

The schema and runtime validation live in [`src/lib/catalog.ts`](src/lib/catalog.ts). All fields shown above are required; `image` is optional on an instrument. The top-level collection is named `sites`, although the interface calls its entries instruments.

| Field                             | Validation                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `version`                         | Must be `1`.                                                                                                  |
| `title`                           | Nonblank, at most 80 characters.                                                                              |
| `categories`                      | 1–12 entries.                                                                                                 |
| `sites`                           | 0–200 entries, each referencing an existing category ID.                                                      |
| Category and instrument `id`      | 1–64 lowercase letters, digits, or hyphens; must start with a letter or digit. Unique within each collection. |
| Category `name` / `description`   | Nonblank, at most 40 / 160 characters.                                                                        |
| Category `color`                  | Six-digit hex value, such as `#8bd1ad`.                                                                       |
| Instrument `name` / `description` | Nonblank, at most 80 / 300 characters.                                                                        |
| Instrument `url`                  | Absolute HTTP/HTTPS URL without embedded credentials, at most 2048 characters, or `null` for a demo.          |
| Instrument `tags`                 | Up to 16 nonblank strings, at most 40 characters each; `[]` is valid.                                         |
| Instrument `featured`             | Required boolean.                                                                                             |

Keep IDs stable because favorites and launch history refer to them. Both category and instrument `icon` fields accept: `radar`, `network`, `terminal`, `bot`, `activity`, `shield`, `workflow`, `database`, `code`, `search`, `globe`, `sparkles`.

### Globe images

In **Catalog studio → Instruments → Globe image**, upload PNG, JPEG, WebP, GIF, AVIF, BMP, or ICO files up to 10 MiB (8192 pixels per side / 32 megapixels maximum). Browser decoding and Canvas resampling normalize them to a square WebP thumbnail, at most 512 × 512 with a complete data URL of at most 128 KiB; JPEG is the fallback when WebP encoding is unavailable. Images retain their aspect ratio, fit within a dark padded surface, and lose embedded metadata. Animated formats use a still frame. No upload server or ImageMagick installation is required.

Assigned images replace any planetary or station model with a rotating globe. The image repeats on both hemispheres so an icon is recognizable from either side, with atmosphere, day/night shading, and animated night-side lights preserved. **Remove globe image** restores the original model. Existing node images can also be assigned to another instrument. Thumbnails appear in the editor, search, and Directory.

The optional instrument `image` field stores a normalized PNG/JPEG/WebP data URL inside the catalog. Apply local preview to save it in this browser; export/import includes the images with no separate asset files. Catalog studio’s file importer accepts up to 28 MiB. Browser storage has a smaller browser-dependent quota: if a preview cannot be persisted, the editor explicitly reports a session-only preview and prompts export. Uploaded originals are never retained. Invalid image decoding falls back to a procedural globe without taking down the scene.

The schema accepts up to 200 instruments, but the included 3D layout is demonstrated with 15. Schema limits do not guarantee a readable or performant 3D scene at maximum capacity. Use Directory for larger collections and evaluate your catalog on target devices.

## Self-host

### Docker

Requires Docker Engine and the Docker Compose plugin. From the repository root:

```sh
docker compose up --build -d
```

Open http://localhost:8080. Compose builds the frontend in a Node.js stage and serves it with Nginx. It mounts `public/catalog.json` read-only over the built catalog, so catalog changes need no application rebuild.

After replacing the host catalog file, recreate the container to ensure the file bind mount points at the replacement:

```sh
docker compose up -d --force-recreate astrolabe
```

Reload the page afterward. An active local preview still takes precedence until you restore the deployed catalog. For application code or dependency changes, run `docker compose up --build -d` again.

```sh
docker compose logs -f astrolabe
docker compose down
```

The supplied Nginx configuration serves `catalog.json` with `Cache-Control: no-store`, hashed assets with a one-year immutable cache, and other responses with `no-cache`. The container health check requests the web root; it does not validate catalog content or linked applications.

### Any static web server

Run `npm run build` and serve the contents of `dist/` at your domain’s root with Nginx, Caddy, or an existing web server. Keep `catalog.json` uncached; [`nginx.conf`](nginx.conf) provides the included caching configuration. To publish only catalog changes, replace the served `catalog.json` directly, or update `public/catalog.json`, rebuild, and redeploy `dist/`. Reload clients to fetch the new catalog, and restore the deployed catalog if a local preview is active.

Fonts and generated graphics are served locally; the application requires no runtime CDN, analytics, or backend API. Real destinations open in a new tab and handle their own authentication. Put the portal behind your usual reverse proxy/SSO if access to the directory should be restricted.

## Interaction and accessibility

- Left-drag to orbit around the point under the pointer when the gesture starts. A solid surface supplies the exact pivot; empty space uses the cursor ray at the current viewing depth. The pivot stays fixed for that drag and is picked again on the next drag. No focus marker is displayed. The horizon stays upright and pitch stops short of the poles. Dragging has direct response and stops on release. Right-drag, middle-drag, or Shift-drag pans at the focus depth, so the scene follows the pointer at both close and distant views.
- Scroll to zoom toward the pointer, or use +/− to zoom toward the current focus. Zoom slows near a surface and does not pass through it. Select an instrument for a close view, or select a category to frame its entire constellation. **Recenter** repeats the approach; double-clicking a physical surface moves closer. Home or Reset returns to the overview. These short transitions can be interrupted by a fresh gesture; reduced motion makes them immediate. Selecting from scene labels, category navigation or search smoothly centers the destination.
- Focus the scene to use WASD for flight within the scene boundary, including through the core. R/F or E/Q move up/down, arrow keys aim, and Shift boosts travel. Keyboard navigation stays upright and stops when focus is lost. Touch: one finger orbits; two fingers pan and pinch to zoom. Wheel input is captured over the scene but leaves the mobile instrument list and other page content scrollable.
- Search with `Ctrl/⌘ K` or `/`. Results match every word across names, descriptions, category names/IDs, and keywords. Arrow keys select a result; Enter launches it immediately.
- Select a node to inspect it, then launch from the details panel (a focused dialog on smaller screens). Directory and the launchpad provide direct links.
- Star instruments to personalize the launchpad. It shows up to four favorites in catalog order, falling back to up to four featured instruments when there are no favorites. Favorites and the 20 most recent distinct launches persist in this browser when storage is available, independently of the shared catalog.
- Directory is the initial view below 900 pixels wide and the automatic fallback when WebGL 2 or scene initialization is unavailable. Switching to it unloads the 3D renderer.
- **Quality: light** disables bloom and dynamic shadows and reduces pixel density and star count. The preference persists locally. All tools remain available in both quality modes.
- Ambient motion can be paused. OS reduced-motion preferences suppress it automatically. Keyboard focus, native modal focus trapping, a skip link, and named controls support operation without a mouse.

## Implementation

React 19 + TypeScript + Vite, with Three.js through React Three Fiber. The scene loads separately, and switching to Directory unloads the renderer. Geometry, shaders, habitat textures, and studio reflections are generated locally; fonts are bundled with the application.

Destinations use procedural planets and orbital habitats, grouped into deterministic constellations on both sides of the primary star. Appending categories or instruments preserves existing destination positions; reordering entries or moving an instrument between categories can change its placement. The scene includes nebulae, variable stars, traffic, comets, selection halos, and HTML labels projected outside destination silhouettes. Pause and reduced motion freeze ambient effects while allowing navigation.

The camera separates direct manipulation from eased focus transitions. Orbit uses a cursor-picked pivot fixed for each gesture, pan follows the pointer at the focus depth, and zoom retains a cursor anchor during a wheel burst. Fresh input interrupts transitions. Keyboard flight can pass through bodies but stays inside the navigation sphere. Reduced motion makes focus transitions immediate.

| Location                                                                          | Purpose                                                                                        |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/App.tsx`                                                                     | Catalog loading, search, filters, launch history, favorites, and view state.                   |
| `src/components/CatalogStudio.tsx`                                                | Local catalog editing, import/export, and image assignment.                                    |
| `src/components/Observatory.tsx`                                                  | 3D scene, WebGL fallback, and projected destination labels.                                    |
| `src/components/FreeFlightControls.tsx`                                           | Pointer, wheel, touch, and keyboard camera input.                                              |
| `src/components/CelestialBodies.tsx`, `OrbitalArchitecture.tsx`, `SystemLife.tsx` | Procedural bodies, lighting, environment, and ambient activity.                                |
| `src/lib/`                                                                        | Catalog and image validation, browser preferences, layout, focus, camera math, and unit tests. |
| `src/styles.css`, `observatory.css`, `interface.css`                              | Layout, scene overlays, and shared interface styling.                                          |
| `tests/`                                                                          | Playwright browser tests and upload fixtures.                                                  |
| `docs/evaluation/`                                                                | Captured visual evaluation images.                                                             |

There are no environment variables required for normal operation. The two Playwright overrides documented above affect testing only.
