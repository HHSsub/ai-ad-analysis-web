/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Next.js 14에서 serverActions는 기본으로 활성화됨 - 제거
    // serverActions 관련 설정 제거
  },
  // Next.js 14에서 api 설정이 제거됨 - 대신 다른 방법 사용
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
    // 빌드 시 타입 체크 건너뛰기 (배포용)
    ignoreBuildErrors: false,
  },
  eslint: {
    // 빌드 시 ESLint 건너뛰기 (배포용)
    ignoreDuringBuilds: false,
  },
};

module.exports = nextConfig;
