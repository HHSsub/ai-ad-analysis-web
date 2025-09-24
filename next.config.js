/** @type {import('next').NextConfig} */
const nextConfig = {
  // 환경변수
  env: {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://localhost:3000',
  },
  
  // 이미지 도메인 (YouTube 썸네일)
  images: {
    domains: ['i.ytimg.com', 'img.youtube.com'],
  },
  
  // 외부 패키지 설정
  experimental: {
    serverComponentsExternalPackages: ['googleapis', 'google-auth-library'],
  },
  
  // TypeScript/ESLint 설정
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  
  // 프로덕션 최적화
  swcMinify: true,
  output: 'standalone',
};

module.exports = nextConfig;
