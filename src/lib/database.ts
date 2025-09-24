import { spawn } from 'child_process';
import * as path from 'path';

export async function saveAnalysisResult(analysisData: any) {
  return new Promise<any>((resolve, reject) => {
    const dbPath = path.join(process.cwd(), 'youtube_ads.db');
    
    // SQLite를 통해 분석 결과 저장
    const sqlite = spawn('sqlite3', [dbPath]);
    
    const insertQuery = `
      INSERT INTO youtube_ads (title, url, note, analysis_status, analyzed_at) 
      VALUES ('${analysisData.title}', '${analysisData.url}', '${analysisData.notes || ''}', 'completed', datetime('now'));
    `;
    
    sqlite.stdin.write(insertQuery);
    sqlite.stdin.end();
    
    sqlite.on('close', (code) => {
      if (code === 0) {
        resolve({
          success: true,
          id: Date.now(),
          data: analysisData
        });
      } else {
        reject(new Error(`SQLite insert failed with code ${code}`));
      }
    });
    
    sqlite.on('error', (error) => {
      reject(error);
    });
  });
}

export async function getAnalysisResults(limit: number = 100) {
  return new Promise<any[]>((resolve) => {
    const dbPath = path.join(process.cwd(), 'youtube_ads.db');
    
    const sqlite = spawn('sqlite3', [
      dbPath,
      '-json',
      `SELECT * FROM youtube_ads WHERE analysis_status = 'completed' ORDER BY analyzed_at DESC LIMIT ${limit}`
    ]);
    
    let output = '';
    sqlite.stdout.on('data', (data) => {
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
    
    sqlite.on('error', () => {
      resolve([]);
    });
  });
}

export async function updateAnalysisStatus(id: string, status: string) {
  return new Promise<any>((resolve, reject) => {
    const dbPath = path.join(process.cwd(), 'youtube_ads.db');
    
    const sqlite = spawn('sqlite3', [dbPath]);
    
    const updateQuery = `
      UPDATE youtube_ads 
      SET analysis_status = '${status}', analyzed_at = datetime('now') 
      WHERE id = ${id};
    `;
    
    sqlite.stdin.write(updateQuery);
    sqlite.stdin.end();
    
    sqlite.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        reject(new Error(`SQLite update failed with code ${code}`));
      }
    });
    
    sqlite.on('error', (error) => {
      reject(error);
    });
  });
}
