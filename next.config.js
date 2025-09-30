/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    SERPAPI_KEY: process.env.SERPAPI_KEY,
    GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID,
    GOOGLE_SERVICE_ACCOUNT_CREDENTIALS: process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS,
    GOOGLE_WORKSPACE_ADMIN_EMAIL: process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://localhost:3000',
  },
  reactStrictMode: true,
  swcMinify: true,
};

module.exports = nextConfig;
