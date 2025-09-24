#!/bin/bash

echo "🚀 YouTube 광고 분석 웹 배포 시작..."

# 프로젝트 디렉토리
PROJECT_DIR="/home/ubuntu/projects/ai-ad-analysis-web"
cd $PROJECT_DIR

# Git 최신 코드 가져오기
echo "📥 최신 코드 가져오기..."
git pull origin main

# 필요한 디렉토리 생성
mkdir -p logs data

# Node.js 의존성 설치
echo "📦 Node.js 의존성 설치..."
npm install

# Python 가상환경 체크 및 생성
if [ ! -d "venv" ]; then
    echo "🐍 Python 가상환경 생성..."
    python3 -m venv venv
fi

# Python 의존성 설치
echo "📦 Python 의존성 설치..."
./venv/bin/pip install -r python_scripts/requirements.txt

# 빌드
echo "🔨 Next.js 빌드..."
if npm run build; then
    echo "✅ 빌드 성공!"
else
    echo "⚠️ 빌드 실패! 계속 진행..."
fi

# PM2 프로세스 정리
echo "🧹 기존 PM2 프로세스 정리..."
pm2 delete all || true

# PM2로 서비스 시작
echo "🚀 PM2로 서비스 시작..."
pm2 start ecosystem.config.js

# 자동화 스케줄러 추가
pm2 start scripts/auto-scheduler.js --name "auto-scheduler" --log-date-format "YYYY-MM-DD HH:mm:ss"

# PM2 저장 및 자동 시작 설정
pm2 save
pm2 startup

# 상태 확인
echo "📊 서비스 상태 확인..."
pm2 status
pm2 logs --lines 20

echo "
✅ 배포 완료!

🌐 웹 서비스: http://16.171.199.44:3000
📊 PM2 모니터링: pm2 monit
📝 로그 확인: pm2 logs [프로세스명]
🔄 재시작: pm2 restart all

자동화 상태:
- 웹 서비스: youtube-ad-web
- Python 수집기: youtube-collector
- 웹 연동기: web-connector  
- 자동 스케줄러: auto-scheduler

자동화 테스트:
curl -X POST http://localhost:3000/api/automation/trigger \\
  -H 'Content-Type: application/json' \\
  -d '{\"action\": \"collect_and_analyze\", \"maxAds\": 10}'
"
