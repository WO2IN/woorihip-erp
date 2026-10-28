/** @type {import('next').NextConfig} */

const nextConfig = {
  // Docker 이미지만 standalone 으로 빌드. PC 운영(next start)은 일반 빌드를 써야 data/ 경로가 프로젝트 루트로 잡힙니다.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  serverExternalPackages: ['minio', 'pg', 'tesseract.js', 'sharp'],

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },
}

export default nextConfig
