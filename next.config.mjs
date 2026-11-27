/** @type {import('next').NextConfig} */

const nextConfig = {
  // Docker 이미지만 standalone 으로 빌드. PC 운영(next start)은 일반 빌드를 써야 data/ 경로가 프로젝트 루트로 잡힙니다.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  // 로그인 확인용 proxy가 요청 본문을 10MB까지만 잡아 두면, 그 이상 PDF 업로드가 잘린다.
  experimental: {
    proxyClientMaxBodySize: '50mb',
    // dev 서버가 컴파일 캐시를 디스크에 계속 써서(.next/dev/cache 7GB+) HDD 가 100% 가 되는 것을 막는다.
    turbopackFileSystemCacheForDev: false,
  },
  serverExternalPackages: ['minio', 'pg', 'tesseract.js', 'sharp'],
  // 개발 모드 화면 구석의 동그라미(N) 표시를 끈다.
  devIndicators: false,

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },
}

export default nextConfig
