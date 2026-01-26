/** @type {import('next').NextConfig} */
const nextConfig = {
  // Skip TypeScript errors during build
  typescript: {
    ignoreBuildErrors: true,
  },
  // Skip ESLint errors during build
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Other config options
  images: {
    domains: ['picsum.photos', 'images.unsplash.com', 'm.media-amazon.com', 'i.imgur.com'],
  },
};

module.exports = nextConfig;
