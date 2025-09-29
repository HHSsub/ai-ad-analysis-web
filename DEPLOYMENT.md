# SQL 기반 YouTube 광고 분석 시스템 - 배포 가이드

## 🎯 시스템 개요

이 시스템은 **SQLite 데이터베이스**를 중심으로 YouTube 광고를 수집, 분석하고 Google Drive에 자동 업로드하는 완전 자동화 시스템입니다.

### 핵심 특징
- ✅ **156개 전체 특성** 완전 구현 (누락 없음)
- ✅ **SQLite DB 기반** 실시간 데이터 관리
- ✅ **Google Drive 자동 동기화**
- ✅ **자동 스케줄러** (6시간마다 실행)
- ✅ **엑셀 백업 유지** (기존 기능 보존)

---

## 📦 1. 의존성 설치

```bash
cd /home/ubuntu/projects/ai-ad-analysis-web

# Node.js 의존성
npm install better-sqlite3 axios node-cron

# Python 의존성
pip3 install requests sqlite3
```

---

## 🗄️ 2. 데이터베이스 구조

### 수집 DB: `youtube_ads.db`
- Python 스크립트가 광고 URL 수집 시 사용
- 테이블: `youtube_ads`, `search_history`, `analysis_queue`

### 분석 DB: `youtube_ads_analysis.db`
- Next.js 웹서비스가 분석 결과 저장 시 사용
- 테이블: `video_analysis` (메인), `video_features` (156개 특성), `analysis_queue`

두 DB는 **독립적**이며, 스케줄러가 연동합니다.

---

## ⚙️ 3. 환경 변수 설정

`.env.local` 파일 확인:

```bash
# YouTube API
YOUTUBE_API_KEY=your_youtube_api_key

# Gemini AI (여러 키 지원, 쉼표로 구분)
GEMINI_API_KEY=key1,key2,key3

# SerpAPI (광고 수집용)
SERPAPI_KEY=646e6386e54a3e331122aa9460166830bcdbd35c89283b857dcf66901e11db2a

# Google Drive (서비스 계정)
GOOGLE_SERVICE_ACCOUNT_CREDENTIALS={"type":"service_account","project_id":"...","private_key":"..."}
GOOGLE_DRIVE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_DRIVE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_FOLDER_ID=your_drive_folder_id

# 웹서비스 URL
WEB_SERVICE_URL=http://localhost:3000
```

---

## 🚀 4. 빌드 및 실행

```bash
# 빌드
npm run build

# PM2로 실행
pm2 start ecosystem.config.js

# 로그 확인
pm2 logs

# 상태 확인
pm2 status
```

### PM2 프로세스
1. **web-service**: Next.js 웹 서버 (포트 3000)
2. **auto-scheduler-sql**: 자동화 스케줄러 (6시간마다)

---

## 📋 5. 수동 실행 방법

### 전체 워크플로우 (한 번 실행)
```bash
npm run scheduler:once
```

### 개별 단계 실행
```bash
# 광고 수집만
npm run scheduler:collect

# 분석만
npm run scheduler:analyze

# Drive 업로드만
npm run scheduler:upload

# 상태 확인만
npm run scheduler:status
```

### 스케줄러 모드 (계속 실행)
```bash
npm run scheduler:start
```

---

## 🔍 6. 데이터 확인 방법

### SQLite DB 직접 조회
```bash
# 수집 DB
sqlite3 youtube_ads.db "SELECT COUNT(*), analysis_status FROM youtube_ads GROUP BY analysis_status;"

# 분석 DB
sqlite3 youtube_ads_analysis.db "SELECT COUNT(*), status FROM video_analysis GROUP BY status;"

# 156개 특성 데이터 확인
sqlite3 youtube_ads_analysis.db "SELECT COUNT(*) FROM video_features;"
```

### 웹 인터페이스
```
http://your-server-ip:3000
```
- 메인 페이지 상단에 DB 통계 실시간 표시
- 수동 분석 기능 지원

---

## 📤 7. Google Drive 연동 확인

### 테스트 엔드포인트
```bash
curl http://localhost:3000/api/drive/test
```

### 수동 업로드
```bash
curl -X POST http://localhost:3000/api/drive/upload-sql \
  -H "Content-Type: application/json" \
  -d '{"format":"csv"}'
```

### Drive에서 확인
- 파일명: `youtube_analysis_YYYY-MM-DD.csv`
- 156개 컬럼 모두 포함 확인

---

## 🔄 8. 자동화 흐름

```
┌─────────────────────────────────────────────┐
│  자동 스케줄러 (6시간마다)                    │
└─────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────┐
│  STEP 1: Python 광고 수집                    │
│  - SerpAPI로 YouTube 광고 검색               │
│  - youtube_ads.db에 저장                     │
│  - 중복 제거 자동 처리                       │
└─────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────┐
│  STEP 2: 웹서비스 API 호출 (분석)            │
│  - /api/analyze 엔드포인트                   │
│  - YouTube API + Gemini AI                  │
│  - 156개 특성 완전 추출                      │
│  - youtube_ads_analysis.db에 저장            │
└─────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────┐
│  STEP 3: Google Drive 업로드                 │
│  - CSV 형태로 내보내기                       │
│  - Drive API로 업로드/업데이트               │
└─────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────┐
│  STEP 4: 상태 확인 및 로깅                   │
│  - DB 통계 출력                              │
│  - 시스템 리소스 확인                        │
└─────────────────────────────────────────────┘
```

---

## 🛠️ 9. 트러블슈팅

### DB 파일이 없는 경우
```bash
# 자동으로 생성되지만, 수동 생성도 가능
sqlite3 youtube_ads.db < python_scripts/schema.sql
```

### PM2 프로세스 재시작
```bash
pm2 restart auto-scheduler-sql
pm2 restart web-service
```

### 로그 확인
```bash
# PM2 로그
pm2 logs auto-scheduler-sql --lines 100

# 스케줄러 전용 로그
tail -f logs/auto-scheduler-sql.log
```

### DB 초기화 (주의!)
```bash
rm youtube_ads.db youtube_ads_analysis.db
# 다음 실행 시 자동 재생성
```

---

## 📊 10. 데이터 구조

### video_features 테이블 (156개 특성)
```sql
SELECT 
  video_id,
  feature_no,
  feature_category,
  feature_item,
  feature_value
FROM video_features
WHERE video_id = 'VIDEO_ID'
ORDER BY feature_no;
```

### CSV 내보내기 형태
```
ID, 제목, URL, 상태, 분석일시, 1.인물분석_성별추정, 2.인물분석_연령추정, ..., 156.종합메타데이터_전반적효과성
```

---

## ✅ 11. 검증 체크리스트

- [ ] `youtube_ads.db` 파일 생성 확인
- [ ] `youtube_ads_analysis.db` 파일 생성 확인
- [ ] PM2 프로세스 2개 실행 중 (`web-service`, `auto-scheduler-sql`)
- [ ] Google Drive 폴더에 CSV 파일 생성 확인
- [ ] CSV 파일에 156개 컬럼 모두 존재 확인
- [ ] 웹 페이지에서 DB 통계 정상 표시
- [ ] 로그 파일에 에러 없음

---

## 🎓 12. 추가 참고사항

### 기존 엑셀 기능
- 백업 목적으로 **유지**됨
- `src/services/excelService.ts` 그대로 존재
- SQL 기반 시스템과 병행 가능

### 성능 최적화
- SQLite는 **임베디드 DB**로 별도 서버 불필요
- 인덱스 자동 생성으로 빠른 쿼리
- 동시 쓰기 제한 있으나, 이 시스템에는 충분

### 확장 가능성
- PostgreSQL/MySQL로 마이그레이션 가능
- 현재 스키마 그대로 이식 가능
- ORM (Prisma 등) 도입 가능

---

**모든 설정이 완료되면 시스템이 자동으로 동작합니다!** 🎉
