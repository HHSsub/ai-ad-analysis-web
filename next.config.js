/** @type {import('next').NextConfig} */
const nextConfig = {
  // experimental.serverActions는 Next.js 14에서 기본으로 활성화됨 - 제거
  experimental: {
    // 필요한 다른 실험적 기능들만 여기에 추가
  },
  // API 타임아웃 증가 (Gemini API 호출용)
  api: {
    responseLimit: false,
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
  // 이미지 도메인 허용 (YouTube 썸네일용)
  images: {
    domains: ['i.ytimg.com', 'img.youtube.com'],
    unoptimized: true
  },
  // Webpack 설정
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        child_process: false,
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
  }
};

module.exports = nextConfig;
