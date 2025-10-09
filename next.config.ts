import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    domains: ['v5.airtableusercontent.com', 'dl.airtable.com'],
  },
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
