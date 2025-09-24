const cron = require('node-cron');
const axios = require('axios');
require('dotenv').config({ path: '.env.local' });

const API_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

// 로그 함수
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
}

// 자동 수집 및 분석 실행
async function runAutomation() {
  try {
    log('자동화 작업 시작...');
    
    // 자동화 API 호출
    const response = await axios.post(`${API_URL}/api/automation/trigger`, {
      action: 'collect_and_analyze',
      maxAds: 30,
      autoUpload: true,
    });
    
    if (response.data.success) {
      const { collection, analysis } = response.data;
      
      log(`수집 완료: ${collection.new_ads || 0}개 신규 광고`);
      log(`분석 완료: ${analysis.analyzed || 0}개 영상`);
      
      if (analysis.analyzed > 0) {
        log('Google Drive 업로드 완료');
      }
    } else {
      log(`자동화 실패: ${response.data.error}`, 'ERROR');
    }
    
  } catch (error) {
    log(`자동화 오류: ${error.message}`, 'ERROR');
  }
}

// 메인 함수
async function main() {
  log('자동화 스케줄러 시작');
  
  // 환경변수에서 실행 간격 읽기
  const INTERVAL_MINUTES = process.env.COLLECTION_INTERVAL_MINUTES || 30;
  
  // 즉시 실행 옵션
  if (process.argv.includes('--run-now')) {
    await runAutomation();
    process.exit(0);
  }
  
  // 크론 스케줄 설정
  const cronExpression = `*/${INTERVAL_MINUTES} * * * *`;
  log(`스케줄 설정: ${cronExpression} (${INTERVAL_MINUTES}분마다)`);
  
  // 스케줄 등록
  cron.schedule(cronExpression, runAutomation, {
    scheduled: true,
    timezone: 'Asia/Seoul'
  });
  
  // 시작시 한번 실행
  if (process.env.AUTO_COLLECTION_ENABLED === 'true') {
    log('초기 실행 시작');
    runAutomation().catch(err => {
      log(`초기 실행 실패: ${err.message}`, 'ERROR');
    });
  }
  
  // 종료 신호 처리
  process.on('SIGTERM', () => {
    log('SIGTERM 수신 - 종료 중...');
    process.exit(0);
  });
  
  process.on('SIGINT', () => {
    log('SIGINT 수신 - 종료 중...');
    process.exit(0);
  });
}

// 실행
main().catch(error => {
  log(`스케줄러 시작 실패: ${error.message}`, 'ERROR');
  process.exit(1);
});
