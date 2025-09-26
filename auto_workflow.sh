#!/bin/bash
# auto_workflow.sh - YouTube 광고 수집/분석 통합 자동화 스크립트
# 24시간 연속 실행으로 완전 자동화 구현

# 설정 변수
PROJECT_DIR="/home/ubuntu/projects/ai-ad-analysis-web"
PYTHON_EXEC="$PROJECT_DIR/venv/bin/python"
SERPAPI_KEY="646e6386e54a3e331122aa9460166830bcdbd35c89283b857dcf66901e11db2a"
WEB_SERVICE_URL="http://localhost:3000"

# 로그 파일
LOG_FILE="$PROJECT_DIR/auto_workflow.log"
DB_FILE="$PROJECT_DIR/youtube_ads.db"

# 로깅 함수
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 환경 확인 함수
check_environment() {
    log "환경 확인 중..."
    
    # Python 가상환경 확인
    if [ ! -f "$PYTHON_EXEC" ]; then
        log "ERROR: Python 가상환경이 없습니다: $PYTHON_EXEC"
        exit 1
    fi
    
    # 웹 서비스 확인
    if ! curl -s -f "http://localhost:3000" > /dev/null; then
        log "WARNING: 웹 서비스가 실행되지 않은 것 같습니다"
        # 웹 서비스 시작 시도
        cd "$PROJECT_DIR"
        pm2 restart web || pm2 start ecosystem.config.js
        sleep 10
    fi
    
    log "환경 확인 완료"
}

# 데이터베이스 상태 확인
get_db_stats() {
    sqlite3 "$DB_FILE" "
    SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN analysis_status='pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN analysis_status='completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN analysis_status='failed' THEN 1 ELSE 0 END) as failed
    FROM youtube_ads;" 2>/dev/null
}

# SerpAPI 쿼터 확인 (간단한 테스트 호출)
check_serpapi_quota() {
    response=$(curl -s "https://serpapi.com/search?engine=youtube&search_query=test&api_key=$SERPAPI_KEY&num=1" 2>/dev/null)
    if echo "$response" | grep -q "error"; then
        log "WARNING: SerpAPI 쿼터 문제 또는 API 오류"
        return 1
    fi
    return 0
}

# 광고 수집 실행
run_collection() {
    log "광고 수집 시작..."
    
    # SerpAPI 쿼터 확인
    if ! check_serpapi_quota; then
        log "SerpAPI 쿼터 부족으로 수집 건너뜀"
        return 1
    fi
    
    cd "$PROJECT_DIR"
    
    # Python 수집 스크립트 실행
    PYTHONPATH=./python_scripts SERPAPI_KEY="$SERPAPI_KEY" timeout 600 "$PYTHON_EXEC" << 'EOF'
import sys, os, json
sys.path.append('./python_scripts')

try:
    from youtube_ads_collector_with_db import YouTubeAdsCollectorDB
    
    # 수집기 초기화 - API 한도까지 수집하도록 큰 수치 설정
    collector = YouTubeAdsCollectorDB()
    
    # 더 많은 검색어와 더 많은 광고 수집
    search_queries = [
        "advertisement commercial", "product promotion", "brand commercial",
        "sponsored content", "marketing video", "company ad",
        "product review", "unboxing", "brand partnership", "influencer ad",
        "commercial 2024", "product launch", "brand campaign", "ad campaign",
        "promotional video", "sponsored post", "advertisement korean",
        "상품 광고", "브랜드 홍보", "제품 리뷰", "협찬 영상"
    ]
    
    # 각 쿼리당 최대 50개씩 수집 (API 한도에 따라 자동 조절됨)
    results = collector.collect_all_ads(search_queries, 50)
    
    print(f"COLLECTION_RESULT:{json.dumps(results)}")
    
    if results['new_ads'] > 0:
        print(f"SUCCESS: {results['new_ads']}개 신규 광고 수집됨")
        exit(0)
    else:
        print("INFO: 신규 광고 없음 (중복 제거됨)")
        exit(0)
        
except Exception as e:
    print(f"ERROR: 수집 실패 - {e}")
    exit(1)
EOF
    
    collection_exit_code=$?
    if [ $collection_exit_code -eq 0 ]; then
        log "광고 수집 완료"
        return 0
    else
        log "광고 수집 실패"
        return 1
    fi
}

# 분석 실행
run_analysis() {
    log "분석 프로세스 시작..."
    
    cd "$PROJECT_DIR"
    
    # 대기중인 광고 개수 확인
    pending_count=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM youtube_ads WHERE analysis_status='pending';" 2>/dev/null || echo "0")
    
    if [ "$pending_count" -eq 0 ]; then
        log "분석할 광고가 없습니다"
        return 0
    fi
    
    log "분석 대기중인 광고: ${pending_count}개"
    
    # 배치 단위로 분석 (한 번에 5개씩)
    batch_size=5
    processed=0
    
    while [ $processed -lt $pending_count ] && [ $processed -lt 20 ]; do # 한 번에 최대 20개까지
        log "배치 분석 진행 중... ($((processed + 1)) ~ $((processed + batch_size)))"
        
        # Python으로 분석 요청
        timeout 900 "$PYTHON_EXEC" << EOF
import sys, sqlite3, requests, json
sys.path.append('./python_scripts')

try:
    # DB에서 대기중인 광고 가져오기
    conn = sqlite3.connect('./youtube_ads.db')
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, title, url, note 
        FROM youtube_ads 
        WHERE analysis_status='pending' 
        LIMIT $batch_size OFFSET $processed
    """)
    ads = cursor.fetchall()
    conn.close()
    
    if not ads:
        print("더 이상 분석할 광고가 없습니다")
        exit(0)
    
    # 분석 요청 데이터 구성
    videos = []
    for ad in ads:
        videos.append({
            "title": ad[1],
            "url": ad[2], 
            "notes": ad[3] or "자동 분석"
        })
    
    print(f"분석 요청: {len(videos)}개 영상")
    
    # 웹 API로 분석 요청
    response = requests.post('$WEB_SERVICE_URL/api/analyze',
                           json={"videos": videos},
                           timeout=600,
                           headers={"Content-Type": "application/json"})
    
    if response.status_code == 200:
        result = response.json()
        success_count = len([r for r in result.get('results', []) if r.get('status') == 'fulfilled'])
        print(f"분석 성공: {success_count}개")
        exit(0)
    else:
        print(f"분석 요청 실패: HTTP {response.status_code}")
        exit(1)
        
except Exception as e:
    print(f"분석 오류: {e}")
    exit(1)
EOF
        
        analysis_exit_code=$?
        if [ $analysis_exit_code -eq 0 ]; then
            log "배치 분석 성공"
            processed=$((processed + batch_size))
        else
            log "배치 분석 실패"
            break
        fi
        
        # API 제한 방지를 위한 대기
        sleep 30
    done
    
    log "분석 프로세스 완료: ${processed}개 처리됨"
}

# 시스템 상태 확인
system_health_check() {
    # 메모리 사용량 확인
    memory_usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
    if [ "$memory_usage" -gt 80 ]; then
        log "WARNING: 메모리 사용량 높음 (${memory_usage}%)"
    fi
    
    # 디스크 사용량 확인
    disk_usage=$(df -h / | awk 'NR==2{print $5}' | sed 's/%//')
    if [ "$disk_usage" -gt 85 ]; then
        log "WARNING: 디스크 사용량 높음 (${disk_usage}%)"
    fi
    
    # PM2 프로세스 확인
    if ! pm2 list | grep -q "online"; then
        log "WARNING: PM2 프로세스 문제 감지"
        pm2 restart all
    fi
}

# 메인 루프
main_loop() {
    log "=== 통합 자동화 시스템 시작 ==="
    log "프로젝트 경로: $PROJECT_DIR"
    log "Python 경로: $PYTHON_EXEC"
    
    cycle_count=0
    
    while true; do
        cycle_count=$((cycle_count + 1))
        log "=== 사이클 #${cycle_count} 시작 ==="
        
        # 환경 확인
        check_environment
        
        # 시작 전 DB 상태 확인
        stats_before=$(get_db_stats)
        log "시작 전 DB 상태: $stats_before"
        
        # 1단계: 광고 수집 (30분마다)
        if [ $((cycle_count % 1)) -eq 1 ]; then # 매 사이클마다 수집 시도
            if run_collection; then
                log "수집 성공"
                sleep 10 # 수집 후 잠시 대기
            else
                log "수집 실패 또는 건너뜀"
            fi
        fi
        
        # 2단계: 분석 실행 (수집 후 또는 15분마다)
        if run_analysis; then
            log "분석 프로세스 완료"
        else
            log "분석 프로세스 문제"
        fi
        
        # 최종 DB 상태 확인
        stats_after=$(get_db_stats)
        log "완료 후 DB 상태: $stats_after"
        
        # 3단계: 시스템 상태 확인
        system_health_check
        
        log "=== 사이클 #${cycle_count} 완료 ==="
        log "다음 사이클까지 30분 대기..."
        
        # 30분 대기 (1800초)
        # 중간에 Ctrl+C로 중단 가능하도록 작은 단위로 나누어 대기
        for i in {1..180}; do
            sleep 10
            # 프로세스 종료 신호 확인
            if [ -f "/tmp/stop_auto_workflow" ]; then
                log "중단 신호 감지됨"
                rm -f "/tmp/stop_auto_workflow"
                exit 0
            fi
        done
    done
}

# 신호 처리 (Ctrl+C 등)
trap 'log "자동화 시스템 중단됨"; exit 0' SIGINT SIGTERM

# 스크립트 시작시 인자 처리
case "${1:-}" in
    "start")
        log "데몬 모드로 자동화 시작"
        main_loop
        ;;
    "stop")
        log "자동화 중단 신호 전송"
        touch "/tmp/stop_auto_workflow"
        exit 0
        ;;
    "status")
        if [ -f "$LOG_FILE" ]; then
            echo "최근 로그 (마지막 10줄):"
            tail -10 "$LOG_FILE"
            echo ""
            echo "DB 상태:"
            get_db_stats
        else
            echo "자동화 시스템이 실행되지 않았거나 로그가 없습니다"
        fi
        ;;
    "test")
        log "테스트 모드 실행"
        check_environment
        get_db_stats
        log "테스트 완료"
        ;;
    *)
        echo "사용법: $0 {start|stop|status|test}"
        echo ""
        echo "명령어:"
        echo "  start  - 24시간 자동화 시작"
        echo "  stop   - 자동화 중단"
        echo "  status - 현재 상태 확인"
        echo "  test   - 환경 테스트"
        exit 1
        ;;
esac
