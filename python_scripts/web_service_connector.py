#!/usr/bin/env python3
"""
웹서비스 연동 모듈
- DB에서 분석 대기 중인 광고 데이터를 웹서비스로 전송
- 스케줄링 및 상태 업데이트 관리
"""

import requests
import json
import time
import schedule
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import logging

try:
    from database_setup import YouTubeAdsDatabase
except ImportError:
    print("❌ database_setup.py 파일이 필요합니다!")
    exit(1)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WebServiceConnector:
    """웹서비스 연동 클래스"""
    
    def __init__(self, web_service_url: str, api_key: str = None, db_path: str = "youtube_ads.db"):
        """
        Args:
            web_service_url: 웹서비스 API 엔드포인트 URL
            api_key: 웹서비스 인증 키 (필요시)
            db_path: 데이터베이스 파일 경로
        """
        self.web_service_url = web_service_url.rstrip('/')
        self.api_key = api_key
        self.db = YouTubeAdsDatabase(db_path)
        self.session = requests.Session()
        
        # 공통 헤더 설정
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'YouTube-Ads-Collector/1.0'
        })
        
        if api_key:
            self.session.headers.update({
                'Authorization': f'Bearer {api_key}'
            })
    
    def send_batch_to_web_service(self, batch_size: int = 10) -> Dict[str, int]:
        """
        분석 대기 중인 광고를 배치로 웹서비스에 전송
        
        Args:
            batch_size: 한 번에 전송할 광고 개수
            
        Returns:
            {'sent': 5, 'success': 4, 'failed': 1}
        """
        logger.info(f"📤 웹서비스 배치 전송 시작 (배치 크기: {batch_size})")
        
        # 분석 대기 중인 광고 조회
        pending_ads = self.db.get_pending_analysis(batch_size)
        
        if not pending_ads:
            logger.info("📭 전송할 대기 중인 광고가 없습니다.")
            return {'sent': 0, 'success': 0, 'failed': 0}
        
        results = {
            'sent': len(pending_ads),
            'success': 0,
            'failed': 0
        }
        
        logger.info(f"📋 전송할 광고: {len(pending_ads)}개")
        
        for ad in pending_ads:
            success = self._send_single_ad(ad)
            if success:
                results['success'] += 1
                # DB에서 상태 업데이트
                self.db.update_analysis_status(ad['id'], 'completed')
            else:
                results['failed'] += 1
                self.db.update_analysis_status(ad['id'], 'failed', 'Web service transmission failed')
            
            # 요청 간격 (웹서비스 과부하 방지)
            time.sleep(0.5)
        
        logger.info(f"✅ 배치 전송 완료: 성공 {results['success']}개, 실패 {results['failed']}개")
        
        # 동기화 로그 기록
        self._log_sync_result('batch_send', results['sent'], results['failed'] == 0)
        
        return results
    
    def _send_single_ad(self, ad: Dict) -> bool:
        """
        개별 광고를 웹서비스에 전송
        
        Args:
            ad: {'id': 1, 'title': '...', 'url': '...', 'note': '...'}
            
        Returns:
            전송 성공 여부
        """
        try:
            # 웹서비스 API 엔드포인트 (예시)
            endpoint = f"{self.web_service_url}/api/analyze"
            
            # 전송할 데이터 구성
            payload = {
                'id': ad['id'],
                'title': ad['title'],
                'url': ad['url'],
                'note': ad['note'],
                'collected_at': ad['collected_at'],
                'source': 'youtube_ads_collector'
            }
            
            logger.info(f"📤 전송 중: {ad['title'][:30]}...")
            
            response = self.session.post(endpoint, json=payload, timeout=30)
            
            if response.status_code in [200, 201, 202]:
                logger.info(f"   ✅ 전송 성공 (HTTP {response.status_code})")
                return True
            else:
                logger.error(f"   ❌ 전송 실패: HTTP {response.status_code} - {response.text}")
                return False
                
        except requests.exceptions.Timeout:
            logger.error(f"   ⏰ 전송 시간 초과")
            return False
        except requests.exceptions.RequestException as e:
            logger.error(f"   🌐 네트워크 오류: {e}")
            return False
        except Exception as e:
            logger.error(f"   💥 예상치 못한 오류: {e}")
            return False
    
    def check_web_service_status(self) -> bool:
        """웹서비스 상태 확인"""
        try:
            health_endpoint = f"{self.web_service_url}/api/health"
            response = self.session.get(health_endpoint, timeout=10)
            
            if response.status_code == 200:
                logger.info("✅ 웹서비스 정상 상태")
                return True
            else:
                logger.warning(f"⚠️ 웹서비스 상태 이상: HTTP {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"❌ 웹서비스 연결 실패: {e}")
            return False
    
    def get_analysis_results(self) -> List[Dict]:
        """
        웹서비스에서 분석 완료된 결과 조회
        
        Returns:
            [{'id': 1, 'status': 'completed', 'result': {...}}, ...]
        """
        try:
            endpoint = f"{self.web_service_url}/api/results"
            response = self.session.get(endpoint, timeout=30)
            
            if response.status_code == 200:
                results = response.json()
                logger.info(f"📥 분석 결과 조회: {len(results)}개")
                return results
            else:
                logger.error(f"❌ 결과 조회 실패: HTTP {response.status_code}")
                return []
                
        except Exception as e:
            logger.error(f"❌ 결과 조회 중 오류: {e}")
            return []
    
    def _log_sync_result(self, sync_type: str, records_count: int, success: bool, error_message: str = None):
        """동기화 로그 기록"""
        import sqlite3
        
        try:
            conn = sqlite3.connect(self.db.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO sync_log (sync_type, records_count, success, error_message)
                VALUES (?, ?, ?, ?)
            """, (sync_type, records_count, success, error_message))
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            logger.error(f"로그 기록 실패: {e}")
    
    def run_scheduled_sync(self):
        """스케줄된 동기화 실행"""
        logger.info("⏰ 스케줄된 동기화 시작")
        
        # 웹서비스 상태 확인
        if not self.check_web_service_status():
            logger.error("❌ 웹서비스 연결 불가로 동기화 중단")
            return
        
        # 배치 전송
        results = self.send_batch_to_web_service()
        
        if results['success'] > 0:
            logger.info(f"🎉 동기화 완료: {results['success']}개 전송 성공")
        else:
            logger.warning("⚠️ 전송된 데이터가 없습니다")

class ScheduledSyncManager:
    """스케줄된 동기화 관리자"""
    
    def __init__(self, connector: WebServiceConnector):
        self.connector = connector
        
    def setup_schedules(self, 
                       interval_minutes: int = 30, 
                       batch_size: int = 10,
                       daily_full_sync_hour: int = 2):
        """
        동기화 스케줄 설정
        
        Args:
            interval_minutes: 일반 동기화 간격 (분)
            batch_size: 배치 크기
            daily_full_sync_hour: 전체 동기화 시간 (24시간 기준)
        """
        logger.info(f"📅 동기화 스케줄 설정:")
        logger.info(f"   - 일반 동기화: {interval_minutes}분마다")
        logger.info(f"   - 배치 크기: {batch_size}개")
        logger.info(f"   - 전체 동기화: 매일 {daily_full_sync_hour}시")
        
        # 정기 동기화 (30분마다)
        schedule.every(interval_minutes).minutes.do(
            lambda: self.connector.send_batch_to_web_service(batch_size)
        )
        
        # 전체 동기화 (매일 새벽 2시)
        schedule.every().day.at(f"{daily_full_sync_hour:02d}:00").do(
            lambda: self.connector.send_batch_to_web_service(100)  # 더 큰 배치
        )
        
        # 상태 체크 (매시간)
        schedule.every().hour.do(self.connector.check_web_service_status)
    
    def run_forever(self):
        """무한 루프로 스케줄 실행"""
        logger.info("🔄 스케줄러 시작 (Ctrl+C로 중단)")
        
        try:
            while True:
                schedule.run_pending()
                time.sleep(60)  # 1분마다 스케줄 확인
                
        except KeyboardInterrupt:
            logger.info("⏸️ 스케줄러 중단됨")

def main():
    """메인 실행 함수"""
    print("🌐 YouTube 광고 분석 웹서비스 연동 도구")
    print("=" * 50)
    
    # 설정 입력
    web_service_url = input("🔗 웹서비스 URL을 입력하세요: ").strip()
    if not web_service_url:
        web_service_url = "http://localhost:8000"  # 기본값
        print(f"   기본값 사용: {web_service_url}")
    
    api_key = input("🔑 웹서비스 API 키 (선택사항): ").strip() or None
    
    # 연동기 초기화
    connector = WebServiceConnector(web_service_url, api_key)
    
    # 웹서비스 상태 확인
    if not connector.check_web_service_status():
        print("❌ 웹서비스에 연결할 수 없습니다. URL을 확인해주세요.")
        return
    
    # 실행 모드 선택
    print(f"\n실행 모드를 선택하세요:")
    print(f"1. 즉시 배치 전송")
    print(f"2. 스케줄된 자동 동기화")
    print(f"3. DB 상태 확인")
    
    mode = input("선택 (1-3): ").strip()
    
    if mode == "1":
        # 즉시 전송
        batch_size = int(input("배치 크기 (기본값: 10): ") or "10")
        results = connector.send_batch_to_web_service(batch_size)
        
        print(f"\n📊 전송 결과:")
        print(f"   전송: {results['sent']}개")
        print(f"   성공: {results['success']}개")
        print(f"   실패: {results['failed']}개")
        
    elif mode == "2":
        # 스케줄된 동기화
        manager = ScheduledSyncManager(connector)
        
        interval = int(input("동기화 간격(분, 기본값: 30): ") or "30")
        batch_size = int(input("배치 크기 (기본값: 10): ") or "10")
        
        manager.setup_schedules(interval, batch_size)
        manager.run_forever()
        
    elif mode == "3":
        # DB 상태 확인
        stats = connector.db.get_statistics()
        
        print(f"\n📊 현재 DB 상태:")
        print(f"   전체 광고: {stats['total_ads']}개")
        print(f"   분석 대기: {stats['pending']}개")
        print(f"   분석 완료: {stats['completed']}개")
        print(f"   분석 실패: {stats['failed']}개")
        
        # 최근 동기화 로그 확인
        import sqlite3
        try:
            conn = sqlite3.connect(connector.db.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT sync_type, records_count, success, sync_at
                FROM sync_log
                ORDER BY sync_at DESC
                LIMIT 5
            """)
            
            logs = cursor.fetchall()
            if logs:
                print(f"\n📝 최근 동기화 로그:")
                for log in logs:
                    status = "✅" if log[2] else "❌"
                    print(f"   {status} {log[0]}: {log[1]}개 ({log[3]})")
            
            conn.close()
            
        except Exception as e:
            print(f"   로그 조회 실패: {e}")
    
    else:
        print("❌ 잘못된 선택입니다.")

if __name__ == "__main__":
    main()