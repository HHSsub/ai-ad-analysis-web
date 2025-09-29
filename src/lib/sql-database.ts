// src/lib/sql-database.ts - 신규 생성
import Database from 'better-sqlite3';
import path from 'path';
import { AnalyzedVideo, VIDEO_FEATURES } from '@/types/video';

export class SQLDatabaseManager {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), 'youtube_ads_analysis.db');
    this.db = new Database(this.dbPath);
    this.initDatabase();
    console.log(`✅ SQLite DB 초기화 완료: ${this.dbPath}`);
  }

  private initDatabase() {
    // 1. 영상 분석 메인 테이블
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
        hybrid_score REAL,
        quantitative_score REAL,
        qualitative_score REAL
      )
    `);

    // 2. 156개 특성 데이터 테이블 (EAV 모델)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS video_features (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id TEXT NOT NULL,
        feature_no INTEGER NOT NULL,
        feature_category TEXT NOT NULL,
        feature_item TEXT NOT NULL,
        feature_value TEXT,
        FOREIGN KEY (video_id) REFERENCES video_analysis (id) ON DELETE CASCADE,
        UNIQUE(video_id, feature_no)
      )
    `);

    // 3. 분석 큐 테이블
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS analysis_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id TEXT NOT NULL,
        priority INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP,
        status TEXT DEFAULT 'waiting',
        error_message TEXT,
        FOREIGN KEY (video_id) REFERENCES video_analysis (id) ON DELETE CASCADE
      )
    `);

    // 4. 인덱스 생성 (성능 최적화)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_video_status ON video_analysis(status);
      CREATE INDEX IF NOT EXISTS idx_video_created ON video_analysis(created_at);
      CREATE INDEX IF NOT EXISTS idx_features_video ON video_features(video_id);
      CREATE INDEX IF NOT EXISTS idx_features_no ON video_features(feature_no);
      CREATE INDEX IF NOT EXISTS idx_queue_status ON analysis_queue(status);
    `);
  }

  // 영상 저장 (분석 전)
  saveVideo(video: { id: string; title: string; url: string; note?: string }) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO video_analysis (id, title, url, note, status)
      VALUES (?, ?, ?, ?, 'pending')
    `);
    stmt.run(video.id, video.title, video.url, video.note || '');
    
    // 분석 큐에 추가
    const queueStmt = this.db.prepare(`
      INSERT OR IGNORE INTO analysis_queue (video_id, priority)
      VALUES (?, 1)
    `);
    queueStmt.run(video.id);
  }

  // 분석 결과 저장 (156개 특성 포함)
  saveAnalysisResult(analyzedVideo: AnalyzedVideo) {
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
          hybrid_score = ?,
          quantitative_score = ?,
          qualitative_score = ?
        WHERE id = ?
      `);

      mainStmt.run(
        analyzedVideo.status,
        analyzedVideo.scriptLanguage || null,
        analyzedVideo.youtubeData?.viewCount || null,
        analyzedVideo.youtubeData?.likeCount || null,
        analyzedVideo.youtubeData?.commentCount || null,
        analyzedVideo.youtubeData?.duration || null,
        analyzedVideo.youtubeData?.channelTitle || null,
        analyzedVideo.youtubeData?.publishedAt || null,
        analyzedVideo.hybridScore?.final || null,
        analyzedVideo.hybridScore?.quantitative.finalScore || null,
        analyzedVideo.hybridScore?.qualitative.qualityScore || null,
        analyzedVideo.id
      );

      // 2. 156개 특성 데이터 저장
      const featureStmt = this.db.prepare(`
        INSERT OR REPLACE INTO video_features 
        (video_id, feature_no, feature_category, feature_item, feature_value)
        VALUES (?, ?, ?, ?, ?)
      `);

      VIDEO_FEATURES.forEach(feature => {
        const featureKey = `feature_${feature.no}`;
        const value = analyzedVideo.features?.[featureKey] || 'N/A';
        
        featureStmt.run(
          analyzedVideo.id,
          parseInt(feature.no),
          feature.category,
          feature.item,
          value
        );
      });

      // 3. 분석 큐 업데이트
      const queueStmt = this.db.prepare(`
        UPDATE analysis_queue SET
          status = 'completed',
          processed_at = CURRENT_TIMESTAMP
        WHERE video_id = ?
      `);
      queueStmt.run(analyzedVideo.id);
    });

    transaction();
    console.log(`✅ DB 저장 완료: ${analyzedVideo.title}`);
  }

  // 분석 실패 기록
  markAnalysisFailed(videoId: string, errorMessage: string) {
    const transaction = this.db.transaction(() => {
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
          error_message = ?
        WHERE video_id = ?
      `);
      queueStmt.run(errorMessage, videoId);
    });

    transaction();
  }

  // 대기 중인 영상 조회
  getPendingVideos(limit: number = 100) {
    const stmt = this.db.prepare(`
      SELECT v.id, v.title, v.url, v.note
      FROM video_analysis v
      INNER JOIN analysis_queue q ON v.id = q.video_id
      WHERE v.status = 'pending' AND q.status = 'waiting'
      ORDER BY q.priority DESC, q.created_at ASC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  // 특정 영상의 전체 분석 결과 조회
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
    features.forEach(f => {
      featureMap[`feature_${f.feature_no}`] = f.feature_value;
    });

    return {
      id: video.id,
      title: video.title,
      url: video.url,
      notes: video.note || '',
      status: video.status,
      features: featureMap,
      createdAt: video.created_at,
      updatedAt: video.analyzed_at,
      scriptLanguage: video.script_language,
      youtubeData: {
        viewCount: video.view_count || 0,
        likeCount: video.like_count || 0,
        commentCount: video.comment_count || 0,
        duration: video.duration || '',
        channelTitle: video.channel_title || '',
        publishedAt: video.published_at || '',
        description: '',
        tags: [],
        categoryId: ''
      },
      hybridScore: video.hybrid_score ? {
        final: video.hybrid_score,
        quantitative: { finalScore: video.quantitative_score || 0, interestIndex: 0, retentionIndex: 0, growthIndex: 0 },
        qualitative: { qualityScore: video.qualitative_score || 0, openingHookIndex: 0, brandDeliveryIndex: 0, storyStructureIndex: 0, visualAestheticsIndex: 0, audioPersuasionIndex: 0, uniquenessIndex: 0, messageTargetFitIndex: 0, ctaEfficiencyIndex: 0 }
      } : undefined
    } as AnalyzedVideo;
  }

  // 모든 분석 완료된 영상 조회
  getAllCompletedVideos() {
    const stmt = this.db.prepare(`
      SELECT v.*, 
        COUNT(f.id) as feature_count
      FROM video_analysis v
      LEFT JOIN video_features f ON v.id = f.video_id
      WHERE v.status = 'completed'
      GROUP BY v.id
      ORDER BY v.analyzed_at DESC
    `);
    return stmt.all();
  }

  // 통계 조회
  getStatistics() {
    const stats: any = {};

    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM video_analysis');
    stats.total = (totalStmt.get() as any).count;

    const pendingStmt = this.db.prepare("SELECT COUNT(*) as count FROM video_analysis WHERE status = 'pending'");
    stats.pending = (pendingStmt.get() as any).count;

    const completedStmt = this.db.prepare("SELECT COUNT(*) as count FROM video_analysis WHERE status = 'completed'");
    stats.completed = (completedStmt.get() as any).count;

    const failedStmt = this.db.prepare("SELECT COUNT(*) as count FROM video_analysis WHERE status = 'failed'");
    stats.failed = (failedStmt.get() as any).count;

    const latestStmt = this.db.prepare("SELECT MAX(analyzed_at) as latest FROM video_analysis");
    stats.latest_analysis = (latestStmt.get() as any).latest;

    return stats;
  }

  // CSV 내보내기 (156개 특성 포함)
  exportToCSV(): string {
    const videos = this.db.prepare(`
      SELECT id, title, url, status, analyzed_at
      FROM video_analysis
      WHERE status = 'completed'
      ORDER BY analyzed_at DESC
    `).all() as any[];

    const headers = ['ID', '제목', 'URL', '상태', '분석일시'];
    VIDEO_FEATURES.forEach(f => {
      headers.push(`${f.no}.${f.category}_${f.item}`);
    });

    const rows = [headers.join(',')];

    videos.forEach(video => {
      const row = [
        video.id,
        `"${video.title.replace(/"/g, '""')}"`,
        video.url,
        video.status,
        video.analyzed_at || ''
      ];

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
        row.push(`"${value.replace(/"/g, '""')}"`);
      }

      rows.push(row.join(','));
    });

    return rows.join('\n');
  }

  // 데이터베이스 닫기
  close() {
    this.db.close();
  }
}

// 전역 싱글톤 인스턴스
let globalDB: SQLDatabaseManager | null = null;

export function getGlobalDB(): SQLDatabaseManager {
  if (!globalDB) {
    globalDB = new SQLDatabaseManager();
  }
  return globalDB;
}
