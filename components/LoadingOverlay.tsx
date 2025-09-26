'use client';

import React from 'react';

export function LoadingOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-white">
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
