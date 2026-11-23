# Supplied Halftone source

`halftone.ts` and `features.json` are unchanged copies of the supplied `Halftone-source` files.

Metadata declares the effect name **Halftone**, version **2**, with `isAnimated: false` and `usesMouse: false`.

The TypeScript file targets Figma's shader API (`figma:shaders`) and contains WGSL blur and halftone passes. Its exposed properties are Pattern (Dot / Blended), Color mode (CMYK / RGB / BW light / BW dark), Dot size, Dot scale, Softness, Rotation, Center, and Clip to alpha.

These files preserve the supplied source for reference. The browser editor ports the Euclidean Blended screen into `src/halftone-vector.js`: low coverage gives circles, half coverage gives squares at the monochrome screen’s 45° angle, and high coverage gives connected ink with holes. Marching squares traces that continuous field into an editable compound SVG path. The editor retains its existing grayscale/alpha mapping, palette, and background gradients; the Figma shader runtime and its CMYK/RGB color modes are not imported or bundled.
