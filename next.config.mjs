/** @type {import('next').NextConfig} */

const nextConfig = {
  // Docker 이미지만 standalone 으로 빌드. PC 운영(next start)은 일반 빌드를 써야 data/ 경로가 프로젝트 루트로 잡힙니다.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  // 로그인 확인용 proxy가 요청 본문을 10MB까지만 잡아 두면, 그 이상 PDF 업로드가 잘린다.
  experimental: {
    proxyClientMaxBodySize: '50mb',
  },
  serverExternalPackages: ['minio', 'pg', 'tesseract.js', 'sharp'],

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },
}

export default nextConfig
