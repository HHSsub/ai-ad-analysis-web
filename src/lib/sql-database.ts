// src/lib/sql-database.ts - 완전한 SQLite 데이터베이스 관리
import Database from 'better-sqlite3';
import path from 'path';
import { AnalyzedVideo } from '@/types/video';
import { loadFeaturesFromCSV } from '@/utils/csvLoader';

// 타입 정의
interface VideoRecord {
  id: string;
  title: string;
  url: string;
  note?: string;
}

interface DatabaseStatistics {
  total: number;
  pending: number;
  completed: number;
  failed: number;
  latest_analysis: string | null;
}

interface VideoFeature {
  no: string;
  category: string;
  item: string;
}

export class SQLDatabaseManager {
  private db: Database.Database;
  private dbPath: string;
  private features: VideoFeature[];

  constructor(dbPath?: string) {
    // 데이터베이스 파일 경로 설정
    this.dbPath = dbPath || path.join(process.cwd(), 'youtube_ads_analysis.db');
    
    // 데이터베이스 연결
    this.db = new Database(this.dbPath);
    
    // Foreign Key 제약조건 활성화 (중요!)
    this.db.pragma('foreign_keys = ON');
    
    // WAL 모드 활성화 (동시성 향상)
    this.db.pragma('journal_mode = WAL');
    
    // 성능 최적화 설정
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 1000');
    this.db.pragma('temp_store = memory');
    
    // 특성 목록 로드
    this.features = this.loadFeatures();
    
    // 데이터베이스 초기화
    this.initDatabase();
    
    console.log(`✅ SQLite DB 초기화 완료: ${this.dbPath}`);
    console.log(`📋 특성 로드 완료: ${this.features.length}개`);
  }

  /**
   * CSV에서 특성 목록 로드
   */
  private loadFeatures(): VideoFeature[] {
    try {
      return loadFeaturesFromCSV();
    } catch (error) {
      console.warn('⚠️ CSV 로드 실패, 빈 배열 반환:', error);
      return [];
    }
  }

  /**
   * 데이터베이스 테이블 초기화
   */
  private initDatabase(): void {
    const transaction = this.db.transaction(() => {
      // 1. 영상 분석 메인 테이블 (부모 테이블)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS video_analysis (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          url TEXT UNIQUE NOT NULL,
          note TEXT,
          status TEXT DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          analyzed_at TIMESTAMP,
          script_language TEXT,
          view_count INTEGER,
          like_count INTEGER,
          comment_count INTEGER,
          duration TEXT,
          channel_title TEXT,
          published_at TEXT,
          description TEXT,
          tags TEXT,
          category_id TEXT,
          hybrid_score REAL,
          quantitative_score REAL,
          qualitative_score REAL,
          completion_percentage INTEGER DEFAULT 0
        )
      `);

      // 2. 156개 특성 데이터 테이블 (자식 테이블, EAV 모델)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS video_features (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          video_id TEXT NOT NULL,
          feature_no INTEGER NOT NULL,
          feature_category TEXT NOT NULL,
          feature_item TEXT NOT NULL,
          feature_value TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (video_id) REFERENCES video_analysis (id) ON DELETE CASCADE,
          UNIQUE(video_id, feature_no)
        )
      `);

      // 3. 분석 큐 테이블 (자식 테이블)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS analysis_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          video_id TEXT NOT NULL,
          priority INTEGER DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          processed_at TIMESTAMP,
          status TEXT DEFAULT 'waiting',
          error_message TEXT,
          retry_count INTEGER DEFAULT 0,
          FOREIGN KEY (video_id) REFERENCES video_analysis (id) ON DELETE CASCADE
        )
      `);

      // 4. 분석 로그 테이블 (선택사항)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS analysis_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          video_id TEXT NOT NULL,
          log_level TEXT DEFAULT 'INFO',
          message TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (video_id) REFERENCES video_analysis (id) ON DELETE CASCADE
        )
      `);

      // 5. 성능 최적화를 위한 인덱스 생성
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_video_status ON video_analysis(status);
        CREATE INDEX IF NOT EXISTS idx_video_created ON video_analysis(created_at);
        CREATE INDEX IF NOT EXISTS idx_video_analyzed ON video_analysis(analyzed_at);
        CREATE INDEX IF NOT EXISTS idx_video_url ON video_analysis(url);
        
        CREATE INDEX IF NOT EXISTS idx_features_video ON video_features(video_id);
        CREATE INDEX IF NOT EXISTS idx_features_no ON video_features(feature_no);
        CREATE INDEX IF NOT EXISTS idx_features_category ON video_features(feature_category);
        
        CREATE INDEX IF NOT EXISTS idx_queue_status ON analysis_queue(status);
        CREATE INDEX IF NOT EXISTS idx_queue_priority ON analysis_queue(priority);
        
        CREATE INDEX IF NOT EXISTS idx_logs_video ON analysis_logs(video_id);
        CREATE INDEX IF NOT EXISTS idx_logs_level ON analysis_logs(log_level);
      `);

      // 6. 뷰 생성 (편의를 위한)
      this.db.exec(`
        CREATE VIEW IF NOT EXISTS v_video_summary AS
        SELECT 
          v.id,
          v.title,
          v.url,
          v.status,
          v.created_at,
          v.analyzed_at,
          v.hybrid_score,
          COUNT(f.id) as feature_count,
          ROUND(COUNT(f.id) * 100.0 / 156, 2) as completion_rate
        FROM video_analysis v
        LEFT JOIN video_features f ON v.id = f.video_id
        GROUP BY v.id;
      `);
    });

    // 트랜잭션 실행
    transaction();
  }

  /**
   * 영상 정보 저장 (분석 전 단계)
   */
  saveVideo(video: VideoRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO video_analysis (id, title, url, note, status, created_at)
      VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
    `);
    
    stmt.run(video.id, video.title, video.url, video.note || null);
    console.log(`💾 영상 저장: ${video.title} (${video.id})`);
  }

  /**
   * 완전한 분석 결과 저장 (156개 특성 포함)
   */
  saveAnalysisResult(analyzedVideo: AnalyzedVideo): void {
    const transaction = this.db.transaction(() => {
      // 1. 메인 테이블 업데이트
      const mainStmt = this.db.prepare(`
        UPDATE video_analysis SET
          status = ?,
          analyzed_at = CURRENT_TIMESTAMP,
          script_language = ?,
          view_count = ?,
          like_count = ?,
          comment_count = ?,
          duration = ?,
          channel_title = ?,
          published_at = ?,
          description = ?,
          tags = ?,
          category_id = ?,
          hybrid_score = ?,
          quantitative_score = ?,
          qualitative_score = ?,
          completion_percentage = ?
        WHERE id = ?
      `);

      const tags = analyzedVideo.youtubeData?.tags ? JSON.stringify(analyzedVideo.youtubeData.tags) : null;

      mainStmt.run(
        analyzedVideo.status,
        analyzedVideo.scriptLanguage || null,
        analyzedVideo.youtubeData?.viewCount || null,
        analyzedVideo.youtubeData?.likeCount || null,
        analyzedVideo.youtubeData?.commentCount || null,
        analyzedVideo.youtubeData?.duration || null,
        analyzedVideo.youtubeData?.channelTitle || null,
        analyzedVideo.youtubeData?.publishedAt || null,
        analyzedVideo.youtubeData?.description || null,
        tags,
        analyzedVideo.youtubeData?.categoryId || null,
        analyzedVideo.hybridScore?.final || null,
        analyzedVideo.hybridScore?.quantitative?.finalScore || null,
        analyzedVideo.hybridScore?.qualitative?.qualityScore || null,
        analyzedVideo.completionStats?.percentage || 0,
        analyzedVideo.id
      );

      // 2. 156개 특성 데이터 저장
      const featureStmt = this.db.prepare(`
        INSERT OR REPLACE INTO video_features 
        (video_id, feature_no, feature_category, feature_item, feature_value, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      this.features.forEach(feature => {
        const featureKey = `feature_${feature.no}`;
        let value = 'N/A';
        
        // features 객체에서 값 찾기
        if (analyzedVideo.features && analyzedVideo.features[featureKey]) {
          value = analyzedVideo.features[featureKey];
        }
        // analysis 객체에서 값 찾기 (호환성)
        else if (analyzedVideo.analysis && analyzedVideo.analysis[feature.category]) {
          value = analyzedVideo.analysis[feature.category][feature.item] || 'N/A';
        }
        
        // 값이 객체인 경우 JSON 문자열로 변환
        if (typeof value === 'object' && value !== null) {
          value = JSON.stringify(value);
        }
        
        featureStmt.run(
          analyzedVideo.id,
          parseInt(feature.no),
          feature.category,
          feature.item,
          String(value || 'N/A')
        );
      });

      // 3. 분석 큐 업데이트
      const queueStmt = this.db.prepare(`
        INSERT OR IGNORE INTO analysis_queue (video_id, priority, status)
        VALUES (?, 1, 'waiting')
      `);
      queueStmt.run(analyzedVideo.id);

      const updateQueueStmt = this.db.prepare(`
        UPDATE analysis_queue SET
          status = 'completed',
          processed_at = CURRENT_TIMESTAMP
        WHERE video_id = ?
      `);
      updateQueueStmt.run(analyzedVideo.id);

      // 4. 성공 로그 기록
      this.addLog(analyzedVideo.id, 'INFO', `분석 완료: ${this.features.length}개 특성 저장`);
    });

    transaction();
    console.log(`✅ 분석 결과 저장 완료: ${analyzedVideo.title} (156개 특성)`);
  }

  /**
   * 분석 실패 기록
   */
  markAnalysisFailed(videoId: string, errorMessage: string): void {
    const transaction = this.db.transaction(() => {
      // 부모 테이블 먼저 확인
      const checkStmt = this.db.prepare(`
        SELECT id FROM video_analysis WHERE id = ?
      `);
      const exists = checkStmt.get(videoId);
      
      if (exists) {
        const stmt = this.db.prepare(`
          UPDATE video_analysis SET
            status = 'failed',
            analyzed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `);
        stmt.run(videoId);

        const queueStmt = this.db.prepare(`
          UPDATE analysis_queue SET
            status = 'failed',
            processed_at = CURRENT_TIMESTAMP,
            error_message = ?,
            retry_count = retry_count + 1
          WHERE video_id = ?
        `);
        queueStmt.run(errorMessage, videoId);

        // 에러 로그 기록
        this.addLog(videoId, 'ERROR', errorMessage);
      }
    });

    transaction();
    console.log(`❌ 분석 실패 기록: ${videoId} - ${errorMessage}`);
  }

  /**
   * 로그 기록
   */
  addLog(videoId: string, level: string, message: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO analysis_logs (video_id, log_level, message)
      VALUES (?, ?, ?)
    `);
    stmt.run(videoId, level, message);
  }

  /**
   * 대기 중인 영상 조회
   */
  getPendingVideos(limit: number = 100): any[] {
    const stmt = this.db.prepare(`
      SELECT v.id, v.title, v.url, v.note, v.created_at
      FROM video_analysis v
      WHERE v.status = 'pending' 
      ORDER BY v.created_at ASC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  /**
   * 특정 영상의 완전한 분석 결과 조회
   */
  getVideoAnalysis(videoId: string): AnalyzedVideo | null {
    const mainStmt = this.db.prepare(`
      SELECT * FROM video_analysis WHERE id = ?
    `);
    const video = mainStmt.get(videoId) as any;

    if (!video) return null;

    const featuresStmt = this.db.prepare(`
      SELECT feature_no, feature_value
      FROM video_features
      WHERE video_id = ?
      ORDER BY feature_no
    `);
    const features = featuresStmt.all(videoId) as any[];

    const featureMap: { [key: string]: any } = {};
    const analysisMap: { [category: string]: { [item: string]: string } } = {};
    
    features.forEach(f => {
      featureMap[`feature_${f.feature_no}`] = f.feature_value;
      
      // analysis 구조로도 변환 (호환성)
      const feature = this.features.find(feat => feat.no === String(f.feature_no));
      if (feature) {
        if (!analysisMap[feature.category]) {
          analysisMap[feature.category] = {};
        }
        analysisMap[feature.category][feature.item] = f.feature_value;
      }
    });

    return {
      id: video.id,
      title: video.title,
      url: video.url,
      notes: video.note || '',
      status: video.status,
      features: featureMap,
      analysis: analysisMap,
      createdAt: video.created_at,
      updatedAt: video.analyzed_at,
      scriptLanguage: video.script_language,
      completionStats: {
        completed: features.filter(f => f.feature_value && f.feature_value !== 'N/A').length,
        incomplete: features.filter(f => !f.feature_value || f.feature_value === 'N/A').length,
        total: this.features.length,
        percentage: video.completion_percentage || 0
      },
      youtubeData: {
        viewCount: video.view_count || 0,
        likeCount: video.like_count || 0,
        commentCount: video.comment_count || 0,
        duration: video.duration || '',
        channelTitle: video.channel_title || '',
        publishedAt: video.published_at || '',
        description: video.description || '',
        tags: video.tags ? JSON.parse(video.tags) : [],
        categoryId: video.category_id || ''
      },
      hybridScore: video.hybrid_score ? {
        final: video.hybrid_score,
        quantitative: { 
          finalScore: video.quantitative_score || 0, 
          interestIndex: 0, 
          retentionIndex: 0, 
          growthIndex: 0 
        },
        qualitative: { 
          qualityScore: video.qualitative_score || 0, 
          openingHookIndex: 0, 
          brandDeliveryIndex: 0, 
          storyStructureIndex: 0, 
          visualAestheticsIndex: 0, 
          audioPersuasionIndex: 0, 
          uniquenessIndex: 0, 
          messageTargetFitIndex: 0, 
          ctaEfficiencyIndex: 0 
        }
      } : undefined
    } as AnalyzedVideo;
  }

  /**
   * 모든 완료된 영상 조회
   */
  getAllCompletedVideos(): any[] {
    const stmt = this.db.prepare(`
      SELECT v.*, 
        COUNT(f.id) as feature_count,
        ROUND(COUNT(f.id) * 100.0 / 156, 2) as completion_rate
      FROM video_analysis v
      LEFT JOIN video_features f ON v.id = f.video_id
      WHERE v.status = 'completed'
      GROUP BY v.id
      ORDER BY v.analyzed_at DESC
    `);
    return stmt.all();
  }

  /**
   * 데이터베이스 통계 조회
   */
  getStatistics(): DatabaseStatistics {
    const stats: any = {};

    // 총 영상 수
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM video_analysis');
    stats.total = (totalStmt.get() as any).count;

    // 상태별 통계
    const pendingStmt = this.db.prepare("SELECT COUNT(*) as count FROM video_analysis WHERE status = 'pending'");
    stats.pending = (pendingStmt.get() as any).count;

    const completedStmt = this.db.prepare("SELECT COUNT(*) as count FROM video_analysis WHERE status = 'completed'");
    stats.completed = (completedStmt.get() as any).count;

    const failedStmt = this.db.prepare("SELECT COUNT(*) as count FROM video_analysis WHERE status = 'failed'");
    stats.failed = (failedStmt.get() as any).count;

    // 최근 분석일
    const latestStmt = this.db.prepare("SELECT MAX(analyzed_at) as latest FROM video_analysis WHERE status = 'completed'");
    stats.latest_analysis = (latestStmt.get() as any).latest;

    console.log(`📊 DB 통계: 총 ${stats.total}개, 완료 ${stats.completed}개, 대기 ${stats.pending}개, 실패 ${stats.failed}개`);
    return stats;
  }

  /**
   * CSV 내보내기 (156개 특성 포함)
   */
  exportToCSV(): string {
    const videos = this.db.prepare(`
      SELECT id, title, url, status, analyzed_at, view_count, like_count, comment_count, channel_title, duration
      FROM video_analysis
      WHERE status = 'completed'
      ORDER BY analyzed_at DESC
    `).all() as any[];

    if (videos.length === 0) {
      console.log('⚠️ 내보낼 완료된 영상이 없습니다');
      return '';
    }

    // 헤더 생성 (기본 정보 + 156개 특성)
    const headers = [
      'ID', '제목', 'URL', '상태', '분석일시', '조회수', '좋아요', '댓글수', '채널명', '영상길이'
    ];
    
    this.features.forEach(f => {
      headers.push(`${f.no}.${f.category}_${f.item}`);
    });

    const rows = [headers.join(',')];

    videos.forEach(video => {
      const row = [
        video.id,
        `"${(video.title || '').replace(/"/g, '""')}"`,
        video.url,
        video.status,
        video.analyzed_at || '',
        video.view_count || '0',
        video.like_count || '0',
        video.comment_count || '0',
        `"${(video.channel_title || '').replace(/"/g, '""')}"`,
        video.duration || ''
      ];

      // 156개 특성 데이터 추가
      const featuresStmt = this.db.prepare(`
        SELECT feature_no, feature_value
        FROM video_features
        WHERE video_id = ?
        ORDER BY feature_no
      `);
      const features = featuresStmt.all(video.id) as any[];

      const featureMap: { [key: number]: string } = {};
      features.forEach(f => {
        featureMap[f.feature_no] = f.feature_value;
      });

      for (let i = 1; i <= 156; i++) {
        const value = featureMap[i] || 'N/A';
        // CSV에서 쉼표와 따옴표 이스케이프
        const escapedValue = String(value).replace(/"/g, '""');
        row.push(`"${escapedValue}"`);
      }

      rows.push(row.join(','));
    });

    console.log(`📄 CSV 생성 완료: ${videos.length}개 영상, ${this.features.length}개 특성 포함`);
    return rows.join('\n');
  }

  /**
   * 실패한 영상 재시도 큐에 추가
   */
  retryFailedVideos(maxRetries: number = 3): number {
    const stmt = this.db.prepare(`
      UPDATE analysis_queue SET
        status = 'waiting',
        processed_at = NULL,
        error_message = NULL
      WHERE status = 'failed' 
        AND retry_count < ?
    `);
    
    const result = stmt.run(maxRetries);
    console.log(`🔄 재시도 큐 추가: ${result.changes}개 영상`);
    return result.changes;
  }

  /**
   * 오래된 로그 정리 (30일 이상)
   */
  cleanupOldLogs(daysToKeep: number = 30): number {
    const stmt = this.db.prepare(`
      DELETE FROM analysis_logs 
      WHERE created_at < datetime('now', '-' || ? || ' days')
    `);
    
    const result = stmt.run(daysToKeep);
    console.log(`🧹 오래된 로그 정리: ${result.changes}개 삭제`);
    return result.changes;
  }

  /**
   * 데이터베이스 백업
   */
  backup(backupPath?: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const finalBackupPath = backupPath || path.join(process.cwd(), `backup_${timestamp}.db`);
    
    this.db.backup(finalBackupPath);
    console.log(`💾 DB 백업 완료: ${finalBackupPath}`);
    return finalBackupPath;
  }

  /**
   * 데이터베이스 연결 상태 확인
   */
  isHealthy(): boolean {
    try {
      this.db.prepare('SELECT 1').get();
      return true;
    } catch (error) {
      console.error('❌ DB 연결 실패:', error);
      return false;
    }
  }

  /**
   * 데이터베이스 연결 닫기
   */
  close(): void {
    this.db.close();
    console.log('📪 DB 연결 종료');
  }

  /**
   * 데이터베이스 최적화 (VACUUM)
   */
  optimize(): void {
    console.log('🔧 DB 최적화 시작...');
    this.db.exec('VACUUM');
    this.db.exec('ANALYZE');
    console.log('✅ DB 최적화 완료');
  }
}

/**
 * 전역 싱글톤 인스턴스 관리
 */
let globalDB: SQLDatabaseManager | null = null;

export function getGlobalDB(): SQLDatabaseManager {
  if (!globalDB) {
    globalDB = new SQLDatabaseManager();
  }
  return globalDB;
}

export function closeGlobalDB(): void {
  if (globalDB) {
    globalDB.close();
    globalDB = null;
  }
}

/**
 * 안전한 DB 초기화 함수
 */
export function initializeDatabase(dbPath?: string): SQLDatabaseManager {
  if (globalDB) {
    globalDB.close();
  }
  globalDB = new SQLDatabaseManager(dbPath);
  return globalDB;
}

export default SQLDatabaseManager;
