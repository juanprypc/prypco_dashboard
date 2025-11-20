'use client';

import { usePathname } from 'next/navigation';

const WHATSAPP_NUMBER = '971508993501';
const WHATSAPP_MESSAGE = 'Hi, I need help with the Prypco Collect dashboard.';

export function FloatingWhatsAppCta() {
  const pathname = usePathname() || '';

  // Hide on admin/damac/test pages to avoid interfering with ops tooling
  const hidden =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/damac') ||
    pathname.startsWith('/test-damac-map') ||
    pathname.startsWith('/api');

  if (hidden) return null;

  const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

  return (
    <div className="fixed bottom-4 right-4 z-[120] sm:bottom-6 sm:right-6">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="group inline-flex items-center gap-2 rounded-full bg-[#25D366] px-3 py-3 text-sm font-semibold text-white shadow-[0_14px_38px_-18px_rgba(37,211,102,0.8)] transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_42px_-18px_rgba(37,211,102,0.9)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b45]"
        aria-label="WhatsApp support"
      >
        <svg
          aria-hidden
          className="h-5 w-5 shrink-0"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M20.52 3.48A11.83 11.83 0 0 0 12.03.25C5.53.25.25 5.53.25 12.03c0 2.12.55 4.19 1.6 6.02L.1 23.9l6-1.69a11.8 11.8 0 0 0 5.92 1.57h.01c6.5 0 11.78-5.28 11.78-11.78 0-3.15-1.23-6.11-3.29-8.52ZM12.03 21a9.8 9.8 0 0 1-4.98-1.37l-.36-.21-3.56 1 .95-3.47-.23-.36a9.76 9.76 0 0 1-1.52-5.26c0-5.39 4.39-9.78 9.79-9.78 2.61 0 5.07 1.01 6.92 2.85A9.75 9.75 0 0 1 21.83 12c0 5.4-4.39 9.79-9.8 9.79Zm5.35-7.28c-.32-.16-1.9-.94-2.2-1.05-.3-.11-.52-.16-.74.16-.22.32-.85 1.05-1.04 1.26-.19.21-.38.24-.7.08-.32-.16-1.33-.49-2.54-1.56-.94-.83-1.57-1.85-1.75-2.16-.18-.32-.02-.49.13-.65.13-.13.32-.35.48-.53.16-.19.21-.32.32-.54.11-.22.05-.4-.03-.56-.08-.16-.74-1.78-1.02-2.44-.27-.65-.54-.56-.74-.57h-.64c-.22 0-.56.08-.85.4-.29.32-1.11 1.08-1.11 2.63 0 1.55 1.13 3.05 1.28 3.26.16.21 2.23 3.4 5.4 4.77.76.33 1.36.52 1.82.67.76.24 1.45.21 1.99.13.61-.09 1.9-.77 2.17-1.51.27-.75.27-1.4.19-1.54-.08-.13-.29-.21-.61-.37Z" />
        </svg>
        <span className="hidden sm:inline">WhatsApp support</span>
      </a>
    </div>
  );
}
