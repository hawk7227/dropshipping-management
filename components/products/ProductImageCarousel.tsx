'use client';

// components/products/ProductImageCarousel.tsx
// REUSABLE image carousel for product cards and table rows
// Renders the images jsonb array from the products table
// Falls back to image_url, then to a placeholder
// NEW FILE — does not modify any existing files

import { useState, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ProductImageCarouselProps {
  /** Product images array from DB (images jsonb column) */
  images?: Array<{ src: string; alt?: string }> | null;
  /** Fallback single image URL (image_url column) */
  imageUrl?: string | null;
  /** Alt text for accessibility */
  alt?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes on the wrapper */
  className?: string;
  /** Show navigation arrows on hover */
  showArrows?: boolean;
  /** Show dot indicators */
  showDots?: boolean;
  /** Show image count badge (e.g., "1/4") */
  showCount?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// SIZE CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const SIZE_CLASSES = {
  sm: 'h-12 w-12',
  md: 'h-32 w-full',
  lg: 'h-48 w-full',
};

// ═══════════════════════════════════════════════════════════════════════════
// PLACEHOLDER SVG (no external deps)
// ═══════════════════════════════════════════════════════════════════════════

function PlaceholderImage({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center bg-gray-100 ${className || ''}`}>
      <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function ProductImageCarousel({
  images,
  imageUrl,
  alt = 'Product image',
  size = 'md',
  className = '',
  showArrows = true,
  showDots = true,
  showCount = true,
}: ProductImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imgError, setImgError] = useState<Set<number>>(new Set());
  const [isHovered, setIsHovered] = useState(false);

  // Build the resolved image list
  // Priority: images array → image_url fallback → empty
  const imageList: Array<{ src: string; alt?: string }> = [];

  if (images && Array.isArray(images) && images.length > 0) {
    images.forEach(img => {
      if (img && img.src) {
        imageList.push(img);
      }
    });
  }

  // If images array was empty or had no valid entries, try image_url
  if (imageList.length === 0 && imageUrl) {
    imageList.push({ src: imageUrl, alt });
  }

  const totalImages = imageList.length;
  const hasMultiple = totalImages > 1;

  // ─── Navigation ──────────────────────────────────────────────────────
  const goTo = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  const goNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setCurrentIndex(prev => (prev + 1) % totalImages);
  }, [totalImages]);

  const goPrev = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setCurrentIndex(prev => (prev - 1 + totalImages) % totalImages);
  }, [totalImages]);

  const handleImgError = useCallback((index: number) => {
    setImgError(prev => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }, []);

  // ─── No images at all ────────────────────────────────────────────────
  if (totalImages === 0) {
    return (
      <div className={`relative overflow-hidden rounded-lg ${SIZE_CLASSES[size]} ${className}`}>
        <PlaceholderImage className="w-full h-full" />
      </div>
    );
  }

  // ─── Single image (no carousel controls) ─────────────────────────────
  if (!hasMultiple) {
    const img = imageList[0];
    return (
      <div className={`relative overflow-hidden rounded-lg ${SIZE_CLASSES[size]} ${className}`}>
        {imgError.has(0) ? (
          <PlaceholderImage className="w-full h-full" />
        ) : (
          <img
            src={img.src}
            alt={img.alt || alt}
            className="w-full h-full object-cover"
            onError={() => handleImgError(0)}
            loading="lazy"
          />
        )}
      </div>
    );
  }

  // ─── Multi-image carousel ────────────────────────────────────────────
  return (
    <div
      className={`relative overflow-hidden rounded-lg ${SIZE_CLASSES[size]} ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Images */}
      {imageList.map((img, i) => (
        <div
          key={i}
          className={`absolute inset-0 transition-opacity duration-200 ${
            i === currentIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'
          }`}
        >
          {imgError.has(i) ? (
            <PlaceholderImage className="w-full h-full" />
          ) : (
            <img
              src={img.src}
              alt={img.alt || `${alt} ${i + 1}`}
              className="w-full h-full object-cover"
              onError={() => handleImgError(i)}
              loading="lazy"
            />
          )}
        </div>
      ))}

      {/* Navigation Arrows — visible on hover */}
      {showArrows && hasMultiple && isHovered && (
        <>
          <button
            onClick={goPrev}
            className="absolute left-1 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-all"
            aria-label="Previous image"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={goNext}
            className="absolute right-1 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-all"
            aria-label="Next image"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* Dot Indicators */}
      {showDots && hasMultiple && (
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-20 flex gap-1">
          {imageList.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); goTo(i); }}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === currentIndex
                  ? 'bg-white w-3'
                  : 'bg-white/50 hover:bg-white/75'
              }`}
              aria-label={`Go to image ${i + 1}`}
            />
          ))}
        </div>
      )}

      {/* Image Count Badge */}
      {showCount && hasMultiple && (
        <div className="absolute top-1.5 right-1.5 z-20 bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full">
          {currentIndex + 1}/{totalImages}
        </div>
      )}
    </div>
  );
}

export default ProductImageCarousel;
