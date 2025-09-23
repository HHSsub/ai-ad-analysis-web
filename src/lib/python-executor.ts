import { spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as sqlite3 from 'sqlite3';

export interface CollectorOptions {
  maxAds?: number;
  searchQueries?: string[];
}

export interface CollectorResult {
  success: boolean;
  output?: string;
  error?: string;
}

export interface DatabaseStats {
  total_ads: number;
  pending: number;
  completed: number;
  failed: number;
  latest_collection?: string;
}

export class PythonExecutor {
  private dbPath: string;
  
  constructor() {
    this.dbPath = path.join(process.cwd(), 'youtube_ads.db');
  }
  
  /**
   * Python 광고 수집기 실행
   */
  async executeCollector(options: CollectorOptions = {}): Promise<CollectorResult> {
    const { maxAds = 20, searchQueries } = options;
    
    return new Promise((resolve) => {
      const pythonScript = path.join(process.cwd(), 'python_scripts', 'youtube_ads_collector_with_db.py');
      
      // Python 스크립트 실행 인자
      const args = [
        pythonScript,
        '--max-ads', maxAds.toString()
      ];
      
      if (searchQueries && searchQueries.length > 0) {
        args.push('--queries', searchQueries.join(','));
      }
      
      const pythonProcess = spawn('python3', args, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          APIFY_TOKEN: process.env.APIFY_TOKEN || '',
          SERPAPI_KEY: process.env.SERPAPI_KEY || ''
        }
      });
      
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
        console.log(`[Python Collector] ${data.toString().trim()}`);
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error(`[Python Collector Error] ${data.toString().trim()}`);
      });
      
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Python 광고 수집 완료');
          resolve({
            success: true,
            output: output.trim()
          });
        } else {
          console.error(`❌ Python 광고 수집 실패 (종료 코드: ${code})`);
          resolve({
            success: false,
            error: errorOutput || `Process exited with code ${code}`
          });
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.error('❌ Python 프로세스 시작 실패:', error);
        resolve({
          success: false,
          error: `Failed to start Python process: ${error.message}`
        });
      });
    });
  }
  
  /**
   * 데이터베이스 통계 조회
   */
  async getStats(): Promise<DatabaseStats> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(this.dbPath)) {
        resolve({
          total_ads: 0,
          pending: 0,
          completed: 0,
          failed: 0
        });
        return;
      }
      
      const db = new sqlite3.Database(this.dbPath);
      
      const stats: Partial<DatabaseStats> = {};
      
      // 전체 광고 수
      db.get("SELECT COUNT(*) as count FROM youtube_ads", (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }
        stats.total_ads = row?.count || 0;
        
        // 분석 상태별 개수
        db.all(`
          SELECT analysis_status, COUNT(*) as count 
          FROM youtube_ads 
          GROUP BY analysis_status
        `, (err, rows: any[]) => {
          if (err) {
            reject(err);
            return;
          }
          
          stats.pending = 0;
          stats.completed = 0;
          stats.failed = 0;
          
          rows.forEach(row => {
            switch (row.analysis_status) {
              case 'pending':
                stats.pending = row.count;
                break;
              case 'completed':
                stats.completed = row.count;
                break;
              case 'failed':
                stats.failed = row.count;
                break;
            }
          });
          
          // 최근 수집 시간
          db.get(`
            SELECT MAX(collected_at) as latest 
            FROM youtube_ads
          `, (err, row: any) => {
            if (err) {
              reject(err);
              return;
            }
            
            stats.latest_collection = row?.latest;
            db.close();
            
            resolve(stats as DatabaseStats);
          });
        });
      });
    });
  }
  
  /**
   * 최근 수집된 광고 데이터 조회
   */
  async readDatabase(limit: number = 100): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(this.dbPath)) {
        resolve([]);
        return;
      }
      
      const db = new sqlite3.Database(this.dbPath);
      
      db.all(`
        SELECT id, title, url, note, search_query, api_source, 
               collected_at, analyzed_at, analysis_status
        FROM youtube_ads 
        ORDER BY collected_at DESC 
        LIMIT ?
      `, [limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
        db.close();
      });
    });
  }
  
  /**
   * 분석 대기 중인 광고 조회
   */
  async getPendingAnalysis(limit: number = 50): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(this.dbPath)) {
        resolve([]);
        return;
      }
      
      const db = new sqlite3.Database(this.dbPath);
      
      db.all(`
        SELECT id, title, url, note, collected_at
        FROM youtube_ads 
        WHERE analysis_status = 'pending'
        ORDER BY collected_at DESC 
        LIMIT ?
      `, [limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
        db.close();
      });
    });
  }
  
  /**
   * 분석 상태 업데이트
   */
  async updateAnalysisStatus(adId: number, status: 'completed' | 'failed', errorMessage?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(this.dbPath)) {
        reject(new Error('Database not found'));
        return;
      }
      
      const db = new sqlite3.Database(this.dbPath);
      
      if (status === 'completed') {
        db.run(`
          UPDATE youtube_ads 
          SET analysis_status = ?, analyzed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [status, adId], (err) => {
          if (err) reject(err);
          else resolve();
          db.close();
        });
      } else {
        db.run(`
          UPDATE youtube_ads 
          SET analysis_status = ?, analyzed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [status, adId], (err) => {
          if (err) reject(err);
          else resolve();
          db.close();
        });
      }
    });
  }
}
