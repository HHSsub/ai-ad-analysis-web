#!/usr/bin/env python3
"""
YouTube 광고 수집기 데이터베이스 스키마 설정
"""

import sqlite3
import os
from datetime import datetime, timedelta

class YouTubeAdsDatabase:
    """YouTube 광고 데이터베이스 관리 클래스"""
    
    def __init__(self, db_path: str = "youtube_ads.db"):
        self.db_path = db_path
        self.init_database()
    
    def init_database(self):
        """데이터베이스 초기화 및 테이블 생성"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 1. 광고 영상 정보 테이블
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS youtube_ads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                url TEXT UNIQUE NOT NULL,  -- 중복 방지
                note TEXT,
                search_query TEXT,         -- 어떤 검색어로 찾았는지 추적
                api_source TEXT,           -- Apify 또는 SerpAPI
                collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                analyzed_at TIMESTAMP NULL, -- 분석 완료 시간
                analysis_status TEXT DEFAULT 'pending'  -- pending, completed, failed
            )
        """)
        
        # 2. 검색 기록 테이블 (중복 호출 방지)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS search_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query TEXT UNIQUE NOT NULL,
                api_source TEXT NOT NULL,   -- Apify 또는 SerpAPI
                last_collected TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                total_found INTEGER DEFAULT 0,
                success_count INTEGER DEFAULT 0
            )
        """)
        
        # 3. 분석 큐 테이블 (웹서비스 연동용)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS analysis_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                youtube_ad_id INTEGER,
                priority INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                processed_at TIMESTAMP NULL,
                status TEXT DEFAULT 'waiting',  -- waiting, processing, completed, failed
                error_message TEXT NULL,
                FOREIGN KEY (youtube_ad_id) REFERENCES youtube_ads (id)
            )
        """)
        
        # 4. 웹서비스 연동 로그 테이블
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sync_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sync_type TEXT NOT NULL,  -- 'fetch_new', 'update_status' 등
                records_count INTEGER,
                success BOOLEAN,
                error_message TEXT NULL,
                sync_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # 인덱스 생성 (성능 최적화)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ads_url ON youtube_ads(url)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ads_collected_at ON youtube_ads(collected_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ads_analysis_status ON youtube_ads(analysis_status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_search_query ON search_history(query)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_queue_status ON analysis_queue(status)")
        
        conn.commit()
        conn.close()
        
        print(f"✅ 데이터베이스 초기화 완료: {self.db_path}")
    
    def should_collect(self, search_query: str, api_source: str, hours: int = 24) -> bool:
        """
        검색어별로 최근 수집 여부 확인 (중복 호출 방지)
        
        Args:
            search_query: 검색어
            api_source: API 소스 (Apify 또는 SerpAPI)
            hours: 중복 방지 시간 (기본 24시간)
            
        Returns:
            True: 수집 필요, False: 수집 불필요
        """
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
                print(f"   🎯 수집 필요: {'Yes' if should_collect else 'No'}")
                
                return should_collect
            else:
                print(f"   🆕 신규 검색어: 수집 필요")
                return True
                
        finally:
            conn.close()
    
    def save_ads(self, ads: list, search_query: str, api_source: str) -> int:
        """
        광고 데이터를 DB에 저장
        
        Returns:
            저장된 신규 광고 개수
        """
        if not ads:
            return 0
            
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        new_count = 0
        
        try:
            for ad in ads:
                # 광고 데이터 저장 (중복 시 무시)
                cursor.execute("""
                    INSERT OR IGNORE INTO youtube_ads 
                    (title, url, note, search_query, api_source)
                    VALUES (?, ?, ?, ?, ?)
                """, (ad.title, ad.url, ad.note, search_query, api_source))
                
                if cursor.rowcount > 0:
                    new_count += 1
                    ad_id = cursor.lastrowid
                    
                    # 분석 큐에 추가
                    cursor.execute("""
                        INSERT INTO analysis_queue (youtube_ad_id, priority)
                        VALUES (?, ?)
                    """, (ad_id, 1))
            
            # 검색 기록 업데이트
            cursor.execute("""
                INSERT INTO search_history (query, api_source, total_found, success_count)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(query) DO UPDATE SET
                    last_collected = CURRENT_TIMESTAMP,
                    total_found = total_found + ?,
                    success_count = success_count + ?
            """, (search_query, api_source, len(ads), new_count, len(ads), new_count))
            
            conn.commit()
            
            print(f"   💾 저장 완료: 전체 {len(ads)}개 중 신규 {new_count}개")
            return new_count
            
        finally:
            conn.close()
    
    def get_pending_analysis(self, limit: int = 100) -> list:
        """
        분석 대기 중인 광고 목록 조회 (웹서비스 연동용)
        
        Returns:
            [{'id': 1, 'title': '...', 'url': '...', 'note': '...'}, ...]
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT a.id, a.title, a.url, a.note, a.collected_at
                FROM youtube_ads a
                WHERE a.analysis_status = 'pending'
                ORDER BY a.collected_at DESC
                LIMIT ?
            """, (limit,))
            
            rows = cursor.fetchall()
            
            return [
                {
                    'id': row[0],
                    'title': row[1],
                    'url': row[2],
                    'note': row[3],
                    'collected_at': row[4]
                }
                for row in rows
            ]
            
        finally:
            conn.close()
    
    def update_analysis_status(self, ad_id: int, status: str, error_message: str = None):
        """
        분석 상태 업데이트 (웹서비스에서 호출)
        
        Args:
            ad_id: 광고 ID
            status: 'completed' 또는 'failed'
            error_message: 실패 시 오류 메시지
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            if status == 'completed':
                cursor.execute("""
                    UPDATE youtube_ads 
                    SET analysis_status = ?, analyzed_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                """, (status, ad_id))
            else:
                cursor.execute("""
                    UPDATE youtube_ads 
                    SET analysis_status = ?, analyzed_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                """, (status, ad_id))
            
            # 분석 큐에서 제거
            cursor.execute("""
                UPDATE analysis_queue 
                SET status = ?, processed_at = CURRENT_TIMESTAMP, error_message = ?
                WHERE youtube_ad_id = ?
            """, (status, error_message, ad_id))
            
            conn.commit()
            
        finally:
            conn.close()
    
    def get_statistics(self) -> dict:
        """데이터베이스 통계 조회"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            stats = {}
            
            # 전체 광고 수
            cursor.execute("SELECT COUNT(*) FROM youtube_ads")
            stats['total_ads'] = cursor.fetchone()[0]
            
            # 분석 상태별 개수
            cursor.execute("""
                SELECT analysis_status, COUNT(*) 
                FROM youtube_ads 
                GROUP BY analysis_status
            """)
            status_counts = dict(cursor.fetchall())
            stats['pending'] = status_counts.get('pending', 0)
            stats['completed'] = status_counts.get('completed', 0)
            stats['failed'] = status_counts.get('failed', 0)
            
            # API 소스별 개수
            cursor.execute("""
                SELECT api_source, COUNT(*) 
                FROM youtube_ads 
                GROUP BY api_source
            """)
            source_counts = dict(cursor.fetchall())
            stats['apify_count'] = source_counts.get('Apify', 0)
            stats['serpapi_count'] = source_counts.get('SerpAPI', 0)
            
            # 최근 수집 시간
            cursor.execute("""
                SELECT MAX(collected_at) FROM youtube_ads
            """)
            latest = cursor.fetchone()[0]
            stats['latest_collection'] = latest
            
            return stats
            
        finally:
            conn.close()
    
    def export_for_analysis(self, status: str = 'pending', format: str = 'json') -> str:
        """
        분석용 데이터 내보내기
        
        Args:
            status: 'pending', 'all' 등
            format: 'json', 'csv'
            
        Returns:
            내보낸 파일 경로
        """
        import json
        import csv
        from datetime import datetime
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            if status == 'all':
                cursor.execute("""
                    SELECT id, title, url, note, collected_at, analysis_status
                    FROM youtube_ads ORDER BY collected_at DESC
                """)
            else:
                cursor.execute("""
                    SELECT id, title, url, note, collected_at, analysis_status
                    FROM youtube_ads WHERE analysis_status = ?
                    ORDER BY collected_at DESC
                """, (status,))
            
            rows = cursor.fetchall()
            data = [
                {
                    'id': row[0],
                    'title': row[1],
                    'url': row[2],
                    'note': row[3],
                    'collected_at': row[4],
                    'analysis_status': row[5]
                }
                for row in rows
            ]
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            
            if format == 'json':
                filename = f"youtube_ads_{status}_{timestamp}.json"
                with open(filename, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
            else:  # CSV
                filename = f"youtube_ads_{status}_{timestamp}.csv"
                with open(filename, 'w', newline='', encoding='utf-8') as f:
                    if data:
                        writer = csv.DictWriter(f, fieldnames=data[0].keys())
                        writer.writeheader()
                        writer.writerows(data)
            
            print(f"📁 데이터 내보내기 완료: {filename} ({len(data)}개 레코드)")
            return filename
            
        finally:
            conn.close()

def main():
    """데이터베이스 설정 및 테스트"""
    print("🗄️ YouTube 광고 수집기 데이터베이스 설정")
    print("=" * 50)
    
    # 데이터베이스 초기화
    db = YouTubeAdsDatabase()
    
    # 통계 출력
    stats = db.get_statistics()
    print(f"\n📊 현재 데이터베이스 상태:")
    print(f"   전체 광고: {stats['total_ads']}개")
    print(f"   분석 대기: {stats['pending']}개")
    print(f"   분석 완료: {stats['completed']}개")
    print(f"   분석 실패: {stats['failed']}개")
    print(f"   Apify 수집: {stats['apify_count']}개")
    print(f"   SerpAPI 수집: {stats['serpapi_count']}개")
    
    if stats['latest_collection']:
        print(f"   최근 수집: {stats['latest_collection']}")
    
    print(f"\n✅ 데이터베이스 설정 완료!")
    print(f"   파일 위치: {db.db_path}")

if __name__ == "__main__":
    main()