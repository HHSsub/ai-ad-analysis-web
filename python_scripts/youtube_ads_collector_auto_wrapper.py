#!/usr/bin/env python3
"""
자동 모드를 위한 래퍼 스크립트
기존 youtube_ads_collector_with_db.py를 대화형 입력 없이 실행
"""
import os
import sys
import json
from youtube_ads_collector_with_db import YouTubeAdsCollectorDB

def main():
    # 환경변수에서 설정 읽기
    max_ads = int(os.environ.get('MAX_ADS_PER_QUERY', '20'))
    auto_mode = os.environ.get('AUTO_MODE', 'false').lower() == 'true'
    
    # API 키
    serp_api_key = os.environ.get('SERPAPI_KEY', '646e6386e54a3e331122aa9460166830bcdbd35c89283b857dcf66901e11db2a')
    apify_token = os.environ.get('APIFY_TOKEN', '')
    
    # 수집기 초기화
    collector = YouTubeAdsCollectorDB(
        apify_token=apify_token,
        serp_api_key=serp_api_key
    )
    
    # 현재 DB 상태
    stats = collector.get_database_stats()
    print(f"📊 현재 DB 상태: 전체 {stats['total_ads']}개, 대기 {stats['pending']}개")
    
    if auto_mode:
        # 자동 모드: 대화형 입력 없이 실행
        print(f"🤖 자동 모드로 실행 중... (검색어당 최대 {max_ads}개)")
        
        # 수집 실행
        results = collector.collect_all_ads(max_ads_per_query=max_ads)
        
        # 결과를 JSON으로 출력 (API에서 파싱 가능)
        result_json = {
            "success": True,
            "total_collected": results['total_collected'],
            "new_ads": results['new_ads'],
            "apify": results['apify'],
            "serpapi": results['serpapi'],
            "skipped_queries": results['skipped_queries'],
            "stats": collector.get_database_stats()
        }
        
        # API가 파싱할 수 있도록 특별한 마커와 함께 출력
        print(f"RESULT_JSON:{json.dumps(result_json)}")
        
    else:
        # 대화형 모드 (기존 동작)
        try:
            input_max_ads = input(f"\n🎯 검색어당 최대 수집 개수 (기본값: 20): ") or "20"
            max_ads = int(input_max_ads)
            
            print(f"\n🚀 광고 수집 시작...")
            results = collector.collect_all_ads(max_ads_per_query=max_ads)
            
            # 결과 출력
            print(f"\n" + "="*60)
            print(f"📊 수집 결과")
            print(f"="*60)
            print(f"✅ 총 수집: {results['total_collected']}개")
            print(f"🆕 신규 광고: {results['new_ads']}개")
            
        except KeyboardInterrupt:
            print("\n⏸️ 사용자에 의해 중단됨")
        except Exception as e:
            print(f"❌ 오류 발생: {e}")
            sys.exit(1)

if __name__ == "__main__":
    main()
