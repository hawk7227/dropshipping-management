// ═══ DELIVERY ENVELOPE ═══
// FILE: lib/contracts/media.ts
// LINES: 42
// IMPORTS FROM: zod
// EXPORTS TO: lib/contracts/product.ts, lib/gates/, UI components
// DOES: Defines and validates product media. Images must be valid HTTP URLs. Primary image auto-derived from array. Image count is computed.
// DOES NOT: Check if URLs are reachable. Validate image dimensions (would need server-side fetch). Download images.
// BREAKS IF: zod not installed. URLs contain spaces (transform trims).
// ASSUMES: Images come as URL strings. No base64 or local paths.
// LEVEL: 3 — Integrated. URL format validated at boundary.
// VERIFIED: AI self-check.
// ═══════════════════════════════════════════════════════════

import { z } from 'zod';

const ImageUrlSchema = z.string().trim().refine(
  v => v === '' || /^https?:\/\/.+\..+/.test(v),
  'Image must be a valid HTTP/HTTPS URL'
);

const ImageArraySchema = z.array(ImageUrlSchema)
  .transform(arr => arr.filter(url => url.length > 0))
  .default([]);

export const ProductMediaSchema = z.object({
  images: ImageArraySchema,
}).transform(data => ({
  images: data.images,
  image: data.images[0] || '',       // Primary image = first in array
  imageCount: data.images.length,     // Computed count
})).pipe(
  z.object({
    images: z.array(z.string()),
    image: z.string(),
    imageCount: z.number(),
  })
);

export type ProductMedia = z.infer<typeof ProductMediaSchema>;
