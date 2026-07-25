import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Link Protect',
    short_name: 'Link Protect',
    description: 'Protect your Discord server from scam links, raids and spam.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0c',
    theme_color: '#0a0a0c',
    icons: [
      { src: '/icon.png', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
