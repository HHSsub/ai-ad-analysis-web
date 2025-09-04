#!/bin/bash

# YouTube 영상 분석기 Vercel 배포 스크립트

echo "🚀 YouTube 영상 분석기 배포 시작..."

# 1. 의존성 설치 확인
echo "📦 의존성 설치 중..."
npm install

# 2. 환경변수 확인
if [ ! -f ".env.local" ]; then
  echo "⚠️  .env.local 파일이 없습니다. .env.example을 복사하여 생성하세요."
  cp .env.example .env.local
  echo "✅ .env.local 파일을 생성했습니다. API 키를 설정해주세요."
fi

# 3. 빌드 테스트
echo "🔨 빌드 테스트 중..."
npm run build

if [ $? -eq 0 ]; then
  echo "✅ 빌드 성공"
else
  echo "❌ 빌드 실패 - 배포를 중단합니다."
  exit 1
fi

# 4. Vercel CLI 설치 확인
if ! command -v vercel &> /dev/null; then
  echo "📥 Vercel CLI 설치 중..."
  npm install -g vercel
fi

# 5. Vercel 배포
echo "🌐 Vercel 배포 중..."
vercel --prod

# 6. 환경변수 설정 안내
echo ""
echo "🔧 배포 후 필수 설정:"
echo "1. Vercel 대시보드에서 환경변수 설정:"
echo "   - YOUTUBE_API_KEY: [귀하의 YouTube API 키]"
echo "   - GEMINI_API_KEY: [귀하의 Gemini API 키]"
echo ""
echo "2. 환경변수 설정 후 재배포:"
echo "   vercel --prod"
echo ""
echo "✅ 배포 완료!"