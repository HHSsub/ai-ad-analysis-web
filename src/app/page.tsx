"use client";

import { useState, ClipboardEvent, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, AlertCircle, CheckCircle, Download, Plus, Trash2, BarChart3, Sparkles, Video, Brain, Globe, Database, Play } from "lucide-react";
import toast from 'react-hot-toast';

import ResultsFooter from "@/components/ResultsFooter";
import DriveUploadButton from "@/components/DriveUploadButton";

type VideoRow = { title: string; url: string; notes: string; };
type AnalysisStatus = 'welcome' | 'input' | 'loading' | 'completed';

type CompletionStats = {
  completed: number;
  incomplete: number;
  total: number;
  percentage: number;
};

type FulfilledResult = { 
  status: 'fulfilled'; 
  value: { 
    id: string; 
    title: string; 
    url: string; 
    notes: string; 
    status: 'completed'; 
    analysis: { [category: string]: { [feature: string]: string } };
    completionStats: CompletionStats;
    scriptLanguage: string;
  }; 
};

type RejectedResult = { 
  status: 'rejected'; 
  reason: { 
    id: string; 
    title: string; 
    url: string; 
    status: 'failed'; 
    error: string; 
  }; 
};

type AnalysisResult = FulfilledResult | RejectedResult;

interface AutomationStats {
  total_ads: number;
  pending: number;
  completed: number;
  failed: number;
}

const SESSION_KEY = 'ai-ad-analysis-session-v1';
const INITIAL_ROWS = 10;

export default function Home() {
  const [videos, setVideos] = useState<VideoRow[]>(() => 
    Array(INITIAL_ROWS).fill(null).map(() => ({ title: '', url: '', notes: '' }))
  );
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>('welcome');
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [isAutoCollecting, setIsAutoCollecting] = useState(false);
  const [automationStats, setAutomationStats] = useState<AutomationStats | null>(null);

  const completedVideos = results.filter((r): r is FulfilledResult => r.status === 'fulfilled');
  const failedVideos = results.filter((r): r is RejectedResult => r.status === 'rejected');

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(false);

  const saveSession = () => {
    try {
      const payload = { version: 1, timestamp: Date.now(), videos, analysisStatus, results, selectedVideo, error };
      localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch (e) {
      console.error('세션 저장 실패:', e);
    }
  };

  const loadSession = () => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return false;
      if (Array.isArray(data.videos)) setVideos(data.videos);
      if (data.analysisStatus) setAnalysisStatus(data.analysisStatus);
      if (Array.isArray(data.results)) setResults(data.results);
      if (data.selectedVideo) setSelectedVideo(data.selectedVideo);
      if (typeof data.error === 'string' || data.error === null) setError(data.error ?? null);
      toast.success('이전 작업 세션을 복원했습니다.');
      return true;
    } catch (e) {
      console.error('세션 로드 실패:', e);
      return false;
    }
  };

  const fetchAutomationStats = async () => {
    try {
      const response = await fetch('/api/automation/collect', {
        method: 'GET'
      });
      
      const result = await response.json();
      if (result.success && result.data?.stats) {
        setAutomationStats(result.data.stats);
      }
    } catch (error) {
      console.error('자동화 상태 조회 실패:', error);
    }
  };

  const handleAutoCollect = async () => {
    setIsAutoCollecting(true);
    toast.loading('YouTube 광고 자동 수집 중...', { id: 'auto-collect' });
    
    try {
      const response = await fetch('/api/automation/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          maxAds: 200, // Python 스크립트 최대 능력 활용
          searchQueries: [
            // 영어 검색어
            "advertisement commercial", "product promotion", "brand commercial",
            "sponsored content", "new product launch", "company ad",
            "marketing video", "product review", "unboxing video sponsored",
            "paid partnership", "ad campaign", "promotional video",
            "infomercial", "sponsored review", "affiliate marketing",
            "brand partnership", "influencer ad", "commercial 2024",
            "product launch", "brand campaign", "sponsored post",
            // 한글 검색어 (한국 시장 광고 수집)
            "상품 광고", "브랜드 홍보", "제품 리뷰", "협찬 영상",
            "제품 홍보", "광고 영상", "마케팅 영상", "브랜드 캠페인",
            "상품 소개", "제품 체험", "협찬 리뷰", "광고 콘텐츠"
          ]
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast.success(result.message, { id: 'auto-collect' });
        
        if (result.data?.stats) {
          setAutomationStats(result.data.stats);
        }
        
        if (result.data?.stats?.pending > 0) {
          const shouldStartAnalysis = confirm(
            `${result.data.stats.pending}개의 새로운 광고를 수집했습니다.\n바로 분석을 시작하시겠습니까?`
          );
          
          if (shouldStartAnalysis) {
            handleAutoAnalysis();
          }
        }
        
      } else {
        toast.error(`수집 실패: ${result.message}`, { id: 'auto-collect' });
      }
    } catch (error) {
      toast.error('자동 수집 중 오류 발생', { id: 'auto-collect' });
      console.error('자동 수집 오류:', error);
    } finally {
      setIsAutoCollecting(false);
    }
  };

  const handleAutoAnalysis = async () => {
    if (!automationStats?.pending) {
      toast.error('분석할 대기 중인 광고가 없습니다.');
      return;
    }
    
    toast.loading('수집된 광고를 분석 시스템으로 전송 중...', { id: 'auto-analysis' });
    
    try {
      const pendingResponse = await fetch(`/api/automation/collect?limit=${automationStats.pending}`);
      
      const pendingData = await pendingResponse.json();
      
      if (pendingData.success && pendingData.data?.recentAds) {
        const pendingAds = pendingData.data.recentAds
          .filter((ad: any) => ad.analysis_status === 'pending')
          .map((ad: any) => ({
            title: ad.title || '',
            url: ad.url || '',
            notes: ad.note || '자동 수집된 광고'
          }));
        
        if (pendingAds.length > 0) {
          setVideos(pendingAds);
          setAnalysisStatus('input');
          toast.success(`${pendingAds.length}개 광고를 분석 대상으로 불러왔습니다.`, { id: 'auto-analysis' });
          
          setTimeout(() => {
            handleAnalyze();
          }, 1000);
        } else {
          toast.error('분석 가능한 광고가 없습니다.', { id: 'auto-analysis' });
        }
      } else {
        toast.error('광고 데이터 불러오기 실패', { id: 'auto-analysis' });
      }
      
    } catch (error) {
      toast.error('자동 분석 준비 중 오류 발생', { id: 'auto-analysis' });
      console.error('자동 분석 오류:', error);
    }
  };

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    const handleOnline = () => toast.success('네트워크 연결이 복구되었습니다.');
    const handleOffline = () => toast.error('네트워크 연결이 끊겼습니다. 진행 상태는 자동 저장됩니다.');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    try {
      const raw = localStorage.getItem(SESSION_KEY);
      const hasDefaultVideos = videos.every(v => !v.title && !v.url && !v.notes);
      const hasNoResults = results.length === 0;
      if (raw && hasDefaultVideos && hasNoResults && analysisStatus === 'welcome') {
        loadSession();
      }
    } catch {}

    fetchAutomationStats();

    const beforeUnload = () => { saveSession(); };
    window.addEventListener('beforeunload', beforeUnload);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(saveSession, 1200);
  }, [videos, analysisStatus, results, selectedVideo, error]);

  const handleInputChange = (index: number, field: keyof VideoRow, value: string) => {
    setVideos(currentVideos => 
      currentVideos.map((video, i) => 
        i === index ? { ...video, [field]: value } : video
      )
    );
  };

  const addNewRow = () => {
    setVideos(prevVideos => [...prevVideos, { title: '', url: '', notes: '' }]);
    toast.success('새 행이 추가되었습니다.');
  };

  const removeRow = (index: number) => {
    if (videos.length > 1) {
      setVideos(prevVideos => prevVideos.filter((_, i) => i !== index));
      toast.success('행이 삭제되었습니다.');
    } else {
      toast.error('최소 하나의 행은 유지되어야 합니다.');
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text');
    if (!pasteData) return;
    const pastedRows = pasteData.split('\n').filter(row => row.trim() !== '');
    
    setVideos(currentVideos => {
      const newVideos = [...currentVideos];
      pastedRows.forEach((row, r_idx) => {
        const currentRowIndex = rowIndex + r_idx;
        if (currentRowIndex >= newVideos.length) {
          const additionalRows = currentRowIndex - newVideos.length + 1;
          for (let i = 0; i < additionalRows; i++) {
            newVideos.push({ title: '', url: '', notes: '' });
          }
        }
        const pastedCells = row.split('\t');
        const currentVideo = { ...newVideos[currentRowIndex] };
        pastedCells.forEach((cell, cellIndex) => {
          const targetColIndex = colIndex + cellIndex;
          if (targetColIndex === 0) currentVideo.title = cell.trim();
          else if (targetColIndex === 1) currentVideo.url = cell.trim();
          else if (targetColIndex === 2) currentVideo.notes = cell.trim();
        });
        newVideos[currentRowIndex] = currentVideo;
      });
      return newVideos;
    });
    toast.success(`${pastedRows.length}행의 데이터가 붙여넣어졌습니다.`);
  };

  const handleAnalyze = async () => {
    setAnalysisStatus('loading');
    setError(null);
    setResults([]);
    setSelectedVideo(null);
    saveSession();

    const videosToAnalyze = videos.filter(v => v.url.trim() !== '');
    if (videosToAnalyze.length === 0) {
      setError("분석할 영상의 URL을 하나 이상 입력해주세요.");
      setAnalysisStatus('input');
      return;
    }

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videos: videosToAnalyze }),
      });

      const data = await response.json().catch(async () => {
        throw new Error(`서버 응답 오류: ${response.status}`);
      });
      if (!response.ok) throw new Error(data.message || `서버 에러: ${response.status}`);
      
      setResults(data.results);
      const successCount = data.results.filter((r: AnalysisResult) => r.status === 'fulfilled').length;
      const failCount = data.results.filter((r: AnalysisResult) => r.status === 'rejected').length;
      toast.success(`분석 완료! 성공: ${successCount}개, 실패: ${failCount}개`);
      saveSession();
    } catch (err: any) {
      setError(err.message || '분석 요청 중 오류가 발생했습니다.');
      toast.error(`분석 중 오류 발생: ${err.message || '네트워크 오류'}`);
    } finally {
      setAnalysisStatus('completed');
      saveSession();
    }
  };

  const handleDownload = async () => {
    if (!selectedVideo || selectedVideo.status !== 'fulfilled') {
      toast.error('분석 완료된 영상을 선택해주세요.');
      return;
    }
    
    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video: selectedVideo.value }),
      });

      if (!response.ok) throw new Error('다운로드 실패');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `${selectedVideo.value.title}_분석결과.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('분석 결과가 다운로드되었습니다.');
    } catch (error) {
      console.error('다운로드 오류:', error);
      toast.error('다운로드 중 오류가 발생했습니다.');
    }
  };

  const renderAnalysisDetail = () => {
    if (!selectedVideo) return (
      <div className="text-center text-gray-400 mt-10">
        <p className="text-lg">목록에서 영상을 선택하여 상세 분석 결과를 확인하세요.</p>
      </div>
    );
    
    if (selectedVideo.status === 'rejected') {
      return (
        <Card className="w-full bg-gray-800 border-red-900">
          <CardHeader>
            <CardTitle className="text-red-400">분석 실패</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-300"><strong>영상 제목:</strong> {selectedVideo.reason.title}</p>
            <p className="text-gray-300"><strong>실패 원인:</strong> {selectedVideo.reason.error}</p>
          </CardContent>
        </Card>
      );
    }

    const analysisData = selectedVideo.value.analysis;
    const stats = selectedVideo.value.completionStats;
    const categories = Object.keys(analysisData);

    return (
      <Card className="w-full bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-xl font-bold mb-4 text-white">{selectedVideo.value.title}</CardTitle>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-900 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">{stats.completed}</div>
              <div className="text-sm text-gray-400">완료</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">{stats.incomplete}</div>
              <div className="text-sm text-gray-400">미완성</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">{stats.total}</div>
              <div className="text-sm text-gray-400">전체</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-400">{stats.percentage}%</div>
              <div className="text-sm text-gray-400">완료율</div>
            </div>
          </div>

          <div className="mb-4 text-sm text-gray-400">
            <span className="font-medium">자막 언어:</span> {selectedVideo.value.scriptLanguage || 'none'}
          </div>
          
          <div className="flex space-x-3 mb-6">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleDownload}
              className="bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600"
            >
              <Download className="mr-2 h-4 w-4" />
              결과 다운로드
            </Button>

            <DriveUploadButton
              items={[selectedVideo.value]}
              fileName={`${selectedVideo.value.title}_분석결과.xlsx`}
              workbookTitle="AI Ad Analysis"
              className="inline-flex items-center px-3 py-1.5 text-sm border bg-gray-700 border-gray-600 text-gray-200 rounded hover:bg-gray-600"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={categories[0]} className="w-full">
            <TabsList className="grid w-full grid-cols-3 md:grid-cols-4 lg:grid-cols-5 mb-8 bg-gray-900">
              {categories.map(category => (
                <TabsTrigger 
                  key={category} 
                  value={category}
                  className="text-sm font-medium text-gray-300 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                >
                  {category}
                </TabsTrigger>
              ))}
            </TabsList>
            
            {categories.map(category => (
              <TabsContent key={category} value={category} className="mt-6">
                <div className="rounded-lg border border-gray-700 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-900 border-gray-700">
                        <TableHead className="w-[35%] font-semibold text-gray-300">피처</TableHead>
                        <TableHead className="font-semibold text-gray-300">분석 결과</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(analysisData[category]).map(([feature, value], index) => {
                        const isIncomplete = String(value).startsWith('분석불가/') || 
                                           String(value).startsWith('판단불가/') || 
                                           value === 'N/A' || 
                                           value === '미확인';
                        
                        return (
                          <TableRow 
                            key={feature}
                            className={`${index % 2 === 0 ? 'bg-gray-800' : 'bg-gray-850'} border-gray-700 hover:bg-gray-700`}
                          >
                            <TableCell className="font-medium text-gray-200 py-3">
                              {feature}
                            </TableCell>
                            <TableCell className={`py-3 ${
                              isIncomplete
                                ? 'text-red-400 font-medium' 
                                : 'text-gray-300'
                            }`}>
                              {value}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    );
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-black text-white">
      <div className="container mx-auto p-4 md:p-8">
        <div className="flex justify-between items-center mb-8">
          <h1 
            className="text-4xl font-bold cursor-pointer bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent hover:from-blue-300 hover:to-purple-400 transition-all" 
            onClick={() => setAnalysisStatus('welcome')}
          >
            NEXAD
          </h1>
        </div>

        {automationStats && analysisStatus === 'welcome' && (
          <Card className="mb-8 bg-gray-800 border-gray-700 border-l-4 border-l-green-500">
            <CardHeader>
              <CardTitle className="text-lg text-green-400 flex items-center">
                <Database className="mr-2 h-5 w-5" />
                자동 수집 현황
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-400">{automationStats.total_ads}</div>
                  <div className="text-sm text-gray-400">전체 수집</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-400">{automationStats.pending}</div>
                  <div className="text-sm text-gray-400">분석 대기</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400">{automationStats.completed}</div>
                  <div className="text-sm text-gray-400">분석 완료</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-400">{automationStats.failed}</div>
                  <div className="text-sm text-gray-400">분석 실패</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {analysisStatus === 'welcome' && (
          <div className="relative overflow-hidden">
            <div className="text-center py-20 relative z-10">
              <div className="inline-block mb-6">
                <div className="flex items-center justify-center space-x-2 px-4 py-2 bg-blue-500/10 border border-blue-500/30 rounded-full">
                  <Sparkles className="h-4 w-4 text-blue-400" />
                  <span className="text-sm text-blue-300 font-medium">Powered by Nexad</span>
                </div>
              </div>
              
              <h2 className="text-6xl md:text-7xl font-black mb-6 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent leading-tight">
                차세대 광고 분석
                <br />
                NEXAD
              </h2>
              
              <p className="text-xl md:text-2xl text-gray-400 mb-12 max-w-3xl mx-auto leading-relaxed">
                <span className="text-blue-400 font-semibold">NEXAD</span>
                <br />
                AI 기반 광고 분석
              </p>

              <div className="flex justify-center space-x-6 mb-16">
                <Button 
                  onClick={handleAutoCollect}
                  disabled={isAutoCollecting}
                  size="lg"
                  className="bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white font-bold px-10 py-6 text-lg rounded-xl shadow-lg shadow-green-500/50 transition-all transform hover:scale-105"
                >
                  {isAutoCollecting ? (
                    <>
                      <Loader2 className="mr-3 h-6 w-6 animate-spin" />
                      수집 중...
                    </>
                  ) : (
                    <>
                      <Database className="mr-3 h-6 w-6" />
                      자동 수집
                    </>
                  )}
                </Button>

                {automationStats?.pending && automationStats.pending > 0 && (
                  <Button 
                    onClick={handleAutoAnalysis}
                    size="lg"
                    className="bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white font-bold px-10 py-6 text-lg rounded-xl shadow-lg shadow-purple-500/50 transition-all transform hover:scale-105"
                  >
                    <Play className="mr-3 h-6 w-6" />
                    수집된 광고 분석 ({automationStats.pending}개)
                  </Button>
                )}
                
                <Button 
                  onClick={() => setAnalysisStatus('input')} 
                  size="lg"
                  className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold px-10 py-6 text-lg rounded-xl shadow-lg shadow-blue-500/50 transition-all transform hover:scale-105"
                >
                  <Video className="mr-3 h-6 w-6" />
                  링크 수동 추가
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto mt-20">
                <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/10 border border-blue-700/30 rounded-2xl p-8 hover:border-blue-500/50 transition-all transform hover:scale-105">
                  <div className="bg-blue-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Brain className="h-8 w-8 text-blue-400" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4 text-white">AI 심층 분석</h3>
                  <p className="text-gray-400 leading-relaxed">
                    Gemini AI 기반 156가지 세밀한 피처 추출.
                    인물, 감정, 시각 요소, 브랜딩까지 완벽 분석
                  </p>
                </div>

                <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/10 border border-purple-700/30 rounded-2xl p-8 hover:border-purple-500/50 transition-all transform hover:scale-105">
                  <div className="bg-purple-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Globe className="h-8 w-8 text-purple-400" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4 text-white">다국어 지원</h3>
                  <p className="text-gray-400 leading-relaxed">
                    한국어, 영어, 일본어, 중국어 등
                    글로벌 광고 영상 자동 자막 인식
                  </p>
                </div>

                <div className="bg-gradient-to-br from-green-900/30 to-green-800/10 border border-green-700/30 rounded-2xl p-8 hover:border-green-500/50 transition-all transform hover:scale-105">
                  <div className="bg-green-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                    <BarChart3 className="h-8 w-8 text-green-400" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4 text-white">실시간 통계</h3>
                  <p className="text-gray-400 leading-relaxed">
                    완료도, 분석 불가 사유까지
                    투명한 분석 프로세스 실시간 제공
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto mt-20 px-4">
                <div className="text-center">
                  <div className="text-5xl font-black text-blue-400 mb-2">156</div>
                  <div className="text-gray-400 text-sm">분석 피처</div>
                </div>
                <div className="text-center">
                  <div className="text-5xl font-black text-purple-400 mb-2">10+</div>
                  <div className="text-gray-400 text-sm">분석 카테고리</div>
                </div>
                <div className="text-center">
                  <div className="text-5xl font-black text-green-400 mb-2">100%</div>
                  <div className="text-gray-400 text-sm">자동화</div>
                </div>
                <div className="text-center">
                  <div className="text-5xl font-black text-pink-400 mb-2">∞</div>
                  <div className="text-gray-400 text-sm">무제한 분석</div>
                </div>
              </div>
            </div>

            <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
              <div className="absolute top-20 left-10 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl"></div>
              <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl"></div>
            </div>
          </div>
        )}

        {analysisStatus === 'input' && (
          <>
            <Card className="shadow-2xl border-gray-700 bg-gray-800 mb-8">
              <CardHeader className="bg-gradient-to-r from-blue-900/50 to-purple-900/30 border-b border-gray-700">
                <CardTitle className="text-xl font-bold text-white">분석할 영상 링크 입력</CardTitle>
                <p className="text-sm text-gray-400 mt-2">
                  엑셀/시트에서 데이터를 복사한 후, 아래 표의 시작할 셀을 클릭하고 붙여넣기 (Ctrl+V) 하세요.
                </p>
              </CardHeader>
              <CardContent className="p-6">
                <div className="max-h-96 overflow-auto rounded-lg border border-gray-700">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-900 border-gray-700">
                        <TableHead className="w-[25%] font-semibold text-gray-300">제목</TableHead>
                        <TableHead className="w-[40%] font-semibold text-gray-300">영상 링크 (URL)</TableHead>
                        <TableHead className="w-[25%] font-semibold text-gray-300">비고</TableHead>
                        <TableHead className="w-[10%] font-semibold text-gray-300 text-center">삭제</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {videos.map((video, rowIndex) => (
                        <TableRow key={rowIndex} className="border-gray-700 hover:bg-gray-750">
                          <TableCell>
                            <Input 
                              value={video.title} 
                              onChange={(e) => handleInputChange(rowIndex, 'title', e.target.value)} 
                              onPaste={(e) => handlePaste(e, rowIndex, 0)}
                              placeholder="영상 제목"
                              className="bg-gray-900 border-gray-700 text-white focus:border-blue-500"
                            />
                          </TableCell>
                          <TableCell>
                            <Input 
                              value={video.url} 
                              onChange={(e) => handleInputChange(rowIndex, 'url', e.target.value)} 
                              onPaste={(e) => handlePaste(e, rowIndex, 1)}
                              placeholder="https://youtube.com/watch?v=..."
                              className="bg-gray-900 border-gray-700 text-white focus:border-blue-500"
                            />
                          </TableCell>
                          <TableCell>
                            <Input 
                              value={video.notes} 
                              onChange={(e) => handleInputChange(rowIndex, 'notes', e.target.value)} 
                              onPaste={(e) => handlePaste(e, rowIndex, 2)}
                              placeholder="메모"
                              className="bg-gray-900 border-gray-700 text-white focus:border-blue-500"
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => removeRow(rowIndex)}
                              disabled={videos.length <= 1}
                              className="bg-gray-900 border-gray-700 text-red-400 hover:bg-red-900/20 hover:border-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                
                <div className="mt-4 text-center">
                  <Button
                    variant="outline"
                    onClick={addNewRow}
                    className="bg-green-900/20 border-green-700 text-green-400 hover:bg-green-800/30"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    행 추가
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            <div className="text-center my-8">
              <Button 
                onClick={handleAnalyze} 
                size="lg"
                className="bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white font-bold px-10 py-6 text-lg rounded-xl shadow-lg shadow-green-500/50"
              >
                분석 시작
              </Button>
            </div>
          </>
        )}

        {analysisStatus === 'loading' && (
          <div className="text-center my-20">
            <Loader2 className="mx-auto h-16 w-16 animate-spin text-blue-400" />
            <p className="mt-6 text-xl text-gray-300 font-medium">영상 데이터를 분석 중입니다...</p>
            <p className="mt-2 text-sm text-gray-500">156가지 피처를 상세히 분석하고 있습니다.</p>
          </div>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-700 text-red-400 px-6 py-4 rounded-lg mb-8" role="alert">
            <strong className="font-bold">오류 발생: </strong>
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        {analysisStatus === 'completed' && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 flex flex-col gap-6">
                <Card className="border-gray-700 bg-gray-800">
                  <CardHeader className="bg-green-900/20 border-b border-gray-700">
                    <CardTitle className="flex items-center text-lg font-bold text-white">
                      <CheckCircle className="mr-3 text-green-400 h-5 w-5" /> 
                      분석 완료 ({completedVideos.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-96 overflow-y-auto p-4">
                    <ul className="space-y-3">
                      {completedVideos.map(item => (
                        <li 
                          key={item.value.id} 
                          onClick={() => setSelectedVideo(item)} 
                          className={`p-3 rounded-lg cursor-pointer transition-all border ${
                            selectedVideo?.status === 'fulfilled' && selectedVideo.value.id === item.value.id 
                              ? 'bg-blue-900/30 border-blue-600' 
                              : 'bg-gray-900 border-gray-700 hover:bg-gray-750'
                          }`}
                        >
                          <div className="font-medium mb-1 text-white">{item.value.title}</div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">완료도: {item.value.completionStats.percentage}%</span>
                            <span className="text-gray-400">
                              {item.value.completionStats.completed}/{item.value.completionStats.total}
                            </span>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
                            <div 
                              className="bg-green-500 h-2 rounded-full" 
                              style={{ width: `${item.value.completionStats.percentage}%` }}
                            />
                          </div>
                          {item.value.scriptLanguage && item.value.scriptLanguage !== 'none' && (
                            <div className="text-xs text-blue-400 mt-1">
                              언어: {item.value.scriptLanguage}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card className="border-gray-700 bg-gray-800">
                  <CardHeader className="bg-red-900/20 border-b border-gray-700">
                    <CardTitle className="flex items-center text-lg font-bold text-white">
                      <AlertCircle className="mr-3 text-red-400 h-5 w-5" /> 
                      분석 미완 ({failedVideos.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-96 overflow-y-auto p-4">
                    <ul className="space-y-3">
                      {failedVideos.map(item => (
                        <li 
                          key={item.reason.id} 
                          onClick={() => setSelectedVideo(item)} 
                          className={`p-3 rounded-lg cursor-pointer transition-all border ${
                            selectedVideo?.status === 'rejected' && selectedVideo.reason.id === item.reason.id 
                              ? 'bg-red-900/30 border-red-600' 
                              : 'bg-gray-900 border-gray-700 hover:bg-gray-750'
                          }`}
                        >
                          <div className="font-medium text-red-400">{item.reason.title}</div>
                          <div className="text-sm text-red-300 mt-1">분석 실패: {item.reason.error}</div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>

              <div className="lg:col-span-2">
                {renderAnalysisDetail()}
              </div>
            </div>

            <div className="mt-6">
              <ResultsFooter results={results as any} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
