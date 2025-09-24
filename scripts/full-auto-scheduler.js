const cron = require('node-cron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: '.env.local' });

// 실제 DB 경로 (프로젝트 루트에 있음)
const DB_PATH = path.join(process.cwd(), 'youtube_ads.db');
const API_URL = 'http://localhost:3000';

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
}

// Step 1: Python으로 YouTube 광고 수집
async function collectYouTubeAds() {
  return new Promise((resolve, reject) => {
    log('YouTube 광고 수집 시작...');
    
    const pythonScript = path.join(process.cwd(), 'python_scripts', 'youtube_ads_collector_auto_wrapper.py');
    const venvPython = path.join(process.cwd(), 'venv', 'bin', 'python');
    
    const pythonProcess = spawn(venvPython, [pythonScript], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SERPAPI_KEY: '646e6386e54a3e331122aa9460166830bcdbd35c89283b857dcf66901e11db2a',
        MAX_ADS_PER_QUERY: '50',
        AUTO_MODE: 'true'
      }
    });
    
    let collected = 0;
    
    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('[Python]', output.trim());
      
      // 결과 파싱
      if (output.includes('RESULT_JSON:')) {
        try {
          const jsonStr = output.split('RESULT_JSON:')[1].trim();
          const result = JSON.parse(jsonStr);
          collected = result.new_ads || 0;
        } catch (e) {}
      }
    });
    
    pythonProcess.stderr.on('data', (data) => {
      console.error('[Python Error]', data.toString());
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        log(`수집 완료: ${collected}개 신규 광고`);
        resolve(collected);
      } else {
        reject(new Error(`Python 수집 실패 (code: ${code})`));
      }
    });
  });
}

// Step 2: 대기중인 광고 분석
async function analyzePendingAds() {
  try {
    log('대기중인 광고 분석 시작...');
    
    // DB에서 pending 광고 가져오기
    const query = `
      SELECT url, title, note 
      FROM youtube_ads 
      WHERE analysis_status = 'pending' 
      ORDER BY collected_at DESC 
      LIMIT 50
    `;
    
    const result = execSync(`sqlite3 -json "${DB_PATH}" "${query}"`).toString();
    const pendingAds = JSON.parse(result || '[]');
    
    log(`분석 대상: ${pendingAds.length}개`);
    
    let analyzed = 0;
    let failed = 0;
    
    // API로 분석 요청
    for (let i = 0; i < pendingAds.length; i++) {
      const ad = pendingAds[i];
      
      try {
        log(`[${i+1}/${pendingAds.length}] 분석 중: ${ad.title}`);
        
        const response = await axios.post(`${API_URL}/api/analyze`, {
          videos: [{
            id: `auto_${Date.now()}_${i}`,
            title: ad.title,
            url: ad.url,
            note: ad.note || '자동 수집됨'
          }]
        }, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 300000 // 5분 타임아웃
        });
        
        if (response.data.success) {
          analyzed++;
          // DB 상태 업데이트
          execSync(`sqlite3 "${DB_PATH}" "UPDATE youtube_ads SET analysis_status = 'completed', analyzed_at = datetime('now') WHERE url = '${ad.url.replace(/'/g, "''")}'"`);
        } else {
          failed++;
          execSync(`sqlite3 "${DB_PATH}" "UPDATE youtube_ads SET analysis_status = 'failed' WHERE url = '${ad.url.replace(/'/g, "''")}'"`);
        }
        
      } catch (error) {
        log(`분석 실패: ${error.message}`, 'ERROR');
        failed++;
        execSync(`sqlite3 "${DB_PATH}" "UPDATE youtube_ads SET analysis_status = 'failed' WHERE url = '${ad.url.replace(/'/g, "''")}'"`);
      }
      
      // API Rate Limit 대응 (10초 대기)
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
    
    return { analyzed, failed };
    
  } catch (error) {
    log(`분석 중 오류: ${error.message}`, 'ERROR');
    return { analyzed: 0, failed: 0 };
  }
}

// Step 3: Google Drive 업로드
async function uploadResults() {
  try {
    const timestamp = new Date().toISOString().split('T')[0];
    
    // 완료된 분석 결과 가져오기
    const query = `
      SELECT * FROM youtube_ads 
      WHERE analysis_status = 'completed' 
      AND date(analyzed_at) = date('now')
    `;
    
    const result = execSync(`sqlite3 -json "${DB_PATH}" "${query}"`).toString();
    const completedAds = JSON.parse(result || '[]');
    
    if (completedAds.length > 0) {
      log(`Google Drive 업로드: ${completedAds.length}개 결과`);
      
      await axios.post(`${API_URL}/api/drive/upload`, {
        fileName: `youtube_ads_analysis_${timestamp}.csv`,
        data: completedAds,
        dataType: 'csv'
      });
      
      log('업로드 완료');
    }
    
  } catch (error) {
    log(`업로드 실패: ${error.message}`, 'WARN');
  }
}

// 전체 워크플로우 실행
async function runFullWorkflow() {
  try {
    log('=== 전체 자동화 워크플로우 시작 ===');
    
    // DB에 pending 광고가 있는지 먼저 확인
    const pendingCheck = execSync(`sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM youtube_ads WHERE analysis_status = 'pending'"`).toString().trim();
    const pendingCount = parseInt(pendingCheck) || 0;
    
    if (pendingCount > 0) {
      log(`이미 대기중인 광고 ${pendingCount}개 발견 - 바로 분석 시작`);
      const { analyzed, failed } = await analyzePendingAds();
      log(`분석 결과: 성공 ${analyzed}개, 실패 ${failed}개`);
      
      if (analyzed > 0) {
        await uploadResults();
      }
    }
    
    // 새로운 광고 수집
    const newAds = await collectYouTubeAds();
    
    // 신규 광고가 있으면 분석
    if (newAds > 0) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // 10초 대기
      const { analyzed, failed } = await analyzePendingAds();
      log(`분석 결과: 성공 ${analyzed}개, 실패 ${failed}개`);
      
      // 분석 완료된 결과 업로드
      if (analyzed > 0) {
        await uploadResults();
      }
    }
    
    log('=== 워크플로우 완료 ===');
    
  } catch (error) {
    log(`워크플로우 오류: ${error.message}`, 'ERROR');
  }
}

// 메인
async function main() {
  log('통합 자동화 스케줄러 시작');
  
  // 즉시 실행 옵션
  if (process.argv.includes('--run-now')) {
    await runFullWorkflow();
    process.exit(0);
  }
  
  // 30분마다 실행
  cron.schedule('*/30 * * * *', runFullWorkflow, {
    scheduled: true,
    timezone: 'Asia/Seoul'
  });
  
  // 시작시 한번 실행
  runFullWorkflow().catch(err => {
    log(`초기 실행 실패: ${err.message}`, 'ERROR');
  });
}

main().catch(error => {
  log(`스케줄러 오류: ${error.message}`, 'ERROR');
  process.exit(1);
});
