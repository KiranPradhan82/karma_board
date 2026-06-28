'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Hammer } from 'lucide-react';

// The default K-monogram logo as an inline SVG data URL
const DEFAULT_LOGO = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none"><rect width="512" height="512" rx="108" fill="%230a0a0a"/><path d="M148 128v256h52V128h-52z" fill="%23ffffff"/><path d="M364 128L230 260l134 124h-62L180 260l122-132h62z" fill="%23ffffff"/></svg>`)}`;

interface SiteLogoProps {
  /** Size in pixels. Default 32. */
  size?: number;
  /** Extra class names (e.g. "rounded-lg") */
  className?: string;
  /** If true, show the Hammer icon fallback instead of SVG */
  iconFallback?: boolean;
}

/**
 * SiteLogo — shows the custom logo from Settings, or the default K-monogram.
 * Fetches once from /api/branding (public, no auth).
 */
export function SiteLogo({ size = 32, className = '', iconFallback = false }: SiteLogoProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/branding')
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) {
          const url = json?.data?.logo || DEFAULT_LOGO;
          setLogoUrl(url);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLogoUrl(DEFAULT_LOGO);
          setLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, []);

  if (!loaded || !logoUrl) {
    // Skeleton placeholder
    return (
      <div
        className={`bg-muted animate-pulse shrink-0 ${className}`}
        style={{ width: size, height: size, borderRadius: size > 24 ? 8 : 6 }}
      />
    );
  }

  if (iconFallback) {
    return (
      <div
        className={`flex items-center justify-center bg-primary text-primary-foreground shrink-0 ${className}`}
        style={{ width: size, height: size, borderRadius: size > 24 ? 8 : 6 }}
      >
        <Hammer style={{ width: size * 0.5, height: size * 0.5 }} />
      </div>
    );
  }

  return (
    <Image
      src={logoUrl}
      alt="KarmaBoard"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      style={{ borderRadius: size > 24 ? 8 : 6 }}
      unoptimized
      priority
    />
  );
}