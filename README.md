# Astrolabe

A self-hostable observatory for your department’s tools. A freely navigable Three.js observatory provides the exploration; task-oriented search, a complete directory, and direct launch links keep everything reachable.

The included catalog contains 15 fictional instruments across five editable categories. All sample URLs are `null`, so launching a sample opens a clearly marked demo preview. Add your own HTTP/HTTPS destinations through Catalog studio or by editing `public/catalog.json`. A small Node.js server supports live catalog saves; static hosting also works with import/export and local previews. There are no built-in accounts, live health checks, or shared preference database.

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

Preview serves `dist/` on the URL Vite prints (normally http://127.0.0.1:4173). It requires a build first and is intended for local verification. Development supports live saves to `public/catalog.json`. Vite preview and static hosting support local previews and import/export. To run the production server with live saving, build and run `npm start` (http://localhost:8080); it serves `dist/` and uses `public/catalog.json` as the writable catalog.

### Checks

```sh
npm test
npm run test:server
npx prettier --check README.md
```

Unit tests cover catalog validation and search, portable image validation, constellation placement, camera movement, focus framing, and HUD label projection.

For browser tests, install Playwright’s Chromium unless a usable Chrome/Chromium executable is already available:

```sh
npx playwright install chromium
npm run test:e2e
```

On Linux, `npx playwright install --with-deps chromium` also installs required system libraries. The browser configuration prefers `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, then `/usr/bin/google-chrome`, then bundled Chromium. The browser test script builds the production bundle for isolated live-save tests. Playwright starts a Vite development server on `127.0.0.1:4173` automatically. To test an already running deployment instead, set `ASTROLABE_TEST_BASE_URL`, for example:

```sh
ASTROLABE_TEST_BASE_URL=http://127.0.0.1:8080 npm run test:e2e
```

Browser tests cover scene selection, camera controls and boundaries, label stability, search and keyboard launching, favorites, catalog editing/import/export, live saves and cross-browser updates, globe images, responsive layouts, reduced motion, and WebGL fallback. They use software-rendering flags for Chromium; assess graphics performance separately on the devices that will run the portal.

`npm run format` formats source, tests, configuration, the sample catalog, and this README in place.

## Populate your universe

The shared source of truth is **`public/catalog.json`**. It is fetched at runtime, independently of the JavaScript bundle. The 3D view, Directory, search results, instrument details, and launchpad read the same validated catalog. A valid deployed catalog must load before a saved browser preview can be restored.

1. Open **Catalog studio** in the lower left (the settings button on mobile).
2. Edit a sample or choose **Add instrument**. Supply a name, useful description, category, icon, and URL. Add comma-separated search keywords as needed; leave the keyword field empty for no tags. Leave the URL blank for a demo preview. Feature a tool to make it eligible for the initial launchpad.
3. Use **Categories** to change category names, colors, descriptions, and icons, or create a category. Reassign its instruments before deleting a category.
4. Choose **Apply local preview** to try the changes. This saves an override in this browser’s local storage and displays a persistent preview banner. Other browsers still see the deployed catalog.
5. Choose **Save** to update the shared JSON immediately, clear this browser’s preview, and apply the catalog in all connected browsers without reloading. An older editor draft cannot overwrite a newer shared save; export your draft and restore the latest catalog before merging changes.
6. On static hosting, choose **Export**, then replace `public/catalog.json` with the downloaded file. Publish it using the Docker or static-server workflow below. Export validates the editor draft and does not require applying a local preview first.

**Import** validates an existing JSON catalog before replacing the editor’s draft. **Restore deployed catalog** removes this browser’s preview and restores the latest shared catalog received by the page. Live updates preserve active local previews and unsaved editor drafts. On static hosting, reload the page first after changing the server file; Save is unavailable there.

Catalog studio is accessible to any visitor. With the Node.js server, any visitor who can reach the save endpoint can publish changes; use your reverse proxy/SSO to restrict the portal or protect `PUT /api/catalog` to limit publishing. Saves use the same schema validation as the editor and atomically replace the file before broadcasting a live update. Local previews, favorites, recent launches, and graphics quality are stored per browser origin and are not synchronized between devices. If browser storage is unavailable or full, changes may last only for the current session; export your catalog to keep it.

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

The optional instrument `image` field stores a normalized PNG/JPEG/WebP data URL inside the catalog. Save publishes it to the shared catalog; Apply local preview keeps it in this browser. Export/import includes the images with no separate asset files. Catalog studio’s file importer accepts up to 28 MiB. Browser storage has a smaller browser-dependent quota: if a preview cannot be persisted, the editor explicitly reports a session-only preview and prompts export. Uploaded originals are never retained. Invalid image decoding falls back to a procedural globe without taking down the scene.

The schema accepts up to 200 instruments, but the included 3D layout is demonstrated with 15. Schema limits do not guarantee a readable or performant 3D scene at maximum capacity. Use Directory for larger collections and evaluate your catalog on target devices.

## Self-host

### Docker

Requires Docker Engine and the Docker Compose plugin. From the repository root:

```sh
ASTROLABE_USER="$(id -u):$(id -g)" docker compose up --build -d
```

Open http://localhost:8080. Compose builds the frontend and runs the Node.js server with your host UID/GID so it can write the mounted catalog. It mounts the `public/` directory at `/app/catalog` so **Save** persists to the host’s `public/catalog.json` and survives container recreation. `ASTROLABE_USER` defaults to `1000:1000` if omitted; set it to the owner of `public/` (or persist it in your Compose `.env`). The directory and file must be writable by that user. Mount the directory rather than a single file: saving uses atomic file replacement.

Save changes in Catalog studio; no rebuild or reload is needed. Valid direct edits to the mounted catalog are also broadcast to connected browsers. For application code or dependency changes, repeat the build/start command above.

```sh
docker compose logs -f astrolabe
docker compose down
```

The server serves `catalog.json` and the catalog API with `Cache-Control: no-store`, hashed assets with a one-year immutable cache, and other responses with `no-cache`. The container health check requests the web root; it does not validate linked applications. Preserve the original Host header in a reverse proxy so same-origin Save requests can be verified. When proxying live updates, disable buffering for `/api/catalog/events` and allow long-lived SSE connections.

For a Node.js deployment without Docker, run `npm ci`, `npm run build`, and `npm start`. Optional environment variables: `PORT` (8080), `HOST` (`0.0.0.0`), `STATIC_DIR` (`dist`), and `CATALOG_PATH` (`public/catalog.json`). Paths are relative to the working directory unless absolute. The runtime server has no npm dependencies and shares the frontend’s catalog validator.

### Any static web server

Run `npm run build` and serve the contents of `dist/` at your domain’s root with Nginx, Caddy, or an existing web server. Keep `catalog.json` uncached; [`nginx.conf`](nginx.conf) provides the included caching configuration. To publish only catalog changes, replace the served `catalog.json` directly, or update `public/catalog.json`, rebuild, and redeploy `dist/`. Reload clients to fetch the new catalog, and restore the deployed catalog if a local preview is active.

Fonts and generated graphics are served locally; static hosting requires no runtime CDN, analytics, or backend API. Live Save requires the included Node.js server. Real destinations open in a new tab and handle their own authentication. Put the portal behind your usual reverse proxy/SSO if access to the directory should be restricted.

## Interaction and accessibility

Choose **Help** in the header (or press `?`) for a brief camera guide.

- **Orbit:** left-drag around the point where you press. Rotation is unrestricted, including over the poles. **Pan:** right-drag, middle-drag, or Shift-drag. **Zoom:** scroll toward the pointer, or use +/− at the current focus.
- **Select:** click an instrument or its name to focus and inspect it; click a category name to frame its group. Double-click a surface to move closer. A fresh gesture interrupts camera travel.
- **Fly:** click empty scene space, then use WASD to move, R/F or E/Q for up/down, arrow keys to aim, and Shift to boost. Flight stays inside the scene boundary.
- **Touch:** one finger orbits; two fingers pan and pinch to zoom. Tap an instrument’s name to select it.
- **Reset:** use Reset camera or Home to return to the overview. Reduced motion makes camera transitions immediate.

- Search with `Ctrl/⌘ K` or `/`. Results match every word across names, descriptions, category names/IDs, and keywords. Arrow keys select a result; Enter launches it immediately.
- Select a node to inspect it, then launch from the details panel (a focused dialog on smaller screens). Directory and the launchpad provide direct links.
- Star instruments to personalize the launchpad. It shows up to four favorites in catalog order, falling back to up to four featured instruments when there are no favorites. Favorites and the 20 most recent distinct launches persist in this browser when storage is available, independently of the shared catalog.
- Directory is the initial view below 900 pixels wide and the automatic fallback when WebGL 2 or scene initialization is unavailable. Switching to it unloads the 3D renderer.
- **Quality: light** disables bloom and dynamic shadows and reduces pixel density and star count. The preference persists locally. All tools remain available in both quality modes.
- **Idle tour:** after 45 seconds without input, the camera frames the complete system and slowly orbits it. Mouse, keyboard, or touch input immediately restores the initial overview. Tours wait for loading to finish and stay off while motion is paused, reduced motion is enabled, a dialog is open, or the tab is hidden.
- Ambient motion can be paused. OS reduced-motion preferences suppress it automatically. Keyboard focus, native modal focus trapping, a skip link, and named controls support operation without a mouse.

## Implementation

React 19, TypeScript, and Vite; Three.js through React Three Fiber. The [3D scene](src/components/Observatory.tsx) loads on demand, with locally generated geometry, shaders, and bundled fonts.

Current UI, captured with Playwright:

**Observatory**

![Astrolabe overview with the primary star, planetary destinations, constellation labels, and camera controls](docs/screenshots/observatory.png)

**Instrument focus and details**

![Sentinel selected in the observatory, with a close camera view and its instrument details](docs/screenshots/instrument-focus.png)

**Catalog studio**

![Catalog studio showing instrument editing, globe image upload, and catalog import, export, local preview, and live Save](docs/screenshots/catalog-studio.png)

**Mobile Directory**

<img src="docs/screenshots/mobile-directory.png" alt="Mobile Directory with the visible Help button, category navigation, and instrument cards" width="390" />
