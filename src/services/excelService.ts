import * as XLSX from 'xlsx';
import { AnalyzedVideo, VIDEO_FEATURES } from '@/types/video';
import { calculateHybridScore } from './metricsService';

export function exportToExcel(videos: AnalyzedVideo[]): void {
  // 워크북 생성
  const workbook = XLSX.utils.book_new();
  
  // 메인 데이터 시트 생성
  const mainData = createMainDataSheet(videos);
  XLSX.utils.book_append_sheet(workbook, mainData, '분석결과');
  
  // 점수 요약 시트 생성
  const scoreData = createScoreDataSheet(videos);
  XLSX.utils.book_append_sheet(workbook, scoreData, '점수요약');
  
  // 메타데이터 시트 생성
  const metaData = createMetaDataSheet(videos);
  XLSX.utils.book_append_sheet(workbook, metaData, '메타데이터');
  
  // 파일 다운로드
  const fileName = `YouTube_분석결과_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}

function createMainDataSheet(videos: AnalyzedVideo[]) {
  const headers = [
    '영상제목',
    '영상링크', 
    '비고',
    '분석상태',
    '생성시점',
    ...VIDEO_FEATURES.map(f => `${f.no}.${f.category}_${f.item}`)
  ];
  
  const rows = videos.map(video => {
    const row = [
      video.title,
      video.url,
      video.note || '',
      video.status === 'completed' ? '완료' : 
      video.status === 'failed' ? '실패' : 
      video.status === 'incomplete' ? '불완전' : '분석중',
      new Date(video.createdAt).toLocaleString('ko-KR')
    ];
    
    // 156개 feature 값 추가
    VIDEO_FEATURES.forEach(feature => {
      const key = `feature_${feature.no}`;
      row.push(video.features[key] || 'N/A');
    });
    
    return row;
  });
  
  return XLSX.utils.aoa_to_sheet([headers, ...rows]);
}

function createScoreDataSheet(videos: AnalyzedVideo[]) {
  const headers = [
    '영상제목',
    '분석상태',
    '하이브리드점수',
    '정량지표_관심도',
    '정량지표_유지력', 
    '정량지표_성장력',
    '정량지표_종합',
    '정성지표_오프닝훅',
    '정성지표_브랜드전달',
    '정성지표_스토리구조',
    '정성지표_시각완성도',
    '정성지표_음향설득력',
    '정성지표_차별성독창성',
    '정성지표_메시지타겟적합도',
    '정성지표_CTA효율성',
    '정성지표_종합'
  ];
  
  const rows = videos.map(video => {
    if (video.status !== 'completed') {
      return [
        video.title,
        video.status === 'failed' ? '실패' : 
        video.status === 'incomplete' ? '불완전' : '분석중',
        'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A'
      ];
    }
    
    const scores = calculateHybridScore(video);
    
    return [
      video.title,
      '완료',
      scores.final.toFixed(1),
      scores.quantitative.interestIndex.toFixed(1),
      scores.quantitative.retentionIndex.toFixed(1),
      scores.quantitative.growthIndex.toFixed(1),
      scores.quantitative.finalScore.toFixed(1),
      scores.qualitative.openingHookIndex.toFixed(1),
      scores.qualitative.brandDeliveryIndex.toFixed(1),
      scores.qualitative.storyStructureIndex.toFixed(1),
      scores.qualitative.visualAestheticsIndex.toFixed(1),
      scores.qualitative.audioPersuasionIndex.toFixed(1),
      scores.qualitative.uniquenessIndex.toFixed(1),
      scores.qualitative.messageTargetFitIndex.toFixed(1),
      scores.qualitative.ctaEfficiencyIndex.toFixed(1),
      scores.qualitative.qualityScore.toFixed(1)
    ];
  });
  
  return XLSX.utils.aoa_to_sheet([headers, ...rows]);
}

function createMetaDataSheet(videos: AnalyzedVideo[]) {
  const headers = [
    '영상제목',
    '채널명',
    '게시일',
    '카테고리ID', 
    '조회수',
    '좋아요수',
    '댓글수',
    '영상길이',
    '설명',
    '태그'
  ];
  
  const rows = videos.map(video => {
    const youtube = video.youtubeData;
    if (!youtube) {
      return [
        video.title,
        'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A'
      ];
    }
    
    return [
      video.title,
      youtube.channelTitle,
      new Date(youtube.publishedAt).toLocaleString('ko-KR'),
      youtube.categoryId,
      youtube.viewCount,
      youtube.likeCount, 
      youtube.commentCount,
      youtube.duration,
      youtube.description.substring(0, 500) + (youtube.description.length > 500 ? '...' : ''),
      youtube.tags.join(', ')
    ];
  });
  
  return XLSX.utils.aoa_to_sheet([headers, ...rows]);
}