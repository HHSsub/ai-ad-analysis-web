#!/usr/bin/env python3
"""
YouTube 광고 동영상 URL 자동 수집 엔진 (DB 연동 버전)
- 중복 호출 방지
- 데이터베이스 누적 저장
- 웹서비스 연동 준비
"""

import requests
import time
import json
import os
from typing import List, Dict, Optional
from dataclasses import dataclass
import logging
from datetime import datetime

# 로컬 DB 모듈 import
try:
    from database_setup import YouTubeAdsDatabase
except ImportError:
    print("❌ database_setup.py 파일이 필요합니다!")
    exit(1)

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class AdVideoInfo:
    """광고 비디오 정보를 담는 데이터 클래스"""
    title: str
    url: str
    note: str

class YouTubeAdsCollectorDB:
    """YouTube 광고 동영상 URL 수집기 (DB 연동 버전)"""
    
    def __init__(self, apify_token: Optional[str] = None, serp_api_key: Optional[str] = None, db_path: str = "youtube_ads.db"):
        self.apify_token = apify_token or os.getenv('APIFY_TOKEN')
        self.serp_api_key = serp_api_key or os.getenv('SERPAPI_KEY')
        self.db = YouTubeAdsDatabase(db_path)
        
    def collect_ads_with_apify(self, search_query: str, max_ads: int = 50) -> List[AdVideoInfo]:
        """Apify YouTube Ads Scraper를 사용한 광고 수집"""
        if not self.apify_token:
            logger.error("Apify token이 필요합니다.")
            return []
            
        # 🔥 중복 호출 방지 체크
        if not self.db.should_collect(search_query, "Apify", hours=24):
            logger.info(f"⏭️ Apify '{search_query}' 수집 건너뛰기 (24시간 이내 수집됨)")
            return []
        
        url = "https://api.apify.com/v2/acts/xtech~youtube-ads-scraper/run-sync-get-dataset-items"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.apify_token}"
        }
        data = {"max_ads": max_ads}
        
        try:
            logger.info(f"📡 Apify로 '{search_query}' 수집 중...")
            response = requests.post(url, headers=headers, json=data, timeout=300)
            response.raise_for_status()
            
            ads_data = response.json()
            logger.info(f"   📥 수신된 데이터: {len(ads_data)}개")
            
            ad_videos = []
            for ad in ads_data:
                if isinstance(ad, dict):
                    video_id = ad.get('video_id', '')
                    youtube_url = f"https://www.youtube.com/watch?v={video_id}" if video_id else ""
                    
                    title = ""
                    if 'youtubeData' in ad and 'title' in ad['youtubeData']:
                        title = ad['youtubeData']['title'].strip()
                    
                    note_parts = [f"✅ Apify 확실한 광고"]
                    if 'advertiser_id' in ad:
                        note_parts.append(f"광고주ID: {ad['advertiser_id']}")
                    if 'youtubeStatistics' in ad:
                        stats = ad['youtubeStatistics']
                        if 'viewCount' in stats:
                            note_parts.append(f"조회수: {stats['viewCount']}")
                    
                    note = " | ".join(note_parts)
                    
                    if youtube_url and title:
                        ad_video = AdVideoInfo(
                            title=title[:150],
                            url=youtube_url,
                            note=note[:200]
                        )
                        ad_videos.append(ad_video)
            
            logger.info(f"   ✅ 처리된 광고: {len(ad_videos)}개")
            return ad_videos
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Apify API 요청 실패: {e}")
            return []
        except Exception as e:
            logger.error(f"Apify 데이터 처리 중 오류: {e}")
            return []
    
    def collect_ads_with_serpapi(self, search_query: str) -> List[AdVideoInfo]:
        """SerpAPI를 사용한 YouTube 광고 검색"""
        if not self.serp_api_key:
            logger.error("SerpAPI 키가 필요합니다.")
            return []
        
        # 🔥 중복 호출 방지 체크
        if not self.db.should_collect(search_query, "SerpAPI", hours=6):  # SerpAPI는 6시간
            logger.info(f"⏭️ SerpAPI '{search_query}' 수집 건너뛰기 (6시간 이내 수집됨)")
            return []
        
        url = "https://serpapi.com/search"
        params = {
            "engine": "youtube",
            "search_query": search_query,
            "api_key": self.serp_api_key,
            "num": 20
        }
        
        try:
            logger.info(f"📡 SerpAPI로 '{search_query}' 수집 중...")
            response = requests.get(url, params=params, timeout=60)
            
            if response.status_code == 200:
                data = response.json()
                
                if "error" in data:
                    logger.error(f"SerpAPI 오류: {data['error']}")
                    return []
                
                ad_videos = []
                
                # 실제 광고 결과 처리
                ads_results = data.get("ads_results", [])
                for ad in ads_results:
                    title = ad.get('title', 'Unknown Title').strip()
                    link = ad.get('link', '')
                    
                    if link and 'youtube.com' in link:
                        note_parts = [f"📢 SerpAPI 광고"]
                        if 'views' in ad:
                            note_parts.append(f"조회수: {ad['views']}")
                        if 'channel' in ad and 'name' in ad['channel']:
                            note_parts.append(f"채널: {ad['channel']['name']}")
                        
                        note = " | ".join(note_parts)
                        
                        ad_video = AdVideoInfo(
                            title=title[:150],
                            url=link,
                            note=note[:200]
                        )
                        ad_videos.append(ad_video)
                
                # 광고성 키워드 비디오 필터링
                video_results = data.get("video_results", [])
                ad_keywords = ['ad', 'advertisement', 'commercial', 'sponsored', 'promo', 'review', 'unboxing']
                
                for video in video_results:
                    title = video.get('title', '').strip()
                    link = video.get('link', '')
                    
                    if any(keyword in title.lower() for keyword in ad_keywords):
                        if link and 'youtube.com' in link:
                            note_parts = [f"🎬 SerpAPI 광고성 콘텐츠"]
                            if 'views' in video:
                                note_parts.append(f"조회수: {video['views']}")
                            if 'channel' in video and 'name' in video['channel']:
                                note_parts.append(f"채널: {video['channel']['name']}")
                            
                            note = " | ".join(note_parts)
                            
                            ad_video = AdVideoInfo(
                                title=title[:150],
                                url=link,
                                note=note[:200]
                            )
                            ad_videos.append(ad_video)
                
                logger.info(f"   ✅ 수집된 광고: {len(ad_videos)}개")
                return ad_videos
                
            else:
                logger.error(f"SerpAPI 요청 실패: HTTP {response.status_code}")
                return []
                
        except requests.exceptions.RequestException as e:
            logger.error(f"SerpAPI 요청 실패: {e}")
            return []
        except Exception as e:
            logger.error(f"SerpAPI 데이터 처리 중 오류: {e}")
            return []
    
    def collect_all_ads(self, search_queries: List[str] = None, max_ads_per_query: int = 30) -> Dict[str, int]:
        """
        모든 방법으로 광고 수집 및 DB 저장
        
        Returns:
            {'total_collected': 50, 'new_ads': 25, 'apify': 20, 'serpapi': 5}
        """
        if search_queries is None:
            search_queries = [
                "advertisement commercial",
                "product promotion",
                "brand commercial",
                "sponsored content",
                "new product launch",
                "company ad",
                "marketing video",
                "product review"
            ]
        
        results = {
            'total_collected': 0,
            'new_ads': 0,
            'apify': 0,
            'serpapi': 0,
            'skipped_queries': 0
        }
        
        logger.info(f"🚀 광고 수집 시작 - {len(search_queries)}개 검색어")
        
        for i, query in enumerate(search_queries, 1):
            print(f"\n📍 [{i}/{len(search_queries)}] 검색어: '{query}'")
            
            collected_this_query = 0
            
            # Apify 수집
            if self.apify_token:
                apify_ads = self.collect_ads_with_apify(query, max_ads_per_query)
                if apify_ads:
                    new_count = self.db.save_ads(apify_ads, query, "Apify")
                    results['total_collected'] += len(apify_ads)
                    results['new_ads'] += new_count
                    results['apify'] += len(apify_ads)
                    collected_this_query += len(apify_ads)
                    time.sleep(2)  # API 요청 간격
            
            # SerpAPI 수집
            if self.serp_api_key:
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
    
    def get_database_stats(self) -> dict:
        """데이터베이스 통계 조회"""
        return self.db.get_statistics()
    
    def export_for_web_service(self, status: str = 'pending', limit: int = 100) -> list:
        """
        웹서비스 연동용 데이터 추출
        
        Args:
            status: 'pending', 'all'
            limit: 최대 개수
            
        Returns:
            [{'id': 1, 'title': '...', 'url': '...', 'note': '...'}, ...]
        """
        if status == 'pending':
            return self.db.get_pending_analysis(limit)
        else:
            # 모든 데이터 조회 로직 (필요시 구현)
            pass

def main():
    """메인 실행 함수"""
    print("🚀 YouTube 광고 동영상 URL 자동 수집 엔진 (DB 연동)")
    print("=" * 60)
    
    # API 키 설정
    apify_token = os.getenv('APIFY_TOKEN')
    serp_api_key = os.getenv('SERPAPI_KEY')
    
    if not apify_token and not serp_api_key:
        print("🔑 API 키 입력")
        serp_api_key = "646e6386e54a3e331122aa9460166830bcdbd35c89283b857dcf66901e11db2a"
        if not apify_token and not serp_api_key:
            logger.error("최소 하나의 API 키가 필요합니다!")
            return
    
    # 수집기 초기화
    collector = YouTubeAdsCollectorDB(
        apify_token=apify_token,
        serp_api_key=serp_api_key
    )
    
    # 현재 DB 상태 출력
    stats = collector.get_database_stats()
    print(f"\n📊 현재 데이터베이스 상태:")
    print(f"   전체 광고: {stats['total_ads']}개")
    print(f"   분석 대기: {stats['pending']}개")
    print(f"   분석 완료: {stats['completed']}개")
    print(f"   최근 수집: {stats.get('latest_collection', '없음')}")
    
    # 사용자 설정
    try:
        max_ads = int(input(f"\n🎯 검색어당 최대 수집 개수 (기본값: 20): ") or "20")
        
        # 수집 실행
        print(f"\n🚀 광고 수집 시작...")
        results = collector.collect_all_ads(max_ads_per_query=max_ads)
        
        # 결과 출력
        print(f"\n" + "="*60)
        print(f"📊 수집 결과 요약")
        print(f"="*60)
        print(f"✅ 총 수집: {results['total_collected']}개")
        print(f"🆕 신규 광고: {results['new_ads']}개")
        print(f"📡 Apify: {results['apify']}개")
        print(f"🔍 SerpAPI: {results['serpapi']}개")
        print(f"⏭️ 건너뛴 검색어: {results['skipped_queries']}개")
        
        # 업데이트된 DB 상태
        final_stats = collector.get_database_stats()
        print(f"\n📈 업데이트된 DB 상태:")
        print(f"   전체 광고: {final_stats['total_ads']}개")
        print(f"   분석 대기: {final_stats['pending']}개")
        
        if results['new_ads'] > 0:
            print(f"\n🎉 수집 완료! {results['new_ads']}개 신규 광고가 DB에 저장되었습니다.")
            
            # 웹서비스 연동용 데이터 미리보기
            pending_ads = collector.export_for_web_service('pending', 3)
            if pending_ads:
                print(f"\n📋 웹서비스 연동 대기 목록 (처음 3개):")
                print(f"-" * 60)
                for i, ad in enumerate(pending_ads, 1):
                    print(f"{i}. 제목: {ad['title'][:50]}...")
                    print(f"   URL: {ad['url']}")
                    print(f"   수집일: {ad['collected_at']}")
                    print()
        else:
            print(f"\n💡 신규 광고가 없습니다. (중복 제거됨)")
            
    except KeyboardInterrupt:
        print("\n\n⏸️ 사용자에 의해 중단되었습니다.")
    except ValueError:
        print("❌ 올바른 숫자를 입력해주세요.")
    except Exception as e:
        logger.error(f"실행 중 오류 발생: {e}")

if __name__ == "__main__":

    main()

