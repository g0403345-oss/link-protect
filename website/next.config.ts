import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com',
      },
      {
        protocol: 'https',
        hostname: 'i.imgur.com',
      },
    ],
  },
  serverExternalPackages: ['better-sqlite3'],
  // Consolidate SEO on the custom domain: permanently redirect the stable
  // *.vercel.app production alias to link-protect.com. Hashed preview URLs
  // (link-protect-<hash>-…vercel.app) are left alone so previews still work.
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'link-protect.vercel.app' }],
        destination: 'https://link-protect.com/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
