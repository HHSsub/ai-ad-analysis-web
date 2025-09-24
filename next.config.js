/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Next.js 14에서는 serverActions가 기본으로 활성화됨
  },
  images: {
    domains: ['i.ytimg.com', 'img.youtube.com'],
    unoptimized: true
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        child_process: false,
        sqlite3: false,
      };
    }
    return config;
  },
  // 환경변수 설정
  env: {
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    SERPAPI_KEY: process.env.SERPAPI_KEY,
    GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID,
  },
  // 빌드 최적화
  typescript: {
    // 타입 체크 유지하되 중요하지 않은 오류는 허용
    ignoreBuildErrors: false,
  },
  eslint: {
    // ESLint 체크 유지
    ignoreDuringBuilds: false,
  },
  // API 응답 시간 제한 증가
  serverRuntimeConfig: {
    maxDuration: 300
  },
};

module.exports = nextConfig;
