'use client';

import React, { useEffect, useRef } from 'react';

export function LoadingOverlay({ visible }: { visible: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!visible) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    const updateHeight = () => {
      const vh = window.innerHeight;
      if (containerRef.current) {
        containerRef.current.style.setProperty('--overlay-height', `${vh}px`);
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    window.addEventListener('orientationchange', updateHeight);

    return () => {
      window.removeEventListener('resize', updateHeight);
      window.removeEventListener('orientationchange', updateHeight);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[80] flex w-screen flex-col items-center justify-center bg-white overflow-hidden"
      style={{
        minHeight: '100vh',
        height: 'var(--overlay-height, 100vh)',
        width: '100vw',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <video
        className="h-32 w-32 object-contain"
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
      >
        <source src="/video/loadingscreen.webm" type="video/webm" />
      </video>
      <p className="mt-6 text-sm font-medium text-[var(--color-outer-space)]/70">
        Collect is getting things ready…
      </p>
    </div>
  );
}
