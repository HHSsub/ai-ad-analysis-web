# YouTube 영상 분석기

AI 기반 YouTube 영상 분석 도구로, 156가지 특징을 자동으로 추출하여 정량적/정성적 지표를 산출합니다.

## 주요 기능

- 📊 **156가지 특징 분석**: 인물, 의상, 배경, 제품, 연출, 사운드, 텍스트, 스토리 등 포괄적 분석
- 🤖 **AI 기반 분석**: YouTube Data API + Gemini AI를 활용한 자동 분석
- 📈 **정량/정성 지표**: 하이브리드 점수 시스템으로 영상 성과 예측
- 📝 **일괄 입력**: 최대 30개 영상을 한번에 분석 (Excel 복사/붙여넣기 지원)
- ✏️ **결과 편집**: 분석 결과를 수동으로 수정 가능
- 💾 **Excel 다운로드**: 분석 결과를 Excel 파일로 내보내기

## 시작하기

### 1. 환경 설정

```bash
# 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env.local
```

`.env.local` 파일에 API 키를 설정하세요:

```
YOUTUBE_API_KEY=AIzaSyB62d5eWaQDtQf4apwN4YLxLBl_ApO6R-0
GEMINI_API_KEY=your_gemini_api_key_here
```

### 2. 로컬 개발

```bash
# 개발 서버 시작
npm run dev

# 브라우저에서 http://localhost:3000 접속
```

### 3. Vercel 배포

#### 방법 1: Vercel CLI 사용

```bash
# Vercel CLI 설치
npm i -g vercel

# 프로젝트 배포
vercel

# 환경변수 설정
vercel env add YOUTUBE_API_KEY
vercel env add GEMINI_API_KEY

# 재배포
vercel --prod
```

#### 방법 2: GitHub 연동

1. GitHub 저장소에 코드 푸시
2. [Vercel 대시보드](https://vercel.com/dashboard)에서 프로젝트 import
3. 환경변수 설정:
   - `YOUTUBE_API_KEY`: `AIzaSyB62d5eWaQDtQf4apwN4YLxLBl_ApO6R-0`
   - `GEMINI_API_KEY`: `AIzaSyB62d5eWaQDtQf4apwN4YLxLBl_ApO6R-0`

## 사용 방법

### 1. 영상 링크 입력
- 홈페이지에서 "링크 수동 추가" 클릭
- 테이블에 제목, YouTube URL, 비고 입력
- Excel/Google Sheets에서 복사한 데이터 붙여넣기 가능

### 2. 분석 실행
- "분석 시작" 버튼 클릭
- 진행상황을 실시간으로 확인
- YouTube 메타데이터 수집 → AI 영상 분석 → 완료

### 3. 결과 확인 및 편집
- 분석 완료 후 "결과 보기"로 이동
- 왼쪽에서 영상 선택, 오른쪽에서 상세 결과 확인
- "편집" 버튼으로 분석 결과 수정 가능

### 4. 데이터 다운로드
- Excel 파일로 결과 다운로드
- 156가지 특징 데이터 + 점수 포함

## 분석 항목 (156가지)

### 인물 분석 (29항목)
- 성별, 연령, 인종, 피부톤, 얼굴형
- 머리길이/색상, 수염, 표정, 시선방향
- 손위치/제스처, 다리자세, 상체각도
- 체형, 키, 안경/모자/이어폰 착용
- 인물수, 상호작용, 등장패턴 등

### 의상 분석 (11항목)
- 상의/하의/신발 종류, 색상, 재질
- 액세서리, 계절감, 트렌디함
- 브랜드 패션, 유니폼 여부 등

### 배경 분석 (19항목)
- 실내/실외, 장소유형, 배경크기
- 색상, 재질, 조명, 식물/창문
- 국가/문화코드, 언어, 계절/시간
- 배경흐림, 오브젝트 정돈도 등

### 제품 분석 (17항목)
- 제품 존재/카테고리, 위치/색상
- 사용시연, 브랜드노출, 인터랙션
- 포커스, 애니메이션, 다양성 등

### 연출/편집 분석 (23항목)
- 앵글, 무빙방식, 카메라흔들림
- 컷전환, 시점구성, 색보정/필터
- 조명, 이펙트, 편집스타일 등

### 사운드 분석 (12항목)
- BGM, 효과음, 발화, 감정톤
- 사운드싱크, 공간감, ASMR 등

### 텍스트/자막 분석 (11항목)
- 자막, 로고, 슬로건, 키워드/가격
- CTA, 텍스트효과, 키네틱타이포 등

### 스토리 구조 분석 (20항목)
- 인트로/클라이맥스/결말, 무드변화
- 컷수/길이, 전환속도, 일관성
- 메타포, 공감요소, 시선유도 등

### 유튜브 성과 분석 (11항목)
- 댓글감정분석, 키워드분석
- 브랜드인식, 악플/유머요소
- 썸네일효과, 트렌드속성 등

### 종합 분석 (4항목)
- 산업분류, 핵심타겟, 영상목적, 길이

## 점수 산출 방식

### 정량 지표 (40% 가중치)
- **관심도 지수**: (좋아요비율×0.5) + (댓글비율×0.3) + (조회수비율×0.2)
- **유지력 지수**: (좋아요+댓글비율) × 길이보정계수
- **성장 지수**: 일평균조회수 / 경과일수^0.5

### 정성 지표 (60% 가중치)
- **오프닝 훅** (18%): 첫 3초 임팩트
- **브랜드 전달** (16%): 브랜드 노출 효과성
- **스토리 구조** (16%): 기승전결 완성도
- **시각적 완성도** (16%): 미학적 품질
- **음향 설득력** (12%): BGM/음성 품질
- **차별성/독창성** (12%): 업종대비 독창성
- **메시지-타겟 적합도** (6%): 타겟 매칭도
- **CTA 효율성** (4%): 행동유도 효과

### 하이브리드 점수
최종 점수 = 정량지표(40%) + 정성지표(60%)

## 기술 스택

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Vercel Functions
- **AI/API**: Google YouTube Data API v3, Google Gemini AI
- **상태관리**: Zustand
- **UI**: Lucide React, React Hot Toast
- **배포**: Vercel

## 프로젝트 구조

```
src/
├── app/
│   ├── api/
│   │   └── analyze/
│   │       ├── route.ts          # 분석 시작 API
│   │       └── progress/
│   │           └── route.ts      # 진행상황 조회 API
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                  # 메인 페이지
├── components/
│   ├── VideoInputTable.tsx       # 영상 입력 테이블
│   ├── AnalysisProgress.tsx      # 분석 진행률 표시
│   ├── VideoList.tsx            # 분석된 영상 목록
│   └── VideoAnalysisDetail.tsx   # 상세 분석 결과
├── services/
│   ├── youtubeService.ts        # YouTube API 서비스
│   ├── geminiService.ts         # Gemini AI 서비스
│   └── metricsService.ts        # 점수 계산 서비스
├── store/
│   └── videoStore.ts            # Zustand 상태 관리
└── types/
    └── video.ts                 # TypeScript 타입 정의
```

## 개발 참고사항

### API 제한사항
- **YouTube Data API**: 일일 할당량 10,000 units
- **Gemini API**: 분당 60회 요청 제한

### 성능 최적화
- 영상 분석은 백그라운드에서 순차 처리
- 진행상황은 폴링으로 실시간 업데이트
- 분석 결과는 메모리에 임시 저장 (프로덕션에서는 DB 권장)

### 확장 가능성
- Redis/PostgreSQL 연동으로 영구 저장
- 웹소켓으로 실시간 진행상황 전송
- 배치 분석 큐 시스템 도입
- 사용자 인증 및 프로젝트 관리

## 라이센스

MIT License

## 기여하기

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 지원

문의사항이나 버그 리포트는 GitHub Issues를 이용해주세요.