#!/bin/bash

echo "🚀 YouTube 광고 분석 웹 배포 시작..."

# 프로젝트 디렉토리로 이동
cd ~/projects/ai-ad-analysis-web

# Git에서 최신 코드 가져오기
git pull origin main

# 의존성 설치
npm install

# 빌드
npm run build

# PM2로 서비스 재시작
pm2 restart api-server || pm2 start npm --name "api-server" -- run start:api

# Python 스크립트들을 별도 서비스로 실행
pm2 restart youtube-collector || pm2 start python3 --name "youtube-collector" -- youtube_ads_collector_with_db.py
pm2 restart web-connector || pm2 start python3 --name "web-connector" -- web_service_connector.py

# PM2 상태 확인
pm2 status

echo "✅ 배포 완료!"
echo "🌐 웹 서비스: http://16.171.199.44:3000"
echo "📊 PM2 모니터링: pm2 monit"
