'use client';

import { useState, useEffect } from 'react';
import { SiteLogo } from './site-logo';

/**
 * SplashScreen — shows a branded loading overlay with logo animation
 * on initial website load. Fades out once the page is ready.
 */
export function SplashScreen({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Wait for the page to be ready, then fade out
    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
    }, 1200);

    const hideTimer = setTimeout(() => {
      setVisible(false);
    }, 1700); // fade-out duration (500ms) + display time

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return <>{children}</>;

  return (
    <>
      {/* Splash overlay */}
      <div
        className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background transition-opacity duration-500 ${
          fadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        {/* Logo with animation */}
        <div className="splash-logo-container mb-6">
          <div className="splash-logo-glow" />
          <SiteLogo size={88} className="rounded-2xl relative z-10" />
        </div>

        {/* Brand name */}
        <h1 className="splash-text text-2xl font-bold tracking-tight text-foreground relative z-10">
          KarmaBoard
        </h1>

        {/* Loading dots */}
        <div className="splash-dots flex gap-1.5 mt-5">
          <span className="splash-dot w-2 h-2 rounded-full bg-primary" />
          <span className="splash-dot w-2 h-2 rounded-full bg-primary" style={{ animationDelay: '0.15s' }} />
          <span className="splash-dot w-2 h-2 rounded-full bg-primary" style={{ animationDelay: '0.3s' }} />
        </div>
      </div>

      {/* Actual content (hidden behind splash) */}
      <div className={fadeOut ? '' : 'invisible'}>
        {children}
      </div>
    </>
  );
}