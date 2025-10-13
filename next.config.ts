import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    domains: ['v5.airtableusercontent.com', 'dl.airtable.com'],
  },
  serverExternalPackages: [
    'pdfkit',
    'fontkit',
    'unicode-properties',
    'linebreak',
    'iconv-lite',
  ],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
    ];
  },
};

export default nextConfig;
