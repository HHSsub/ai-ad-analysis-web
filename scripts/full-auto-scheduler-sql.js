// scripts/full-auto-scheduler-sql.js - 신규 생성
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const Database = require('better-sqlite3');

const PROJECT_DIR = path.resolve(__dirname, '..');
const DB_PATH = path.join(PROJECT_DIR, 'youtube_ads.db');
const ANALYSIS_DB_PATH = path.join(PROJECT_DIR, 'youtube_ads_analysis.db');
const API_URL = process.env.WEB_SERVICE_URL || 'http://localhost:3000';
const LOG_FILE = path.join(PROJECT_DIR, 'logs', 'auto-scheduler-sql.log');

// 로그 디렉토리 생성
if (!fs.existsSync(path.dirname(LOG_FILE))) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
}

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(LOG_FILE, logMessage + '\n');
}

// Step 1: 광고 URL 수집 (Python)
async function collectAds() {
  log('===== STEP 1: 광고 URL 수집 시작 =====');
  
  try {
    const pythonScript = path.join(PROJECT_DIR, 'python_scripts', 'youtube_ads_collector_with_db.py');
    
    if (!fs.existsSync(pythonScript)) {
      log('Python 수집 스크립트 없음', 'ERROR');
      return { collected: 0, new: 0 };
    }

    log('Python 수집 스크립트 실행 중...');
    
    const result = execSync(`python3 "${pythonScript}"`, {
      cwd: PROJECT_DIR,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 300000
    });

    log(result);

    // DB에서 수집 통계 조회
    const db = new Database(DB_PATH);
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN analysis_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN analysis_status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM youtube_ads
    `).get();
    db.close();

    log(`수집 완료 - 전체: ${stats.total}개, 대기: ${stats.pending}개, 완료: ${stats.completed}개`);
    
    return {
      collected: stats.total,
      new: stats.pending
    };
    
  } catch (error) {
    log(`수집 실패: ${error.message}`, 'ERROR');
    return { collected: 0, new: 0 };
  }
}

// Step 2: 분석 실행 (웹서비스 API 호출)
async function analyzeVideos() {
  log('===== STEP 2: 영상 분석 시작 =====');
  
  try {
    // DB에서 대기 중인 광고 가져오기
    const db = new Database(DB_PATH);
    const pendingAds = db.prepare(`
      SELECT id, title, url, note
      FROM youtube_ads
      WHERE analysis_status = 'pending'
      ORDER BY collected_at DESC
      LIMIT 20
    `).all();
    db.close();

    if (pendingAds.length === 0) {
      log('분석할 광고가 없습니다');
      return { analyzed: 0, failed: 0 };
    }

    log(`분석 대기 중: ${pendingAds.length}개`);

    let analyzed = 0;
    let failed = 0;

    // 배치 단위로 분석 (5개씩)
    const batchSize = 5;
    for (let i = 0; i < pendingAds.length; i += batchSize) {
      const batch = pendingAds.slice(i, i + batchSize);
      
      log(`배치 분석 ${i + 1}-${Math.min(i + batchSize, pendingAds.length)} / ${pendingAds.length}`);

      const videos = batch.map(ad => ({
        title: ad.title,
        url: ad.url,
        note: ad.note || '자동 분석'
      }));

      try {
        const response = await axios.post(`${API_URL}/api/analyze`, 
          { videos },
          { 
            timeout: 36000000,
            headers: { 'Content-Type': 'application/json' }
          }
        );

        if (response.data.results) {
          const successCount = response.data.results.filter(r => 
            r.status === 'completed' || (r.status !== 'rejected' && !r.reason)
          ).length;
          
          analyzed += successCount;
          failed += (batch.length - successCount);

          log(`배치 완료: 성공 ${successCount}개, 실패 ${batch.length - successCount}개`);

          // 분석 완료된 것들 DB 상태 업데이트
          const updateDb = new Database(DB_PATH);
          const updateStmt = updateDb.prepare(`
            UPDATE youtube_ads 
            SET analysis_status = ?, analyzed_at = datetime('now')
            WHERE url = ?
          `);

          response.data.results.forEach((result, idx) => {
            const status = (result.status === 'completed' || 
                          (result.status !== 'rejected' && !result.reason)) 
                          ? 'completed' : 'failed';
            updateStmt.run(status, batch[idx].url);
          });

          updateDb.close();
        }

      } catch (error) {
        log(`배치 분석 실패: ${error.message}`, 'ERROR');
        failed += batch.length;

        // 실패한 것들 DB 상태 업데이트
        const updateDb = new Database(DB_PATH);
        const updateStmt = updateDb.prepare(`
          UPDATE youtube_ads 
          SET analysis_status = 'failed', analyzed_at = datetime('now')
          WHERE url = ?
        `);
        batch.forEach(ad => updateStmt.run(ad.url));
        updateDb.close();
      }

      // API Rate Limit 방지
      if (i + batchSize < pendingAds.length) {
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    log(`분석 완료 - 성공: ${analyzed}개, 실패: ${failed}개`);
    return { analyzed, failed };

  } catch (error) {
    log(`분석 중 오류: ${error.message}`, 'ERROR');
    return { analyzed: 0, failed: 0 };
  }
}

// Step 3: Google Drive 업로드
async function uploadToDrive() {
  log('===== STEP 3: Google Drive 업로드 시작 =====');
  
  try {
    // 분석 DB 확인
    if (!fs.existsSync(ANALYSIS_DB_PATH)) {
      log('분석 DB 파일이 없습니다', 'WARN');
      return false;
    }

    const analysisDb = new Database(ANALYSIS_DB_PATH);
    const stats = analysisDb.prepare(`
      SELECT COUNT(*) as count 
      FROM video_analysis 
      WHERE status = 'completed'
    `).get();
    analysisDb.close();

    if (stats.count === 0) {
      log('업로드할 완료된 분석이 없습니다');
      return false;
    }

    log(`업로드할 분석 결과: ${stats.count}개`);

    const response = await axios.post(`${API_URL}/api/drive/upload-sql`, 
      { format: 'csv' },
      { 
        timeout: 120000,
        headers: { 'Content-Type': 'application/json' }
      }
    );

    if (response.data.success) {
      log(`✅ Drive 업로드 완료: ${response.data.file.name}`);
      log(`   URL: ${response.data.file.url}`);
      return true;
    } else {
      log(`Drive 업로드 실패: ${response.data.message}`, 'ERROR');
      return false;
    }

  } catch (error) {
    log(`Drive 업로드 오류: ${error.message}`, 'ERROR');
    return false;
  }
}

// Step 4: 통계 및 상태 확인
function checkStatus() {
  log('===== STEP 4: 시스템 상태 확인 =====');
  
  try {
    // 수집 DB 통계
    if (fs.existsSync(DB_PATH)) {
      const db = new Database(DB_PATH);
      const collectionStats = db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN analysis_status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN analysis_status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN analysis_status = 'failed' THEN 1 ELSE 0 END) as failed
        FROM youtube_ads
      `).get();
      db.close();

      log(`[수집 DB] 전체: ${collectionStats.total}, 대기: ${collectionStats.pending}, 완료: ${collectionStats.completed}, 실패: ${collectionStats.failed}`);
    }

    // 분석 DB 통계
    if (fs.existsSync(ANALYSIS_DB_PATH)) {
      const analysisDb = new Database(ANALYSIS_DB_PATH);
      const analysisStats = analysisDb.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
        FROM video_analysis
      `).get();
      
      const featureCount = analysisDb.prepare(`
        SELECT COUNT(DISTINCT video_id) as videos_with_features
        FROM video_features
      `).get();
      
      analysisDb.close();

      log(`[분석 DB] 전체: ${analysisStats.total}, 대기: ${analysisStats.pending}, 완료: ${analysisStats.completed}, 실패: ${analysisStats.failed}`);
      log(`[특성 DB] 156개 특성 저장된 영상: ${featureCount.videos_with_features}개`);
    }

    // 디스크 사용량
    const diskUsage = execSync("df -h / | awk 'NR==2{print $5}'").toString().trim();
    log(`[시스템] 디스크 사용률: ${diskUsage}`);

    // 메모리 사용량
    const memUsage = execSync("free -h | grep Mem | awk '{print $3\"/\"$2}'").toString().trim();
    log(`[시스템] 메모리 사용: ${memUsage}`);

  } catch (error) {
    log(`상태 확인 오류: ${error.message}`, 'ERROR');
  }
}

// 전체 워크플로우 실행
async function runFullWorkflow() {
  log('========================================');
  log('🚀 전체 자동화 워크플로우 시작');
  log('========================================');

  const startTime = Date.now();

  // Step 1: 광고 수집
  const collectionResult = await collectAds();
  
  // Step 2: 분석 실행 (새로운 광고가 있을 때만)
  let analysisResult = { analyzed: 0, failed: 0 };
  if (collectionResult.new > 0) {
    analysisResult = await analyzeVideos();
  } else {
    log('새로운 광고가 없어 분석 스킵');
  }

  // Step 3: Drive 업로드 (분석 완료된 것이 있을 때만)
  if (analysisResult.analyzed > 0) {
    await uploadToDrive();
  } else {
    log('업로드할 새 분석 결과 없음');
  }

  // Step 4: 상태 확인
  checkStatus();

  const endTime = Date.now();
  const duration = Math.round((endTime - startTime) / 1000);

  log('========================================');
  log(`✅ 워크플로우 완료 (소요시간: ${duration}초)`);
  log(`   수집: ${collectionResult.collected}개 (신규 ${collectionResult.new}개)`);
  log(`   분석: 성공 ${analysisResult.analyzed}개, 실패 ${analysisResult.failed}개`);
  log('========================================');
}

// 스케줄 모드 (cron-like)
function startScheduler() {
  log('📅 스케줄러 모드 시작');
  log('   매 6시간마다 자동 실행');

  // 즉시 한 번 실행
  runFullWorkflow();

  // 6시간마다 반복 (21600000ms = 6시간)
  setInterval(() => {
    runFullWorkflow();
  }, 21600000);
}

// CLI 실행
const args = process.argv.slice(2);
const mode = args[0] || 'once';

if (mode === 'schedule') {
  startScheduler();
} else if (mode === 'collect') {
  collectAds().then(() => process.exit(0));
} else if (mode === 'analyze') {
  analyzeVideos().then(() => process.exit(0));
} else if (mode === 'upload') {
  uploadToDrive().then(() => process.exit(0));
} else if (mode === 'status') {
  checkStatus();
  process.exit(0);
} else {
  runFullWorkflow().then(() => process.exit(0));
}

// 에러 핸들링
process.on('uncaughtException', (error) => {
  log(`Uncaught Exception: ${error.message}`, 'ERROR');
  log(error.stack, 'ERROR');
});

process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled Rejection: ${reason}`, 'ERROR');
});
