// src/app/page.tsx - 기존 모든 기능 유지 + DB 통계만 추가
"use client";

import { useState, ClipboardEvent, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, AlertCircle, CheckCircle, Download, Plus, Trash2, BarChart3, Play, Database, RefreshCw } from "lucide-react";
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

// 자동화 상태 관리
interface AutomationStats {
  total_ads: number;
  pending: number;
  completed: number;
  failed: number;
}

// ✅ 추가: 데이터베이스 통계 타입
interface DatabaseStats {
  total: number;
  pending: number;
  completed: number;
  failed: number;
  latest_analysis: string;
}

const SESSION_KEY = 'ai-ad-analysis-session-v1';
const INITIAL_ROWS = 10;

export default function Home() {
  const [videos, setVideos] = useState<VideoRow[]>(() => 
    Array(INITIAL_ROWS).fill({ title: '', url: '', notes: '' })
  );
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>('welcome');
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // 자동화 상태
  const [isAutoCollecting, setIsAutoCollecting] = useState(false);
  const [automationStats, setAutomationStats] = useState<AutomationStats | null>(null);

  // ✅ 추가: DB 통계 상태
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [isLoadingDbStats, setIsLoadingDbStats] = useState(false);

  const completedVideos = results.filter(r => r.status === 'fulfilled').length;
  const failedVideos = results.filter(r => r.status === 'rejected').length;

  // 페이지 로드 시 상태 복원
  useEffect(() => {
    const hasRestored = loadSession();
    if (!hasRestored) {
      setAnalysisStatus('welcome');
    }
    fetchAutomationStats();
    // ✅ 추가: DB 통계 로드
    loadDatabaseStats();
  }, []);

  // ✅ 추가: DB 통계 로드 함수
  const loadDatabaseStats = async () => {
    try {
      setIsLoadingDbStats(true);
      const response = await fetch('/api/db-stats');
      if (response.ok) {
        const data = await response.json();
        setDbStats(data.basic);
      }
    } catch (error) {
      console.error('DB 통계 로드 실패:', error);
    } finally {
      setIsLoadingDbStats(false);
    }
  };

  // 세션 저장
  const saveSession = () => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        videos: videos.filter(v => v.title || v.url || v.notes),
        results,
        selectedVideo,
        analysisStatus: analysisStatus === 'loading' ? 'input' : analysisStatus
      }));
    } catch (e) {
      console.error('세션 저장 실패:', e);
    }
  };

  // 세션 로드
  const loadSession = (): boolean => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (!saved) return false;

      const parsed = JSON.parse(saved);
      if (parsed.videos?.length) {
        const paddedVideos = [...parsed.videos];
        while (paddedVideos.length < INITIAL_ROWS) {
          paddedVideos.push({ title: '', url: '', notes: '' });
        }
        setVideos(paddedVideos);
      }
      
      setResults(parsed.results || []);
      setAnalysisStatus(parsed.analysisStatus || 'welcome');
      setSelectedVideo(parsed.selectedVideo || null);

      toast.success('이전 작업 세션을 복원했습니다.');
      return true;
    } catch (e) {
      console.error('세션 로드 실패:', e);
      return false;
    }
  };

  // 자동화 상태 조회
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

  // 자동 광고 수집 실행
  const handleAutoCollect = async () => {
    setIsAutoCollecting(true);
    toast.loading('YouTube 광고 자동 수집 중...', { id: 'auto-collect' });
    
    try {
      const response = await fetch('/api/automation/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          maxAds: 25,
          searchQueries: [
            "advertisement commercial",
            "product promotion", 
            "brand commercial",
            "sponsored content",
            "new product launch"
          ]
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast.success(result.message, { id: 'auto-collect' });
        
        // 상태 업데이트
        if (result.data?.stats) {
          setAutomationStats(result.data.stats);
        }
        
        // 수집된 데이터가 있으면 자동으로 분석 시작 제안
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

  // 수집된 광고들을 분석 시스템에 자동 전송 - 수정됨
  const handleAutoAnalysis = async () => {
    if (!automationStats?.pending) {
      toast.error('분석할 대기 중인 광고가 없습니다.');
      return;
    }

    const confirmMessage = `수집된 ${automationStats.pending}개 광고를 분석 시스템에 전송하시겠습니까?\n\n⚠️ 이 작업은 시간이 오래 걸릴 수 있습니다.`;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    toast.loading(`${automationStats.pending}개 광고 분석 시작 중...`, { id: 'auto-analysis' });
    
    try {
      const response = await fetch('/api/automation/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          batchSize: 5,
          maxRetries: 3
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast.success(`분석 전송 완료: ${result.message}`, { id: 'auto-analysis' });
        
        // 통계 업데이트
        if (result.data?.stats) {
          setAutomationStats(result.data.stats);
        }
        
        // 분석 완료 후 리다이렉트 제안
        if (result.data?.analysisStarted) {
          const shouldViewResults = confirm(
            '분석이 시작되었습니다.\n결과 페이지로 이동하시겠습니까?'
          );
          
          if (shouldViewResults) {
            // 분석 결과가 있으면 completed 상태로 이동
            if (result.data.results?.length > 0) {
              setResults(result.data.results);
              setAnalysisStatus('completed');
            }
          }
        }
        
      } else {
        toast.error(`분석 전송 실패: ${result.message}`, { id: 'auto-analysis' });
      }
    } catch (error) {
      toast.error('분석 시스템 연동 중 오류 발생', { id: 'auto-analysis' });
      console.error('자동 분석 오류:', error);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>, rowIndex: number, field: keyof VideoRow) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const lines = pastedText.trim().split('\n');
    
    if (lines.length > 1) {
      const newVideos = [...videos];
      lines.forEach((line, index) => {
        const targetRowIndex = rowIndex + index;
        if (targetRowIndex < newVideos.length) {
          const columns = line.split('\t');
          if (columns.length >= 3) {
            newVideos[targetRowIndex] = {
              title: columns[0]?.trim() || '',
              url: columns[1]?.trim() || '',
              notes: columns[2]?.trim() || ''
            };
          } else if (field === 'title' && columns[0]) {
            newVideos[targetRowIndex].title = columns[0].trim();
          }
        }
      });
      setVideos(newVideos);
      saveSession();
      toast.success(`${lines.length}개 행 데이터가 붙여넣어졌습니다.`);
    } else {
      const newVideos = [...videos];
      newVideos[rowIndex] = { ...newVideos[rowIndex], [field]: pastedText };
      setVideos(newVideos);
      saveSession();
    }
  };

  const addRow = () => {
    setVideos([...videos, { title: '', url: '', notes: '' }]);
  };

  const removeRow = (index: number) => {
    if (videos.length > 1) {
      const newVideos = videos.filter((_, i) => i !== index);
      setVideos(newVideos);
      saveSession();
    }
  };

  const updateVideo = (index: number, field: keyof VideoRow, value: string) => {
    const newVideos = [...videos];
    newVideos[index] = { ...newVideos[index], [field]: value };
    setVideos(newVideos);
    saveSession();
  };

  const handleAnalyze = async () => {
    const validVideos = videos.filter(v => v.url.trim() !== '');
    
    if (validVideos.length === 0) {
      toast.error('분석할 영상 URL을 입력해주세요.');
      return;
    }

    setAnalysisStatus('loading');
    setError(null);
    setResults([]);

    try {
      toast.loading(`${validVideos.length}개 영상 분석 중...`, { id: 'analysis' });

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videos: validVideos }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: 서버 오류`);
      }

      const data = await response.json();
      
      // 새로운 통합 형식 확인
      if (data.analysis_results && Array.isArray(data.analysis_results)) {
        setResults(data.analysis_results);
        const successCount = data.analysis_results.filter((r: any) => r.status === 'fulfilled').length;
        const failCount = data.analysis_results.filter((r: any) => r.status === 'rejected').length;
        toast.success(`통합 분석 완료! 성공: ${successCount}개, 실패: ${failCount}개`, { id: 'analysis' });
      } else {
        // 기존 형식 호환성 유지
        setResults(data.results || []);
      }

      saveSession();
      // ✅ 추가: 분석 완료 후 DB 통계 새로고침
      await loadDatabaseStats();
    } catch (err: any) {
      setError(err.message || '분석 요청 중 오류가 발생했습니다.');
      toast.error(`분석 중 오류 발생: ${err.message || '네트워크 오류'}`, { id: 'analysis' });
    } finally {
      setAnalysisStatus('completed');
      saveSession();
      // 자동화 상태 재조회
      fetchAutomationStats();
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
      <div className="text-center text-gray-500 mt-10">
        <p className="text-lg">목록에서 영상을 선택하여 상세 분석 결과를 확인하세요.</p>
      </div>
    );
    
    if (selectedVideo.status === 'rejected') {
      return (
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-red-600">분석 실패</CardTitle>
          </CardHeader>
          <CardContent>
            <p><strong>영상 제목:</strong> {selectedVideo.reason.title}</p>
            <p><strong>실패 원인:</strong> {selectedVideo.reason.error}</p>
          </CardContent>
        </Card>
      );
    }

    const analysisData = selectedVideo.value.analysis;
    const stats = selectedVideo.value.completionStats;
    const categories = Object.keys(analysisData);

    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl font-bold mb-4">{selectedVideo.value.title}</CardTitle>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
              <div className="text-sm text-gray-600">완료</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.incomplete}</div>
              <div className="text-sm text-gray-600">미완성</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
              <div className="text-sm text-gray-600">전체</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.percentage}%</div>
              <div className="text-sm text-gray-600">완료율</div>
            </div>
          </div>

          <div className="mb-4 text-sm text-gray-600">
            <span className="font-medium">자막 언어:</span> {selectedVideo.value.scriptLanguage || 'none'}
          </div>
          
          <div className="flex space-x-3 mb-6">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleDownload}
              className="hover:bg-blue-50 transition-colors"
            >
              <Download className="mr-2 h-4 w-4" />
              결과 다운로드
            </Button>

            <DriveUploadButton
              items={[selectedVideo.value]}
              fileName={`${selectedVideo.value.title}_분석결과.xlsx`}
              workbookTitle="AI Ad Analysis"
              className="inline-flex items-center px-3 py-1.5 text-sm border rounded hover:bg-blue-50 transition-colors"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={categories[0]} className="w-full">
            <TabsList className="grid w-full grid-cols-3 md:grid-cols-4 lg:grid-cols-5 mb-8">
              {categories.slice(0, 5).map((category) => (
                <TabsTrigger key={category} value={category} className="text-xs md:text-sm">
                  {category.length > 8 ? `${category.slice(0, 8)}...` : category}
                </TabsTrigger>
              ))}
            </TabsList>
            
            {categories.map((category) => (
              <TabsContent key={category} value={category} className="mt-6">
                <div className="max-h-80 overflow-y-auto border rounded-lg">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white">
                      <TableRow>
                        <TableHead className="font-semibold text-gray-700 py-3">특성</TableHead>
                        <TableHead className="font-semibold text-gray-700 py-3">분석 결과</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(analysisData[category]).map(([feature, value]) => {
                        const isIncomplete = !value || value === 'N/A' || value === '미확인' || 
                                           String(value).startsWith('분석불가/') || String(value).startsWith('판단불가/');
                        
                        return (
                          <TableRow 
                            key={feature}
                            className={`${isIncomplete ? 'bg-red-25' : 'bg-white'} hover:bg-blue-50 transition-colors`}
                          >
                            <TableCell className="font-medium text-gray-800 py-3">
                              {feature}
                            </TableCell>
                            <TableCell className={`py-3 ${
                              isIncomplete
                                ? 'text-red-500 font-medium' 
                                : 'text-gray-700'
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
    <main className="container mx-auto p-4 md:p-8 min-h-screen bg-gray-50">
      <div className="flex justify-between items-center mb-8">
        <h1 
          className="text-4xl font-bold cursor-pointer text-gray-800 hover:text-blue-600 transition-colors" 
          onClick={() => setAnalysisStatus('welcome')}
        >
          AI 광고 영상 분석
        </h1>
        
        {/* 통합된 상단 버튼 */}
        <div className="space-x-3">
          {analysisStatus === 'welcome' && (
            <>
              <Button 
                onClick={handleAutoCollect}
                disabled={isAutoCollecting}
                variant="outline"
                className="bg-green-50 text-green-700 border-green-300 hover:bg-green-100"
              >
                {isAutoCollecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    수집 중...
                  </>
                ) : (
                  <>
                    <Database className="mr-2 h-4 w-4" />
                    자동 수집
                  </>
                )}
              </Button>
              
              {automationStats?.pending && automationStats.pending > 0 && (
                <Button 
                  onClick={handleAutoAnalysis}
                  variant="outline"
                  className="bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100"
                >
                  <Play className="mr-2 h-4 w-4" />
                  수집된 광고 분석 ({automationStats.pending}개)
                </Button>
              )}
              
              {/* ✅ 추가: DB 통계 새로고침 버튼 */}
              <Button 
                onClick={loadDatabaseStats}
                disabled={isLoadingDbStats}
                variant="outline"
                size="sm"
              >
                {isLoadingDbStats ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                DB 상태
              </Button>
              
              <Button 
                variant="default" 
                onClick={() => setAnalysisStatus('input')}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2"
              >
                링크 수동 추가
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ✅ 추가: DB 통계 표시 카드 */}
      {dbStats && analysisStatus === 'welcome' && (
        <Card className="mb-8 border-l-4 border-l-blue-500">
          <CardHeader>
            <CardTitle className="text-lg text-blue-700 flex items-center">
              <Database className="mr-2 h-5 w-5" />
              데이터베이스 현황
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{dbStats.total}</div>
                <div className="text-sm text-gray-600">전체 영상</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{dbStats.pending}</div>
                <div className="text-sm text-gray-600">분석 대기</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{dbStats.completed}</div>
                <div className="text-sm text-gray-600">분석 완료</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{dbStats.failed}</div>
                <div className="text-sm text-gray-600">분석 실패</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 자동화 상태 표시 */}
      {automationStats && analysisStatus === 'welcome' && (
        <Card className="mb-8 border-l-4 border-l-green-500">
          <CardHeader>
            <CardTitle className="text-lg text-green-700 flex items-center">
              <Database className="mr-2 h-5 w-5" />
              자동 수집 현황
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{automationStats.total_ads}</div>
                <div className="text-sm text-gray-600">전체 수집</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{automationStats.pending}</div>
                <div className="text-sm text-gray-600">분석 대기</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{automationStats.completed}</div>
                <div className="text-sm text-gray-600">분석 완료</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{automationStats.failed}</div>
                <div className="text-sm text-gray-600">분석 실패</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {analysisStatus === 'input' && (
        <>
          <Card className="shadow-lg border-0 mb-8">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
              <CardTitle className="text-xl font-bold text-gray-800">분석할 영상 링크 입력</CardTitle>
              <p className="text-sm text-gray-600 mt-2">
                엑셀/시트에서 데이터를 복사한 후, 아래 표의 시작할 셀을 클릭하고 붙여넣기 (Ctrl+V) 하세요.
              </p>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm text-gray-600">
                  입력된 영상: {videos.filter(v => v.url.trim()).length}개
                </span>
                <div className="space-x-2">
                  <Button
                    onClick={addRow}
                    variant="outline"
                    size="sm"
                    className="text-green-600 border-green-300 hover:bg-green-50"
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    행 추가
                  </Button>
                  <Button
                    onClick={handleAnalyze}
                    disabled={videos.filter(v => v.url.trim()).length === 0}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <BarChart3 className="mr-2 h-4 w-4" />
                    분석 시작 ({videos.filter(v => v.url.trim()).length}개)
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="font-semibold">제목</TableHead>
                      <TableHead className="font-semibold">YouTube URL</TableHead>
                      <TableHead className="font-semibold">비고</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {videos.map((video, index) => (
                      <TableRow key={index} className="group hover:bg-blue-25">
                        <TableCell>
                          <Input
                            value={video.title}
                            onChange={(e) => updateVideo(index, 'title', e.target.value)}
                            onPaste={(e) => handlePaste(e, index, 'title')}
                            placeholder="영상 제목 (선택사항)"
                            className="border-gray-200 focus:border-blue-400"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={video.url}
                            onChange={(e) => updateVideo(index, 'url', e.target.value)}
                            onPaste={(e) => handlePaste(e, index, 'url')}
                            placeholder="https://youtube.com/watch?v=..."
                            className="border-gray-200 focus:border-blue-400"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={video.notes}
                            onChange={(e) => updateVideo(index, 'notes', e.target.value)}
                            onPaste={(e) => handlePaste(e, index, 'notes')}
                            placeholder="메모 (선택사항)"
                            className="border-gray-200 focus:border-blue-400"
                          />
                        </TableCell>
                        <TableCell>
                          {videos.length > INITIAL_ROWS / 2 && (
                            <Button
                              onClick={() => removeRow(index)}
                              variant="ghost"
                              size="sm"
                              className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 hover:bg-red-50 transition-all"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                <strong>💡 팁:</strong> 엑셀에서 데이터 복사 시 제목, URL, 비고 순서로 탭(Tab)으로 구분된 데이터를 붙여넣으면 자동으로 분배됩니다.
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {analysisStatus === 'loading' && (
        <Card className="shadow-lg border-0 text-center py-12">
          <CardContent>
            <Loader2 className="h-16 w-16 animate-spin mx-auto text-blue-600 mb-6" />
            <h2 className="text-2xl font-bold text-gray-800 mb-4">AI 분석 진행 중...</h2>
            <p className="text-gray-600 text-lg">
              YouTube 영상을 다운로드하고 156가지 특성을 분석하고 있습니다.<br />
              영상의 개수와 길이에 따라 수 분이 소요될 수 있습니다.
            </p>
          </CardContent>
        </Card>
      )}

      {analysisStatus === 'completed' && (
        <>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">분석 결과</h2>
              <p className="text-gray-600">
                총 {results.length}개 영상 중 성공 {completedVideos}개, 실패 {failedVideos}개
              </p>
            </div>
            <div className="space-x-3">
              <Button
                onClick={() => setAnalysisStatus('input')}
                variant="outline"
                className="text-blue-600 border-blue-300 hover:bg-blue-50"
              >
                새 분석 시작
              </Button>
              <DriveUploadButton
                items={results.filter(r => r.status === 'fulfilled').map(r => r.value)}
                fileName="AI_광고_분석_결과.xlsx"
                workbookTitle="AI Ad Analysis Results"
                className="bg-green-600 hover:bg-green-700 text-white"
              />
            </div>
          </div>

          {error && (
            <Card className="mb-6 border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <div className="flex items-center text-red-600">
                  <AlertCircle className="mr-3 h-5 w-5" />
                  <p>{error}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* 결과 목록 */}
            <Card className="shadow-lg border-0">
              <CardHeader className="bg-gray-50">
                <CardTitle className="text-xl font-bold text-gray-800">
                  분석 결과 목록 ({results.length}개)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-96 overflow-y-auto">
                  {results.map((result, index) => (
                    <div
                      key={index}
                      onClick={() => setSelectedVideo(result)}
                      className={`p-4 border-b cursor-pointer transition-colors hover:bg-blue-50 ${
                        selectedVideo === result ? 'bg-blue-100 border-l-4 border-l-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-800 truncate">
                            {result.status === 'fulfilled' ? result.value.title : result.reason.title}
                          </h3>
                          <p className="text-sm text-gray-500 truncate">
                            {result.status === 'fulfilled' ? result.value.url : result.reason.url}
                          </p>
                        </div>
                        <div className="ml-4 flex-shrink-0">
                          {result.status === 'fulfilled' ? (
                            <div className="flex items-center space-x-2">
                              <CheckCircle className="h-5 w-5 text-green-500" />
                              <span className="text-sm font-medium text-green-600">
                                {result.value.completionStats.percentage}%
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center space-x-2">
                              <AlertCircle className="h-5 w-5 text-red-500" />
                              <span className="text-sm font-medium text-red-600">실패</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* 상세 분석 결과 */}
            <Card className="shadow-lg border-0">
              <CardHeader className="bg-gray-50">
                <CardTitle className="text-xl font-bold text-gray-800">상세 분석 결과</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {renderAnalysisDetail()}
              </CardContent>
            </Card>
          </div>

          <ResultsFooter results={results} />
        </>
      )}
    </main>
  );
}
