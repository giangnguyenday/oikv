# Supplied Halftone source

`halftone.ts` and `features.json` are unchanged copies of the supplied `Halftone-source` files.

Metadata declares the effect name **Halftone**, version **2**, with `isAnimated: false` and `usesMouse: false`.

The TypeScript file targets Figma's shader API (`figma:shaders`) and contains WGSL blur and halftone passes. Its exposed properties are Pattern (Dot / Blended), Color mode (CMYK / RGB / BW light / BW dark), Dot size, Dot scale, Softness, Rotation, Center, and Clip to alpha.

These files preserve the supplied source for reference. The browser editor keeps its previous SVG particle renderer, with a circle-to-square outline control. The original shader and its color modes are not imported by the web app, copied into the production artifact, or embedded in the standalone HTML.
