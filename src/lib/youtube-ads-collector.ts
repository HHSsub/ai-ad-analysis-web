import { spawn } from 'child_process';
import * as path from 'path';

export class YouTubeAdsCollectorDB {
  private apifyToken?: string;
  private serpApiKey?: string;
  
  constructor(apifyToken?: string, serpApiKey?: string) {
    this.apifyToken = apifyToken;
    this.serpApiKey = serpApiKey;
  }

  async collect_all_ads(searchQueries?: string[], batchSize: number = 20) {
    return new Promise<any>((resolve, reject) => {
      const pythonScript = path.join(process.cwd(), 'python_scripts', 'youtube_ads_collector_with_db.py');
      const venvPython = path.join(process.cwd(), 'venv', 'bin', 'python');
      
      const pythonProcess = spawn(venvPython, [pythonScript], {
        env: {
          ...process.env,
          SERPAPI_KEY: this.serpApiKey || process.env.SERPAPI_KEY || '646e6386e54a3e331122aa9460166830bcdbd35c89283b857dcf66901e11db2a',
          APIFY_TOKEN: this.apifyToken || process.env.APIFY_TOKEN || '',
          PYTHONUNBUFFERED: '1'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          // Python 스크립트에서 JSON 결과 파싱
          try {
            const lines = output.split('\n');
            const resultLine = lines.find(line => line.includes('RESULT_JSON:'));
            if (resultLine) {
              const jsonStr = resultLine.replace('RESULT_JSON:', '').trim();
              const result = JSON.parse(jsonStr);
              resolve(result);
            } else {
              resolve({
                total_collected: 0,
                new_ads: 0,
                serpapi: 0,
                skipped_queries: 0
              });
            }
          } catch (e) {
            console.error('Failed to parse Python script output:', e);
            resolve({
              total_collected: 0,
              new_ads: 0,
              serpapi: 0,
              skipped_queries: 0
            });
          }
        } else {
          reject(new Error(`Python script failed with code ${code}: ${errorOutput}`));
        }
      });

      pythonProcess.on('error', (error) => {
        reject(error);
      });

      // 자동으로 실행하도록 stdin 닫기
      pythonProcess.stdin.end();
    });
  }

  async get_database_stats() {
    return new Promise<any>((resolve, reject) => {
      const { spawn } = require('child_process');
      
      const sqlite = spawn('sqlite3', [
        path.join(process.cwd(), 'youtube_ads.db'), 
        '-json', 
        `SELECT 
          (SELECT COUNT(*) FROM youtube_ads) as total_ads,
          (SELECT COUNT(*) FROM youtube_ads WHERE analysis_status = 'pending') as pending,
          (SELECT COUNT(*) FROM youtube_ads WHERE analysis_status = 'completed') as completed,
          (SELECT COUNT(*) FROM youtube_ads WHERE analysis_status = 'failed') as failed,
          (SELECT MAX(collected_at) FROM youtube_ads) as latest_collection`
      ]);
      
      let output = '';
      sqlite.stdout.on('data', (data: any) => {
        output += data.toString();
      });
      
      sqlite.on('close', (code: number) => {
        try {
          if (code === 0 && output.trim()) {
            const result = JSON.parse(output.trim())[0] || {};
            resolve({
              total_ads: result.total_ads || 0,
              pending: result.pending || 0,
              completed: result.completed || 0,
              failed: result.failed || 0,
              latest_collection: result.latest_collection
            });
          } else {
            resolve({
              total_ads: 0,
              pending: 0,
              completed: 0,
              failed: 0
            });
          }
        } catch (e) {
          resolve({
            total_ads: 0,
            pending: 0,
            completed: 0,
            failed: 0
          });
        }
      });
    });
  }

  async export_for_web_service(status: string = 'pending', limit: number = 100) {
    return new Promise<any[]>((resolve) => {
      const { spawn } = require('child_process');
      
      const sqlite = spawn('sqlite3', [
        path.join(process.cwd(), 'youtube_ads.db'),
        '-json',
        `SELECT id, title, url, note, collected_at 
         FROM youtube_ads 
         WHERE analysis_status = '${status}' 
         ORDER BY collected_at DESC 
         LIMIT ${limit}`
      ]);
      
      let output = '';
      sqlite.stdout.on('data', (data: any) => {
        output += data.toString();
      });
      
      sqlite.on('close', () => {
        try {
          const results = JSON.parse(output.trim()) || [];
          resolve(results);
        } catch (e) {
          resolve([]);
        }
      });
    });
  }
}
