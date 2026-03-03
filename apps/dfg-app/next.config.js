const withSerwistInit = require('@serwist/next').default

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Empty turbopack config to silence webpack/turbopack warning in Next.js 16
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pub-dfg-evidence.r2.dev',
      },
      {
        protocol: 'https',
        hostname: '*.sierraauction.com',
      },
      {
        protocol: 'https',
        hostname: '*.ironplanet.com',
      },
      {
        protocol: 'https',
        hostname: 'd3j17a2r8lnfte.cloudfront.net', // Sierra CDN
      },
      {
        protocol: 'https',
        hostname: '*.cloudfront.net', // Allow all CloudFront (auction CDNs)
      },
    ],
  },
}

module.exports = withSerwist(nextConfig)
