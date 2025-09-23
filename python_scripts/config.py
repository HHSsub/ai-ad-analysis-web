#!/usr/bin/env python3
"""
설정 관리 파일
"""

import os
from typing import Optional, List

class Config:
    """설정 관리 클래스"""
    
    # API 키 설정
    APIFY_TOKEN: Optional[str] = os.getenv('APIFY_TOKEN')
    SERPAPI_KEY: Optional[str] = os.getenv('SERPAPI_KEY')
    
    # 수집 설정
    MAX_ADS_PER_RUN: int = 50
    REQUEST_DELAY: float = 1.0  # API 요청 간 대기 시간 (초)
    REQUEST_TIMEOUT: int = 60   # 요청 타임아웃 (초)
    
    # 출력 설정
    OUTPUT_DIR: str = "output"
    CSV_FILENAME: str = "youtube_ads_collection.csv"
    JSON_FILENAME: str = "youtube_ads_collection.json"
    
    # SerpAPI 검색 키워드
    DEFAULT_SEARCH_QUERIES: List[str] = [
        "advertisement commercial",
        "product promotion",
        "brand commercial", 
        "sponsored content",
        "marketing video",
        "company ad"
    ]
    
    # 광고성 콘텐츠 식별 키워드
    AD_KEYWORDS: List[str] = [
        'ad', 'advertisement', 'commercial', 'sponsored', 
        'promo', 'promotion', 'marketing', 'brand'
    ]
    
    @classmethod
    def validate(cls) -> bool:
        """설정 유효성 검사"""
        if not cls.APIFY_TOKEN and not cls.SERPAPI_KEY:
            return False
        return True
    
    @classmethod
    def get_active_apis(cls) -> List[str]:
        """활성화된 API 목록 반환"""
        active = []
        if cls.APIFY_TOKEN:
            active.append("Apify")
        if cls.SERPAPI_KEY:
            active.append("SerpAPI")
        return active