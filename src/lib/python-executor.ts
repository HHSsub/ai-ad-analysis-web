import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

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
   * Python 광고 수집기 실행 (비대화식)
   */
  async executeCollector(options: CollectorOptions = {}): Promise<CollectorResult> {
    const { maxAds = 20, searchQueries } = options;
    
    return new Promise((resolve) => {
      // Python 스크립트를 비대화식으로 실행하기 위한 설정
      const pythonCode = this.generatePythonScript(maxAds, searchQueries);
      
      // 임시 파일에 Python 코드 작성
      const tempScript = path.join(process.cwd(), 'temp_collector.py');
      fs.writeFileSync(tempScript, pythonCode);
      
      const pythonProcess = spawn('python3', [tempScript], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          APIFY_TOKEN: process.env.APIFY_TOKEN || '',
          SERPAPI_KEY: process.env.SERPAPI_KEY || '646e6386e54a3e331122aa9460166830bcdbd35c89283b857dcf66901e11db2a',
          PYTHONUNBUFFERED: '1'  // Python 출력 버퍼링 방지
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let output = '';
      let errorOutput = '';
      
      // 표준 입력 닫기 (대화식 입력 방지)
      pythonProcess.stdin.end();
      
      pythonProcess.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log(`[Python Collector] ${text.trim()}`);
      });
      
      pythonProcess.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        console.error(`[Python Collector Error] ${text.trim()}`);
      });
      
      pythonProcess.on('close', (code) => {
        // 임시 파일 삭제
        try {
          fs.unlinkSync(tempScript);
        } catch (e) {
          console.warn('임시 파일 삭제 실패:', e);
        }
        
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
        try {
          fs.unlinkSync(tempScript);
        } catch (e) {}
        resolve({
          success: false,
          error: `Failed to start Python process: ${error.message}`
        });
      });
      
      // 타임아웃 설정 (5분)
      setTimeout(() => {
        pythonProcess.kill('SIGTERM');
        resolve({
          success: false,
          error: 'Python script execution timeout (5 minutes)'
        });
      }, 300000);
    });
  }
  
  /**
   * 비대화식 Python 스크립트 생성
   */
  private generatePythonScript(maxAds: number, searchQueries?: string[]): string {
    const defaultQueries = [
      "advertisement commercial",
      "product promotion",
      "brand commercial",
      "sponsored content",
      "new product launch"
    ];
    
    const queries = searchQueries || defaultQueries;
    
    return `#!/usr/bin/env python3
import os
import sys
import sqlite3
import requests
import time
import json
from datetime import datetime
from typing import List, Dict, Optional
from dataclasses import dataclass

@dataclass
class AdVideoInfo:
    title: str
    url: str
    note: str

class YouTubeAdsDatabase:
    def __init__(self, db_path: str = "youtube_ads.db"):
        self.db_path = db_path
        self.init_database()
    
    def init_database(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS youtube_ads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                url TEXT UNIQUE NOT NULL,
                note TEXT,
                search_query TEXT,
                api_source TEXT,
                collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                analyzed_at TIMESTAMP NULL,
                analysis_status TEXT DEFAULT 'pending'
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS search_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query TEXT UNIQUE NOT NULL,
                api_source TEXT NOT NULL,
                last_collected TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                total_found INTEGER DEFAULT 0,
                success_count INTEGER DEFAULT 0
            )
        """)
        
        conn.commit()
        conn.close()
        print("✅ 데이터베이스 초기화 완료")
    
    def should_collect(self, search_query: str, api_source: str, hours: int = 24) -> bool:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT last_collected FROM search_history 
                WHERE query = ? AND api_source = ?
            """, (search_query, api_source))
            
            row = cursor.fetchone()
            if row:
                last_collected = datetime.fromisoformat(row[0])
                time_diff = datetime.now() - last_collected
                should_collect = time_diff.total_seconds() > hours * 3600
                print(f"   🕐 마지막 수집: {last_collected.strftime('%Y-%m-%d %H:%M')}")
                print(f"   ⏰ 경과 시간: {time_diff.total_seconds() / 3600:.1f}시간")
                return should_collect
            else:
                print(f"   🆕 신규 검색어: 수집 필요")
                return True
                
        finally:
            conn.close()
    
    def save_ads(self, ads: list, search_query: str, api_source: str) -> int:
        if not ads:
            return 0
            
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        new_count = 0
        
        try:
            for ad in ads:
                cursor.execute("""
                    INSERT OR IGNORE INTO youtube_ads 
                    (title, url, note, search_query, api_source)
                    VALUES (?, ?, ?, ?, ?)
                """, (ad.title, ad.url, ad.note, search_query, api_source))
                
                if cursor.rowcount > 0:
                    new_count += 1
            
            cursor.execute("""
                INSERT OR REPLACE INTO search_history (query, api_source, total_found, success_count, last_collected)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, (search_query, api_source, len(ads), new_count))
            
            conn.commit()
            print(f"   💾 저장 완료: 전체 {len(ads)}개 중 신규 {new_count}개")
            return new_count
            
        finally:
            conn.close()

class YouTubeAdsCollector:
    def __init__(self):
        self.db = YouTubeAdsDatabase()
        self.serp_api_key = "${process.env.SERPAPI_KEY || '646e6386e54a3e331122aa9460166830bcdbd35c89283b857dcf66901e11db2a'}"
    
    def collect_ads_with_serpapi(self, search_query: str) -> List[AdVideoInfo]:
        if not self.serp_api_key:
            print("SerpAPI 키가 필요합니다.")
            return []
        
        if not self.db.should_collect(search_query, "SerpAPI", hours=6):
            print(f"⏭️ SerpAPI '{search_query}' 수집 건너뛰기 (6시간 이내 수집됨)")
            return []
        
        url = "https://serpapi.com/search"
        params = {
            "engine": "youtube",
            "search_query": search_query,
            "api_key": self.serp_api_key,
            "num": 20
        }
        
        try:
            print(f"📡 SerpAPI로 '{search_query}' 수집 중...")
            response = requests.get(url, params=params, timeout=60)
            
            if response.status_code == 200:
                data = response.json()
                
                if "error" in data:
                    print(f"SerpAPI 오류: {data['error']}")
                    return []
                
                ad_videos = []
                
                # 광고 결과 처리
                ads_results = data.get("ads_results", [])
                for ad in ads_results:
                    title = ad.get('title', 'Unknown Title').strip()
                    link = ad.get('link', '')
                    
                    if link and 'youtube.com' in link:
                        note = f"📢 SerpAPI 광고"
                        if 'views' in ad:
                            note += f" | 조회수: {ad['views']}"
                        
                        ad_video = AdVideoInfo(
                            title=title[:150],
                            url=link,
                            note=note[:200]
                        )
                        ad_videos.append(ad_video)
                
                # 광고성 키워드 비디오 필터링
                video_results = data.get("video_results", [])
                ad_keywords = ['ad', 'advertisement', 'commercial', 'sponsored', 'promo', 'review']
                
                for video in video_results:
                    title = video.get('title', '').strip()
                    link = video.get('link', '')
                    
                    if any(keyword in title.lower() for keyword in ad_keywords):
                        if link and 'youtube.com' in link:
                            note = f"🎬 SerpAPI 광고성 콘텐츠"
                            if 'views' in video:
                                note += f" | 조회수: {video['views']}"
                            
                            ad_video = AdVideoInfo(
                                title=title[:150],
                                url=link,
                                note=note[:200]
                            )
                            ad_videos.append(ad_video)
                
                print(f"   ✅ 수집된 광고: {len(ad_videos)}개")
                return ad_videos
                
            else:
                print(f"SerpAPI 요청 실패: HTTP {response.status_code}")
                return []
                
        except Exception as e:
            print(f"SerpAPI 데이터 처리 중 오류: {e}")
            return []
    
    def collect_all_ads(self, search_queries: List[str], max_ads_per_query: int = 30) -> Dict[str, int]:
        results = {
            'total_collected': 0,
            'new_ads': 0,
            'serpapi': 0,
            'skipped_queries': 0
        }
        
        print(f"🚀 광고 수집 시작 - {len(search_queries)}개 검색어")
        
        for i, query in enumerate(search_queries, 1):
            print(f"\\n📍 [{i}/{len(search_queries)}] 검색어: '{query}'")
            
            collected_this_query = 0
            
            # SerpAPI 수집
            serpapi_ads = self.collect_ads_with_serpapi(query)
            if serpapi_ads:
                new_count = self.db.save_ads(serpapi_ads, query, "SerpAPI")
                results['total_collected'] += len(serpapi_ads)
                results['new_ads'] += new_count
                results['serpapi'] += len(serpapi_ads)
                collected_this_query += len(serpapi_ads)
                time.sleep(1)  # API 요청 간격
            
            if collected_this_query == 0:
                results['skipped_queries'] += 1
                print(f"   ⏭️ 건너뛰기 (최근 수집됨 또는 오류)")
            else:
                print(f"   ✅ 이번 쿼리 수집: {collected_this_query}개")
        
        return results

# 메인 실행 함수
def main():
    print("🚀 YouTube 광고 동영상 자동 수집 시작")
    print("=" * 60)
    
    collector = YouTubeAdsCollector()
    
    # 검색어 리스트
    search_queries = ${JSON.stringify(queries)}
    max_ads = ${maxAds}
    
    try:
        # 수집 실행
        print(f"🎯 검색어당 최대 수집 개수: {max_ads}")
        results = collector.collect_all_ads(search_queries, max_ads)
        
        # 결과 출력
        print("\\n" + "="*60)
        print("📊 수집 결과 요약")
        print("="*60)
        print(f"✅ 총 수집: {results['total_collected']}개")
        print(f"🆕 신규 광고: {results['new_ads']}개")
        print(f"🔍 SerpAPI: {results['serpapi']}개")
        print(f"⏭️ 건너뛴 검색어: {results['skipped_queries']}개")
        
        if results['new_ads'] > 0:
            print(f"\\n🎉 수집 완료! {results['new_ads']}개 신규 광고가 DB에 저장되었습니다.")
        else:
            print(f"\\n💡 신규 광고가 없습니다. (중복 제거됨)")
            
        # JSON 형태로 결과 출력 (웹에서 파싱용)
        print("\\nRESULT_JSON:" + json.dumps(results))
            
    except Exception as e:
        print(f"실행 중 오류 발생: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
`;
  }
  
  /**
   * 데이터베이스 통계 조회 (SQLite 직접 조회)
   */
  async getStats(): Promise<DatabaseStats> {
    return new Promise((resolve) => {
      if (!fs.existsSync(this.dbPath)) {
        resolve({
          total_ads: 0,
          pending: 0,
          completed: 0,
          failed: 0
        });
        return;
      }
      
      try {
        // SQLite3 바이너리를 직접 사용
        const sqlite = spawn('sqlite3', [this.dbPath, '-json', `
          SELECT 
            (SELECT COUNT(*) FROM youtube_ads) as total_ads,
            (SELECT COUNT(*) FROM youtube_ads WHERE analysis_status = 'pending') as pending,
            (SELECT COUNT(*) FROM youtube_ads WHERE analysis_status = 'completed') as completed,
            (SELECT COUNT(*) FROM youtube_ads WHERE analysis_status = 'failed') as failed,
            (SELECT MAX(collected_at) FROM youtube_ads) as latest_collection
        `]);
        
        let output = '';
        sqlite.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        sqlite.on('close', (code) => {
          try {
            const result = JSON.parse(output.trim())[0] || {};
            resolve({
              total_ads: result.total_ads || 0,
              pending: result.pending || 0,
              completed: result.completed || 0,
              failed: result.failed || 0,
              latest_collection: result.latest_collection
            });
          } catch (e) {
            console.error('통계 파싱 실패:', e);
            resolve({
              total_ads: 0,
              pending: 0,
              completed: 0,
              failed: 0
            });
          }
        });
        
        sqlite.on('error', (error) => {
          console.error('SQLite3 실행 오류:', error);
          resolve({
            total_ads: 0,
            pending: 0,
            completed: 0,
            failed: 0
          });
        });
        
      } catch (error) {
        console.error('통계 조회 오류:', error);
        resolve({
          total_ads: 0,
          pending: 0,
          completed: 0,
          failed: 0
        });
      }
    });
  }
  
  /**
   * 최근 수집된 광고 데이터 조회
   */
  async readDatabase(limit: number = 100): Promise<any[]> {
    return new Promise((resolve) => {
      if (!fs.existsSync(this.dbPath)) {
        resolve([]);
        return;
      }
      
      try {
        const sqlite = spawn('sqlite3', [this.dbPath, '-json', `
          SELECT id, title, url, note, search_query, api_source, 
                 collected_at, analyzed_at, analysis_status
          FROM youtube_ads 
          ORDER BY collected_at DESC 
          LIMIT ${limit}
        `]);
        
        let output = '';
        sqlite.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        sqlite.on('close', (code) => {
          try {
            const results = JSON.parse(output.trim()) || [];
            resolve(results);
          } catch (e) {
            console.error('데이터 파싱 실패:', e);
            resolve([]);
          }
        });
        
        sqlite.on('error', (error) => {
          console.error('데이터 조회 오류:', error);
          resolve([]);
        });
        
      } catch (error) {
        resolve([]);
      }
    });
  }
}
