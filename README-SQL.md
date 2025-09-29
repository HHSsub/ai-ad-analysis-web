# 🎬 AI 기반 YouTube 광고 분석 시스템 (SQL 통합 버전)

> **156개 특성 완전 구현** | **SQLite 기반** | **Google Drive 자동 동기화**

---

## 📌 프로젝트 개요

YouTube 광고 영상을 **자동으로 수집**하고, **AI로 156가지 특성을 분석**하여, **SQLite DB에 저장**하고, **Google Drive에 자동 업로드**하는 완전 자동화 시스템입니다.

### 핵심 기능
1. **자동 광고 수집**: SerpAPI를 통한 YouTube 광고 자동 검색
2. **AI 분석**: Gemini 1.5 Pro로 156개 특성 완전 분석
3. **SQL 저장**: 실시간 SQLite DB 저장 (엑셀 의존성 제거)
4. **Drive 동기화**: Google Drive API로 자동 업로드
5. **자동 스케줄링**: 6시간마다 전체 프로세스 자동 실행

---

## 🏗️ 시스템 아키텍처

```
┌──────────────────────────────────────────────────────────┐
│                    EC2 서버 (AWS)                         │
│                                                            │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Python 수집 엔진                                 │    │
│  │  - SerpAPI로 광고 검색                           │    │
│  │  - youtube_ads.db 저장                           │    │
│  └─────────────────────────────────────────────────┘    │
│                         ↓                                 │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Next.js 웹서비스 (포트 3000)                    │    │
│  │  - YouTube API로 메타데이터 수집                 │    │
│  │  - Gemini AI로 156개 특성 분석                   │    │
│  │  - youtube_ads_analysis.db 저장                  │    │
│  └─────────────────────────────────────────────────┘    │
│                         ↓                                 │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Google Drive Uploader                           │    │
│  │  - CSV 내보내기 (156 컬럼)                       │    │
│  │  - Drive API로 업로드                            │    │
│  └─────────────────────────────────────────────────┘    │
│                                                            │
│  ┌─────────────────────────────────────────────────┐    │
│  │  자동 스케줄러 (PM2)                             │    │
│  │  - 6시간마다 전체 파이프라인 실행                │    │
│  └─────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│             Google Drive (공유 폴더)                      │
│  - youtube_analysis_2025-01-15.csv                       │
│  - 156개 컬럼 전체 포함                                   │
│  - 실시간 접근 가능                                       │
└──────────────────────────────────────────────────────────┘
```

---

## 🎯 156개 특성 카테고리

| 카테고리 | 특성 수 | 내용 |
|---------|--------|------|
| **인물 분석** | 20개 | 성별, 연령, 인종, 피부톤, 얼굴형, 헤어스타일, 의상, 포즈 등 |
| **감정 분석** | 15개 | 주요 감정, 감정 강도, 표정, 목소리 톤, 분위기, 진정성 등 |
| **시각적 요소** | 25개 | 조명, 색상, 배경, 구도, 필터, 애니메이션, 화질 등 |
| **오디오 분석** | 20개 | BGM, 템포, 보이스오버, 대화, 효과음, 음질 등 |
| **브랜드 요소** | 15개 | 브랜드명, 로고, 제품 노출, 슬로건, 가격, CTA 등 |
| **촬영 기법** | 15개 | 앵글, 샷 크기, 카메라 무브먼트, 줌, 드론 등 |
| **편집 기법** | 15개 | 템포, 컷, 트랜지션, 몽타주, 리듬감 등 |
| **텍스트/자막** | 10개 | 자막 언어, 스타일, 위치, 애니메이션, 가독성 등 |
| **콘텐츠 구조** | 10개 | 인트로, 오프닝 훅, 구조, CTA, 페이싱 등 |
| **종합 메타데이터** | 11개 | 영상 길이, 조회수, 좋아요, 댓글, 타겟, 효과성 등 |

**총 156개 특성 모두 누락 없이 완전 구현**

---

## 🗄️ 데이터베이스 구조

### 1. 수집 DB: `youtube_ads.db`
```sql
-- 광고 영상 정보
CREATE TABLE youtube_ads (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT UNIQUE NOT NULL,
  note TEXT,
  search_query TEXT,
  api_source TEXT,
  collected_at TIMESTAMP,
  analyzed_at TIMESTAMP,
  analysis_status TEXT
);
```

### 2. 분석 DB: `youtube_ads_analysis.db`
```sql
-- 영상 분석 메인 테이블
CREATE TABLE video_analysis (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT UNIQUE NOT NULL,
  status TEXT,
  analyzed_at TIMESTAMP,
  hybrid_score REAL,
  ...
);

-- 156개 특성 데이터 (EAV 모델)
CREATE TABLE video_features (
  id INTEGER PRIMARY KEY,
  video_id TEXT NOT NULL,
  feature_no INTEGER NOT NULL,
  feature_category TEXT NOT NULL,
  feature_item TEXT NOT NULL,
  feature_value TEXT,
  UNIQUE(video_id, feature_no)
);
```

---

## 🚀 빠른 시작

### 1. 설치
```bash
git clone https://github.com/your-repo/ai-ad-analysis-web.git
cd ai-ad-analysis-web
npm install
pip3 install -r requirements.txt
```

### 2. 환경 설정
`.env.local` 파일 생성:
```env
YOUTUBE_API_KEY=your_key
GEMINI_API_KEY=your_key1,your_key2
SERPAPI_KEY=your_key
GOOGLE_SERVICE_ACCOUNT_CREDENTIALS={"type":"service_account",...}
GOOGLE_DRIVE_FOLDER_ID=your_folder_id
```

### 3. 실행
```bash
# 개발 모드
npm run dev

# 프로덕션 빌드
npm run build
npm start

# PM2로 실행 (권장)
pm2 start ecosystem.config.js
```

### 4. 수동 실행
```bash
# 전체 워크플로우 한 번 실행
npm run scheduler:once

# 자동 스케줄러 시작 (6시간마다)
npm run scheduler:start
```

---

## 📊 사용 예시

### 웹 인터페이스로 수동 분석
1. `http://localhost:3000` 접속
2. YouTube URL 입력 (최대 10개)
3. "분석 시작" 클릭
4. 결과는 자동으로 DB 저장 + Drive 업로드

### API로 분석
```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "videos": [
      {"title":"광고1", "url":"https://youtube.com/watch?v=xxx", "note":"테스트"}
    ]
  }'
```

### DB 직접 조회
```bash
# 완료된 분석 개수
sqlite3 youtube_ads_analysis.db "SELECT COUNT(*) FROM video_analysis WHERE status='completed';"

# 특정 영상의 156개 특성
sqlite3 youtube_ads_analysis.db "SELECT * FROM video_features WHERE video_id='VIDEO_ID';"
```

### Drive 수동 업로드
```bash
curl -X POST http://localhost:3000/api/drive/upload-sql \
  -H "Content-Type: application/json" \
  -d '{"format":"csv"}'
```

---

## 📂 프로젝트 구조

```
ai-ad-analysis-web/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── analyze/route.ts          # 분석 API (SQL 저장)
│   │   │   ├── drive/upload-sql/route.ts # Drive 업로드
│   │   │   └── db-stats/route.ts         # DB 통계
│   │   └── page.tsx                      # 메인 페이지
│   ├── lib/
│   │   ├── sql-database.ts               # SQLite 관리 (핵심!)
│   │   └── google-drive.ts               # Drive API
│   ├── types/
│   │   └── video.ts                      # 156개 특성 정의
│   └── services/
│       ├── metricsService.ts             # 점수 계산
│       └── excelService.ts               # 엑셀 백업 (선택)
├── scripts/
│   └── full-auto-scheduler-sql.js        # 자동 스케줄러
├── python_scripts/
│   ├── youtube_ads_collector_with_db.py  # 광고 수집
│   └── database_setup.py                 # DB 스키마
├── public/
│   └── youtube_ad_features.csv           # 156개 특성 정의
├── ecosystem.config.js                   # PM2 설정
├── package.json
└── README-SQL.md                         # 이 파일
```

---

## 🔧 주요 기술 스택

| 분류 | 기술 |
|-----|------|
| **프론트엔드** | Next.js 14, React 18, TypeScript, Tailwind CSS |
| **백엔드** | Next.js API Routes, Node.js |
| **데이터베이스** | SQLite (better-sqlite3) |
| **AI/ML** | Google Gemini 1.5 Pro |
| **외부 API** | YouTube Data API v3, SerpAPI, Google Drive API |
| **스케줄링** | PM2, node-cron |
| **Python** | requests, sqlite3 |

---

## 🎨 주요 기능 상세

### 1. 완전 자동 수집
- **SerpAPI**로 "advertisement", "product promotion" 등 키워드 검색
- 중복 URL 자동 제거
- 24시간 이내 재수집 방지

### 2. AI 기반 분석
- **YouTube API**: 조회수, 좋아요, 댓글, 영상 길이 등
- **자막 추출**: 한국어/영어 자동 감지
- **Gemini AI**: 156개 특성 심층 분석
- **Fallback**: API 실패 시 메타데이터 기반 추론

### 3. 하이브리드 점수
- **정량 지표** (40%): 조회수, 좋아요, 유지율
- **정성 지표** (60%): 오프닝 훅, 브랜딩, 스토리, 비주얼
- 0-100점 스케일

### 4. Google Drive 통합
- **서비스 계정** 방식으로 인증
- CSV 파일 자동 생성/업데이트
- 156개 컬럼 모두 포함
- 실시간 공유 가능

---

## 🔒 보안 및 인증

### Google Drive 서비스 계정 설정
1. GCP 콘솔에서 서비스 계정 생성
2. Drive API 활성화
3. JSON 키 파일 다운로드
4. 환경 변수에 JSON 전체 입력
5. Drive 폴더에 서비스 계정 이메일 추가 (편집 권한)

### API 키 관리
- `.env.local` 파일은 `.gitignore`에 포함
- EC2에서는 환경 변수로 관리
- Gemini 키는 여러 개 설정 가능 (Rate Limit 우회)

---

## 📈 성능 최적화

- **SQLite 인덱스**: 빠른 쿼리 (status, created_at, feature_no)
- **배치 처리**: 5개씩 묶어서 분석 (API Rate Limit 방지)
- **트랜잭션**: 156개 특성 한 번에 저장
- **메모리 효율**: 스트리밍 방식 CSV 생성

---

## 🐛 트러블슈팅

### DB 락 에러
```bash
# 다른 프로세스 확인
lsof youtube_ads_analysis.db
# 프로세스 종료 후 재시작
```

### Gemini API Rate Limit
```env
# 여러 키 설정 (자동 Fallback)
GEMINI_API_KEY=key1,key2,key3,key4
```

### Drive 업로드 실패
```bash
# 서비스 계정 검증
node scripts/verify-service-account.mjs

# 폴더 권한 확인
# Drive 폴더에서 서비스 계정 이메일 편집 권한 부여
```

---

## 📝 라이센스

Hwang Hoe Sun

---

## 👥 기여

이슈 및 PR 환영합니다!

---

## 📞 문의

- Email: hhoesun@gmail.com

---

**완전 자동화된 YouTube 광고 분석 시스템** 
