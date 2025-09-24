const cron = require('node-cron');
const axios = require('axios');
const { execSync } = require('child_process');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const API_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const DB_PATH = path.join(process.cwd(), 'data', 'youtube_ads.db');

// 로그 함수
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
}

// DB에서 대기중인 광고 개수 확인
function getPendingCount() {
  try {
    const result = execSync(
      `sqlite3 -json "${DB_PATH}" "SELECT COUNT(*) as count FROM youtube_ads WHERE analysis_status = 'pending'"`
    ).toString();
    const data = JSON.parse(result || '[{"count":0}]');
    return data[0].count;
  } catch (error) {
    log(`DB 조회 실패: ${error.message}`, 'ERROR');
    return 0;
  }
}

// 대기중인 광고 가져오기 (배치)
function getPendingAds(limit = 30) {
  try {
    const query = `
      SELECT id, title, url, note, collected_at 
      FROM youtube_ads 
      WHERE analysis_status = 'pending' 
      ORDER BY collected_at DESC 
      LIMIT ${limit}
    `;
    const result = execSync(`sqlite3 -json "${DB_PATH}" "${query}"`).toString();
    return JSON.parse(result || '[]');
  } catch (error) {
    log(`DB 조회 실패: ${error.message}`, 'ERROR');
    return [];
  }
}

// 분석 상태 업데이트
function updateAnalysisStatus(url, status) {
  try {
    const query = `UPDATE youtube_ads SET analysis_status = '${status}', analyzed_at = datetime('now') WHERE url = '${url}'`;
    execSync(`sqlite3 "${DB_PATH}" "${query}"`);
  } catch (error) {
    log(`상태 업데이트 실패: ${error.message}`, 'ERROR');
  }
}

// 영상 분석 API 호출
async function analyzeVideo(video) {
  try {
    const response = await axios.post(`${API_URL}/api/analyze`, {
      videos: [{
        id: video.id || `auto_${Date.now()}`,
        title: video.title,
        url: video.url,
        note: video.note || '자동 수집됨'
      }]
    });

    if (response.data.success) {
      log(`분석 성공: ${video.title}`);
      updateAnalysisStatus(video.url, 'completed');
      return { success: true, sessionId: response.data.sessionId };
    } else {
      throw new Error('분석 API 실패');
    }
  } catch (error) {
    log(`분석 실패: ${video.url} - ${error.message}`, 'ERROR');
    updateAnalysisStatus(video.url, 'failed');
    return { success: false, error: error.message };
  }
}

// 전체 자동 분석 실행
async function runFullAnalysis() {
  try {
    log('=== 전체 자동 분석 시작 ===');
    
    // 1. 대기중인 광고 총 개수 확인
    const totalPending = getPendingCount();
    log(`대기중인 광고: ${totalPending}개`);
    
    if (totalPending === 0) {
      log('분석할 광고가 없습니다.');
      return;
    }
    
    // 2. 배치별로 처리 (API 할당량 고려)
    const BATCH_SIZE = 30;  // 한 번에 처리할 개수
    const DELAY_BETWEEN_VIDEOS = 5000;  // 영상 간 대기 시간 (5초)
    const DELAY_BETWEEN_BATCHES = 60000;  // 배치 간 대기 시간 (1분)
    
    let totalAnalyzed = 0;
    let totalFailed = 0;
    let shouldContinue = true;
    
    while (shouldContinue && totalPending > totalAnalyzed) {
      // 배치 가져오기
      const batch = getPendingAds(BATCH_SIZE);
      
      if (batch.length === 0) {
        log('더 이상 분석할 광고가 없습니다.');
        break;
      }
      
      log(`배치 처리 시작: ${batch.length}개`);
      
      // 배치 내 영상 분석
      for (let i = 0; i < batch.length; i++) {
        const video = batch[i];
        log(`분석 중 (${totalAnalyzed + i + 1}/${totalPending}): ${video.title}`);
        
        const result = await analyzeVideo(video);
        
        if (result.success) {
          totalAnalyzed++;
        } else {
          totalFailed++;
          
          // 연속 실패 시 중단
          if (totalFailed > 5) {
            log('연속 실패로 인해 분석 중단', 'WARN');
            shouldContinue = false;
            break;
          }
        }
        
        // API Rate Limit 대응
        if (i < batch.length - 1) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_VIDEOS));
        }
      }
      
      // 다음 배치 전 대기
      if (shouldContinue && getPendingCount() > 0) {
        log(`다음 배치 전 ${DELAY_BETWEEN_BATCHES / 1000}초 대기...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }
    
    // 3. Google Drive 업로드 (선택사항)
    if (totalAnalyzed > 0) {
      try {
        const timestamp = new Date().toISOString().split('T')[0];
        const uploadResponse = await axios.post(`${API_URL}/api/drive/upload`, {
          fileName: `auto_analysis_${timestamp}_${totalAnalyzed}videos.csv`,
          data: { message: `${totalAnalyzed}개 영상 분석 완료` },
          dataType: 'csv'
        });
        
        if (uploadResponse.data.success) {
          log('Google Drive 업로드 완료');
        }
      } catch (error) {
        log('Drive 업로드 실패', 'WARN');
      }
    }
    
    log(`=== 분석 완료: 성공 ${totalAnalyzed}개, 실패 ${totalFailed}개 ===`);
    
  } catch (error) {
    log(`전체 분석 오류: ${error.message}`, 'ERROR');
  }
}

// 메인 함수
async function main() {
  log('전체 자동 분석 스케줄러 시작');
  
  // 환경변수 확인
  const INTERVAL_MINUTES = process.env.ANALYSIS_INTERVAL_MINUTES || 60;
  
  // 즉시 실행 옵션
  if (process.argv.includes('--run-now')) {
    await runFullAnalysis();
    process.exit(0);
  }
  
  // 크론 스케줄 설정 (매시간)
  const cronExpression = `0 */${INTERVAL_MINUTES} * * *`;
  log(`스케줄 설정: ${cronExpression} (${INTERVAL_MINUTES}분마다)`);
  
  cron.schedule(cronExpression, runFullAnalysis, {
    scheduled: true,
    timezone: 'Asia/Seoul'
  });
  
  // 시작 시 한번 실행
  log('초기 실행 시작');
  runFullAnalysis().catch(err => {
    log(`초기 실행 실패: ${err.message}`, 'ERROR');
  });
  
  // 종료 신호 처리
  process.on('SIGTERM', () => {
    log('종료 중...');
    process.exit(0);
  });
}

// 실행
main().catch(error => {
  log(`스케줄러 시작 실패: ${error.message}`, 'ERROR');
  process.exit(1);
});
