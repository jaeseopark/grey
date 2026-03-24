## Context

Flatbed scanners often scan images slightly croocked and in RGB colourspace when most documents are greyscale. User has to open these images in editing software and apply correction & size optimization.

## Goal

Create an in-browser library that can be placed in any web application for post processing of scanned images

## Requirements

1. Given a blank div provided by the user with a unique id, initialize the application (ex. <div id="grey-editor"></div>)
1. User should be able to drag and drop local files or use the browse/open mechanism to locate and open files.
1. Tabbed design to allow opening of multiple files at once or folders (or multiple folders)
1. Support for common image types like jpeg, png, tiff; the most common file types coming out of consumer scanners.
1. Complete offline access; no talking to remote servers.
1. Concept of 'image canvas' where the the bounds define the image dimensions
1. User should be able to apply arbitrary rotation from -359 deg to +359 deg. When the image is rotated, the app should add appropriate padding to account for the image being wider and taller. Live preview as the rotation parameters are changing.
1. User should be able to apply crop before or after the rotation. Multiple times if they wanted to.
1. User can click save or hit cmd(ctrl) + s to start the save process. In the save view, the user should be able to select the file type, compression settings (if any), the colour space (RGB, RGBA, or greyscale -- some options may be limited by the selecetd file extension), and the scaling factor, deafulted to 1.00 or they can enter the "long edge" parameter in pixels.
1. Upon saving, the app should initiate the download process using the standard download protocol modern browsers work with.

## Implementation

### Recommended Stack

Use a TypeScript-based browser library built with Vite in library mode and managed with pnpm workspaces.

* **Package manager:** `pnpm`
* **Build tool:** `Vite`
* **Language:** `TypeScript`
* **Rendering:** HTML Canvas for preview, OffscreenCanvas in workers where supported
* **Heavy processing:** Web Workers to keep the UI responsive
* **Image decode/encode helpers:** browser-native APIs first, focused TIFF support via a decoder library if needed
* **Testing:** Vitest for unit tests, Playwright for browser workflows

This combination is appropriate because the product is an embeddable browser library, not a full website. It needs a fast development loop, distributable library bundles, and a clean path for worker-based image processing.

### Recommended Workspace Layout

Use a small monorepo so the library, demo app, and shared logic evolve together without forcing framework-specific coupling.

```text
grey/
	apps/
		demo/
	packages/
		editor-core/
		editor-ui/
		image-worker/
		shared-types/
```

Suggested responsibilities:

* **packages/editor-core**: document state, transform pipeline, save pipeline, command handling
* **packages/editor-ui**: DOM mounting, tabbed interface, file intake, keyboard shortcuts, canvas interaction
* **packages/image-worker**: rotation, crop application, grayscale conversion, scaling, export preparation
* **packages/shared-types**: common interfaces for tabs, transforms, export settings, worker messages
* **apps/demo**: manual QA harness and reference integration for consumers

### Local Development and Preview

The project should support a local demo application so the editor can be tested interactively before publishing the library.

Recommended root scripts:

```json
{
	"scripts": {
		"dev": "pnpm --filter @grey/demo dev",
		"build": "pnpm -r build",
		"test": "pnpm -r test",
		"lint": "pnpm -r lint",
		"preview": "pnpm --filter @grey/demo preview"
	}
}
```

Recommended local workflow:

1. Install dependencies with `pnpm install`
1. Start the demo app with `pnpm dev`
1. Open the local Vite URL, typically `http://localhost:5173`
1. Use the demo app to drag and drop scans, test tab behavior, rotate, crop, and save locally
1. Run `pnpm build` to verify that library packages and worker bundles compile cleanly
1. Run `pnpm preview` to validate the production-built demo before publishing

Expected package-level scripts:

* **apps/demo**: `dev`, `build`, `preview`
* **packages/editor-ui**: `build`, `test`, `lint`
* **packages/editor-core**: `build`, `test`, `lint`
* **packages/image-worker**: `build`, `test`

The demo app should import the local workspace packages rather than a published package so changes can be previewed immediately during development.

### Automated Publishing

The library should be published through an automated CI workflow rather than manual `npm publish` from a developer machine.

Recommended publish triggers:

* push of a version tag such as `v0.1.0`
* or a release workflow triggered after a changeset/versioning step is merged to `main`

Recommended root scripts for release support:

```json
{
	"scripts": {
		"ci": "pnpm lint && pnpm test && pnpm build",
		"release:check": "pnpm ci",
		"release:version": "changeset version",
		"release:publish": "pnpm -r publish --access public --no-git-checks"
	}
}
```

Recommended automation flow:

1. Open a pull request with code and documentation changes
1. Run CI on every pull request: install, lint, test, and build all packages
1. Merge approved changes to `main`
1. Create or update version metadata using Changesets or an equivalent release tool
1. On merge to `main`, run a release workflow that determines whether package versions changed
1. If a release is required, publish the package artifacts to npm automatically
1. Optionally create a GitHub Release with generated notes

Suggested CI stages:

* **validate**: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm test`, `pnpm build`
* **browser tests**: run Playwright flows against the demo app
* **release**: publish only from `main` or tags, never from pull requests

Recommended safeguards:

* require passing CI before merge
* restrict publishing credentials to the CI environment
* publish only the intended library packages, not the demo app
* fail release if working tree version metadata and lockfile are inconsistent
* store npm token in repository or organization secrets

Recommended package publish settings:

* `packages/editor-ui`: public package, includes type declarations and worker references
* `packages/editor-core`: publish only if intended as a standalone dependency
* `packages/image-worker`: usually bundled through the main package rather than published independently
* `apps/demo`: private, never published

Recommended metadata in publishable packages:

* `name`
* `version`
* `type`
* `main`
* `module`
* `types`
* `exports`
* `files`
* `publishConfig`

Example CI release sequence:

```sh
pnpm install --frozen-lockfile
pnpm ci
pnpm release:version
pnpm build
pnpm release:publish
```

If Changesets is adopted, the release workflow should commit version bumps or open an automated release pull request before the publish step. That approach is safer than deriving versions ad hoc during publish.

### Public API Shape

The library should expose a small framework-agnostic API so any host web application can initialize it inside a supplied element.

Example API:

```ts
import { createGreyEditor } from '@grey/editor-ui';

const editor = createGreyEditor({
	target: '#grey-editor',
	allowFolders: true,
	maxParallelDecodes: 2,
});
```

Recommended API methods:

* `createGreyEditor(options)`
* `editor.openFiles(FileList | File[])`
* `editor.openDirectory(FileSystemDirectoryHandle)` where supported
* `editor.getActiveDocument()`
* `editor.destroy()`

The host application should not need to manage canvas internals, image state, or export logic.

### Runtime Architecture

Split the product into four runtime layers:

1. **Host integration layer**
	 Mounts the editor into a DOM element and exposes the public API.
1. **UI state layer**
	 Manages open tabs, selected tool, active crop box, rotation value, save dialog state, and keyboard shortcuts.
1. **Document model layer**
	 Stores immutable source image metadata plus an ordered list of user operations.
1. **Worker processing layer**
	 Applies transforms and generates preview/export bitmaps off the main thread.

The main design principle is to keep the original image immutable and represent user edits as operations. That makes repeated crop/rotate actions predictable and simplifies undo/redo later if it is added.

### Document Model

Each open file should map to one document record.

Suggested shape:

```ts
type GreyDocument = {
	id: string;
	name: string;
	sourceFile: File;
	sourceType: string;
	sourceWidth: number;
	sourceHeight: number;
	previewBitmap?: ImageBitmap;
	operations: Operation[];
	exportSettings: ExportSettings;
	dirty: boolean;
};
```

Operations should be append-only user actions such as:

* `rotate`
* `crop`
* `convertColorSpace`
* `scale`

Recommended rule: preview renders from the current ordered operation list, while export replays the same list at full resolution.

### File Intake Plan

Support three entry points:

1. Drag and drop files or folders onto the editor surface.
1. Browse/open through a hidden file input with `multiple` enabled.
1. Directory selection through browser APIs where available.

Implementation notes:

* Accept `.jpg`, `.jpeg`, `.png`, `.tif`, `.tiff`
* Normalize dropped folders into a flat list of image files
* Reject unsupported formats with per-file errors rather than aborting the entire batch
* Create one tab per file
* Defer full-resolution decode until a tab becomes active if memory pressure becomes an issue

### Canvas and Preview Plan

The editor should visually distinguish between:

* **Image bounds**: the actual transformed image content
* **Canvas bounds**: the full export area after padding, rotation, and crop operations

Implementation approach:

* Keep a viewport canvas in the UI for interactive preview
* Render preview frames from worker output or a throttled main-thread fallback
* Track zoom/pan separately from document transforms so view controls do not mutate the document

For live interaction, the UI should request low-latency preview renders while the user drags a slider, then request a final high-quality preview when interaction stops.

### Rotation Plan

Rotation is a core requirement and should be implemented mathematically rather than visually faked.

Rules:

* Allowed input range: `-359` to `+359`
* Store rotation in degrees in the operation list
* Compute the rotated bounding box before rendering so padding is deterministic
* Center the image in the expanded canvas after rotation

Bounding box math for a source image with width `w`, height `h`, and angle `theta`:

$$
rotatedWidth = |w \cos\theta| + |h \sin\theta|
$$

$$
rotatedHeight = |w \sin\theta| + |h \cos\theta|
$$

The worker should apply this calculation and render into a destination canvas large enough to preserve all pixels.

### Crop Plan

Cropping should be non-destructive at the document level.

Recommended behavior:

* Represent each crop as an operation in document coordinates
* Allow crop before or after rotation by preserving operation order
* Support multiple crop actions by applying them sequentially
* Show crop handles and shaded outside regions in the UI
* Snap crop values to integer pixels for export consistency

Important implementation detail: crop rectangles must be stored relative to the current transformed coordinate space at the time of the action, or normalized back to source space with a mapping layer. The first option is easier to ship correctly.

### Color Space Plan

The product needs RGB, RGBA, and grayscale output choices, with file-format-aware constraints.

Recommended support matrix:

| Format | RGB | RGBA | Grayscale |
|---|---|---|---|
| JPEG | Yes | No | Yes |
| PNG | Yes | Yes | Yes |
| TIFF | Yes | Yes, if encoder allows | Yes |

Implementation notes:

* Use browser-native export for JPEG and PNG where possible
* Apply grayscale conversion in the worker by writing identical values into R, G, and B channels and preserving alpha where applicable
* Disable incompatible save options in the UI rather than allowing invalid combinations

### Save and Export Plan

The save flow should be a dedicated modal or side panel invoked by button click or `Cmd/Ctrl+S`.

Inputs:

* file type
* compression or quality when format supports it
* color space
* scale factor, default `1.0`
* optional long-edge pixel target

Processing order:

1. Start from the original source image
1. Replay document operations in sequence
1. Apply export color space conversion
1. Compute output dimensions from either scale factor or long edge
1. Encode to target format
1. Trigger browser download using `Blob` and object URL

Decision rule for size inputs:

* If long edge is provided, compute scale from that value and disable manual scale editing
* Otherwise, use the explicit scale factor

The UI should show estimated output dimensions before download starts.

### Offline and Performance Plan

The product requirement is full offline operation, so the design should assume no server and no network dependency at runtime.

Implementation guidance:

* Bundle all required application code locally
* Avoid CDN-hosted runtime dependencies
* Do not send image data outside the browser
* Move decode/transform/export work into a worker wherever possible
* Use `createImageBitmap` for efficient decode when available
* Downscale preview renders for interaction, full resolution for export

Optional later enhancement: a demo app can register a service worker for local caching, but the library itself should not require service-worker setup from consumers.

### Library Choices

Recommended approach is to keep the core pipeline mostly custom and use narrowly-scoped libraries only where browser APIs are weak.

Recommended candidates:

* **Crop interaction UI:** implement directly on canvas or evaluate a small crop interaction helper
* **TIFF decode:** use a focused TIFF parser/decoder library
* **High-quality resize:** consider `pica` if browser canvas resampling quality is insufficient

Avoid a large canvas abstraction framework unless it clearly reduces complexity. The requirements are specific enough that a custom document model and transform pipeline will age better than forcing everything through a general-purpose scene graph.

### Testing Plan

Minimum test coverage should include:

* rotation bounding box calculations
* crop operation ordering
* grayscale conversion correctness
* export dimension calculation from scale factor and long edge
* keyboard shortcut handling for save
* drag/drop intake with mixed valid and invalid files
* multi-tab document isolation

Recommended test layers:

* **Unit tests:** math, document reducers, export option validation
* **Integration tests:** worker message contracts and preview pipeline
* **Browser tests:** upload, rotate, crop, save, download initiation

### Delivery Phases

#### Phase 1: Project foundation

* initialize pnpm workspace
* configure Vite library build and demo app
* define shared types and document model
* create public mount API

#### Phase 2: File intake and tab shell

* add drag/drop and browse/open flows
* support multiple files and tab switching
* decode JPEG and PNG first
* scaffold TIFF ingestion behind a feature flag if needed

#### Phase 3: Preview canvas and transforms

* render active document preview
* add rotation controls with live preview
* implement crop tool and operation history

#### Phase 4: Export pipeline

* build save panel
* add format, quality, color space, and size controls
* implement Blob download flow

#### Phase 5: Hardening

* worker offloading
* performance tuning for large scans
* browser compatibility pass
* automated testing and packaging documentation

### Known Risks and Decisions

These areas should be decided early because they affect architecture:

* **TIFF support depth:** decode-only is easier than full TIFF re-encode
* **Folder import API support:** browser support varies, so graceful fallback is required
* **Memory usage for large scans:** keep previews and exports on separate pipelines
* **Undo/redo:** not required now, but the operation-list model keeps the door open

### Recommended First Build Scope

For the first working version, prioritize:

1. mount into a supplied div
1. open multiple JPEG and PNG files
1. tabbed editing
1. rotation with correct padding
1. non-destructive crop
1. grayscale export
1. JPEG and PNG download

Add TIFF import and advanced export combinations immediately after the core editing flow is stable.
