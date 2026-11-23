# One Innovation — Brand Intelligence System

A local composition editor with one shared artboard across four tabs. Work through them in order or return to any tab while building a composition.

- **Artboard:** digital and print presets, custom dimensions, orientation, and print resolution.
- **Visual:** the four supplied SVG foundations, SVG import or vector paste, six color sets, solid dot colors, background colors and linear gradients, and dot controls with tone-driven Blended and Round dots patterns.
- **Imagery:** place raster images above the visual, frame and round their corners, and apply duotone or offset halftone treatments.
- **Layout:** typography, symbol/logotype/combination-mark placeholders, asset uploads, color, and transforms. Select, move, proportionally scale, align, and rotate objects on the artboard.

The four supplied originals are stored in `assets/foundations/strengthen.svg`, `reshape.svg`, `reorganize.svg`, and `optimize.svg`. Their original grayscale fills, blur filters, and proportions are preserved. Foundation thumbnails show these source vectors; the dot filter samples their combined luminance and alpha.

Blended follows the supplied shader’s Euclidean cosine screen: lighter outer tones form round particles, midtones form squares, and dense tones join into ink around shrinking holes. A shared continuous tone field is traced into editable SVG paths, including holes; there is no uniform circle-to-square slider. Round dots keeps the earlier circle renderer. Density, size, edge sampling, palette, and background gradients remain available.

The supplied `assets/effects/halftone.ts` and its metadata are archived for reference. `src/halftone-vector.js` reconstructs the Blended screen’s 50% coverage contour at the shader’s 45° monochrome screen angle, using marching squares and a compound SVG path. An inverse screen-area lookup preserves the earlier dot ink-area response while changing its geometry. It uses the editor’s existing grayscale/alpha mapping and brand color instead of the shader’s CMYK/RGB color separations. No raster halftone image or GPU shader is embedded in the effect.

## Run locally

Requires Node.js 20 or later. No dependency installation is needed.

```sh
npm run dev
```

Open **http://127.0.0.1:5173/**. To choose another port, run `npm run dev -- --port 5174`.

All composition and image processing runs in the browser. Imported files are not uploaded to an external service. Background removal uses edge-connected color selection: it works best on plain, contrasting backgrounds and is not an AI subject-segmentation service. Adjust its tolerance for the source image.

SVG input is sanitized before local rendering and conversion to dots. External resources and active SVG content are removed.

## Build

```sh
npm run build
npm run preview
```

The `dist/` folder contains the static editor. The build also creates **`dist/OI-KV-Studio.html`**, a standalone copy with its modules, styles, icons, and both fonts embedded. Open it directly in a browser without a server or internet connection.

## Assets

The editor uses the supplied **Aeonik Pro Regular** and **Signifier Light** fonts from `assets/`; their original licenses continue to apply. Navigation and controls use official regular-weight [Phosphor Icons](https://github.com/phosphor-icons/core), vendored from `@phosphor-icons/core` 2.1.1. Its MIT license is included in `assets/phosphor-LICENSE` and embedded in the standalone file.

Brand palette: `#AACEF3`, `#3982E9`, `#16365A`, `#F4F4F4`, `#FDA68C`, `#FF6638`. Six provisional color sets can be refined later.


## Example imagery

Four locally bundled people photos provide plain white or gray backgrounds for trying image placement, color treatments, framing, and background removal. Images are optimized to a maximum 1000-pixel side and remain available offline in the standalone editor. Source photos are free under the [Unsplash License](https://unsplash.com/license).

- **Light studio:** [simas Mo](https://unsplash.com/@simasmo), [original photo](https://unsplash.com/photos/a-woman-standing-in-front-of-a-white-background-Hfh3FzWjuCk).
- **Pink & white:** [Zaven Baghdasaryan](https://unsplash.com/@zmicaphoto), [original photo](https://unsplash.com/photos/a-woman-poses-wearing-a-pink-top-and-black-pants-Gi20v7u_xYo).
- **Open space:** [Christoph Aigner](https://unsplash.com/@christophaigner), [original photo](https://unsplash.com/photos/smiling-man-in-a-dark-jacket-against-a-gray-background-VBU3WW_Japk).
- **Gray portrait:** [Vitaly Gariev](https://unsplash.com/@silverkblack), [original photo](https://unsplash.com/photos/an-older-asian-man-wearing-a-plaid-shirt-pWPFsDXgt04).

Use the alignment controls or smart guides to align to artboard edges and centers. Hold Option/Alt while scaling a corner to scale from the center, Shift while moving to constrain movement, and Shift while rotating for 15° steps. Option/Alt-drag duplicates an object. Toggle smart guides with Command/Ctrl+U.

## GitHub Pages

The repository includes `.github/workflows/pages.yml`. A push to `main` builds the editor with Node.js 24, uploads only `dist/`, and deploys it through the official GitHub Pages actions. The workflow can also be run manually. Set the repository's Pages publishing source to **GitHub Actions** before the first deployment.

Asset paths are relative, so the same build runs at the localhost root or a project address such as `https://<owner>.github.io/oikv/`. No base-URL setting is required. The generated standalone HTML remains self-contained.

The repository tracks only the two fonts used by the editor; other supplied font weights and local build outputs are ignored. GitHub Pages supports private source repositories on eligible GitHub plans. Source-repository visibility and live-site visibility are separate GitHub settings; this workflow does not change either.

## GitHub hosting

Source is stored in the private [giangnguyenday/oikv](https://github.com/giangnguyenday/oikv) repository. GitHub Pages is not live because the current account plan does not support Pages for private repositories. The optional Pages workflow can be run manually once the account supports it.
