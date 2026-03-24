# Tech Stack

## Core Technologies

* **Package manager:** `pnpm`
* **Build tool:** `Vite` (library mode for packages, app mode for demo)
* **Language:** `TypeScript`
* **Rendering:** HTML Canvas for preview, `OffscreenCanvas` in workers
* **Heavy processing:** Web Workers to keep the UI thread responsive
* **Image decode/encode:** browser-native APIs for JPEG/PNG; `utif` for TIFF
* **Unit testing:** Vitest
* **Browser/e2e testing:** Playwright

## Library Choices

* **TIFF decode/encode:** `utif` — handles both directions; used directly in the worker
* **Resize:** browser `imageSmoothingQuality: 'high'` on `OffscreenCanvas` — sufficient for current use; no third-party resize library
* **No canvas abstraction framework** — the transform pipeline is custom throughout

## Rationale

This combination is appropriate because the product is an embeddable browser library, not a full website. It needs a fast development loop, distributable library bundles, and a clean path for worker-based image processing without shipping unnecessary framework code to consumers.
