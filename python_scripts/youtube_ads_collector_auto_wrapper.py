#!/usr/bin/env python3
"""
완전 자동 모드 - 사용자 입력 없이 계속 실행
"""
import os
import sys
import json
import time
from youtube_ads_collector_with_db import YouTubeAdsCollectorDB

def main():
    # 환경변수 설정
    serp_api_key = os.environ.get('SERPAPI_KEY', '646e6386e54a3e331122aa9460166830bcdbd35c89283b857dcf66901e11db2a')
    apify_token = os.environ.get('APIFY_TOKEN', '')
    
    # 수집기 초기화
    collector = YouTubeAdsCollectorDB(
        apify_token=apify_token,
        serp_api_key=serp_api_key
    )
    
    # 검색 키워드 목록
    search_queries = [
        "advertisement commercial",
        "product promotion",
        "brand commercial",
        "sponsored content",
        "new product launch",
        "company ad",
        "marketing video",
        "product review",
        "unboxing video sponsored",
        "paid partnership",
        "ad campaign",
        "promotional video",
        "infomercial",
        "sponsored review",
        "affiliate marketing"
    ]
    
    print(f"🤖 완전 자동 모드 실행")
    print(f"🔍 검색어 {len(search_queries)}개로 계속 수집")
    
    while True:
        try:
            # 현재 DB 상태
            stats = collector.get_database_stats()
            print(f"\n📊 DB 상태: 전체 {stats['total_ads']}개, 대기 {stats['pending']}개")
            
            # 수집 실행 (검색어당 50개씩)
            results = collector.collect_all_ads(
                search_queries=search_queries,
                max_ads_per_query=50
            )
            
            # 결과 JSON 출력
            result_json = {
                "success": True,
                "total_collected": results['total_collected'],
                "new_ads": results['new_ads'],
                "apify": results['apify'],
                "serpapi": results['serpapi'],
                "skipped_queries": results['skipped_queries'],
                "stats": collector.get_database_stats()
            }
            
            print(f"RESULT_JSON:{json.dumps(result_json)}")
            
            # 30분 대기 후 다시 실행
            print(f"\n💤 30분 후 다시 수집 시작...")
            time.sleep(1800)  # 30분
            
        except KeyboardInterrupt:
            print("\n⏹️ 자동 수집 중단")
            break
        except Exception as e:
            print(f"❌ 오류 발생: {e}")
            time.sleep(60)  # 오류시 1분 대기

if __name__ == "__main__":
    main()
