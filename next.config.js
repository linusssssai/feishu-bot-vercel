/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel Edge Runtime 优化
  experimental: {
    serverActions: {
      allowedOrigins: ['*']
    }
  }
}

module.exports = nextConfig
