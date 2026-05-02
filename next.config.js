/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.fal.media' },
      { protocol: 'https', hostname: 'fal.media' },
      { protocol: 'https', hostname: 'v3.fal.media' },
      { protocol: 'https', hostname: 'storage.googleapis.com' }
    ]
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '15mb'
    }
  }
};

module.exports = nextConfig;
