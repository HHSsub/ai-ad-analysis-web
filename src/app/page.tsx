// /src/app/page.tsx
"use client";

import { useState, ClipboardEvent, ChangeEvent, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, AlertCircle, CheckCircle, Download, Upload } from "lucide-react";

// --- 타입 정의 ---
type VideoRow = { title: string; url: string; notes: string; };
type AnalysisStatus = 'welcome' | 'input' | 'loading' | 'completed';
type FulfilledResult = { status: 'fulfilled'; value: { id: string; title: string; url: string; notes: string; status: 'completed'; analysis: { [category: string]: { [feature: string]: string } }; }; };
type RejectedResult = { status: 'rejected'; reason: { id: string; title: string; url: string; status: 'failed'; error: string; }; };
type AnalysisResult = FulfilledResult | RejectedResult;

const INITIAL_ROWS = 30;

export default function Home() {
  const [videos, setVideos] = useState<VideoRow[]>(() => Array(INITIAL_ROWS).fill({ title: '', url: '', notes: '' }));
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>('welcome');
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pasteStartCell = useRef<{ rowIndex: number; colIndex: number } | null>(null);

  const completedVideos = results.filter((r): r is FulfilledResult => r.status === 'fulfilled');
  const failedVideos = results.filter((r): r is RejectedResult => r.status === 'rejected');

  // [수정됨] 단일 입력 처리 로직
  const handleInputChange = (index: number, field: keyof VideoRow, value: string) => {
    setVideos(currentVideos => 
      currentVideos.map((video, i) => 
        i === index ? { ...video, [field]: value } : video
      )
    );
  };

  // [수정됨] 붙여넣기 처리 로직
  const handlePaste = (e: ClipboardEvent<HTMLTableSectionElement>) => {
    if (!pasteStartCell.current) return;
    e.preventDefault();

    const { rowIndex: startRow, colIndex: startCol } = pasteStartCell.current;
    const pasteData = e.clipboardData.getData('text');
    const pastedRows = pasteData.split('\n').filter(row => row.trim() !== '');
    
    setVideos(currentVideos => {
      const newVideos = [...currentVideos];
      pastedRows.forEach((row, r_idx) => {
        const currentRowIndex = startRow + r_idx;
        if (currentRowIndex >= newVideos.length) return;

        const pastedCells = row.split('\t');
        pastedCells.forEach((cell, c_idx) => {
          const currentColIndex = startCol + c_idx;
          const currentVideo = { ...newVideos[currentRowIndex] };

          if (currentColIndex === 0) currentVideo.title = cell;
          else if (currentColIndex === 1) currentVideo.url = cell;
          else if (currentColIndex === 2) currentVideo.notes = cell;
          
          newVideos[currentRowIndex] = currentVideo;
        });
      });
      return newVideos;
    });
  };

  const handleAnalyze = async () => {
    setAnalysisStatus('loading');
    setError(null);
    setResults([]);
    setSelectedVideo(null);

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

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `서버 에러: ${response.status}`);
      setResults(data.results);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAnalysisStatus('completed');
    }
  };

  const renderAnalysisDetail = () => {
    if (!selectedVideo) return <div className="text-center text-gray-500 mt-10">목록에서 영상을 선택하여 상세 분석 결과를 확인하세요.</div>;
    if (selectedVideo.status === 'rejected') {
      return (
        <Card className="w-full"><CardHeader><CardTitle className="text-red-600">분석 실패</CardTitle></CardHeader>
          <CardContent><p><strong>영상 제목:</strong> {selectedVideo.reason.title}</p><p><strong>실패 원인:</strong> {selectedVideo.reason.error}</p></CardContent>
        </Card>
      );
    }

    const analysisData = selectedVideo.value.analysis;
    const categories = Object.keys(analysisData);

    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{selectedVideo.value.title}</CardTitle>
          <div className="flex space-x-2 mt-2">
            <Button variant="outline" size="sm" disabled><Download className="mr-2 h-4 w-4" />결과 다운로드</Button>
            <Button variant="outline" size="sm" disabled><Upload className="mr-2 h-4 w-4" />드라이브 업로드</Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={categories[0]}>
            <TabsList className="grid w-full grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {categories.map(category => (<TabsTrigger key={category} value={category}>{category}</TabsTrigger>))}
            </TabsList>
            {categories.map(category => (
              <TabsContent key={category} value={category}>
                <Table><TableHeader><TableRow><TableHead className="w-[30%]">피처</TableHead><TableHead>분석 결과</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {Object.entries(analysisData[category]).map(([feature, value]) => (
                      <TableRow key={feature}>
                        <TableCell className="font-medium">{feature}</TableCell>
                        <TableCell className={value === '누락됨' || value === '분석 불가' ? 'text-red-500' : ''}>{value}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    );
  };

  return (
    <main className="container mx-auto p-4 md:p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold cursor-pointer" onClick={() => setAnalysisStatus('welcome')}>AI 광고 영상 분석</h1>
        {analysisStatus === 'welcome' && (
          <div className="space-x-2">
            <Button disabled>수집 자동화 (개발중)</Button>
            <Button variant="secondary" onClick={() => setAnalysisStatus('input')}>링크 수동 추가</Button>
          </div>
        )}
      </div>

      {analysisStatus === 'input' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>분석할 영상 링크 입력</CardTitle>
              <p className="text-sm text-gray-500">엑셀/시트에서 데이터를 복사한 후, 아래 표의 시작할 셀을 클릭하고 붙여넣기 (Ctrl+V) 하세요.</p>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-auto">
                <Table>
                  <TableHeader><TableRow><TableHead className="w-[30%]">제목</TableHead><TableHead className="w-[50%]">영상 링크 (URL)</TableHead><TableHead className="w-[20%]">비고</TableHead></TableRow></TableHeader>
                  <TableBody onPaste={handlePaste}>
                    {videos.map((video, rowIndex) => (
                      <TableRow key={rowIndex}>
                        <TableCell onFocus={() => pasteStartCell.current = { rowIndex, colIndex: 0 }}>
                          <Input value={video.title} onChange={(e) => handleInputChange(rowIndex, 'title', e.target.value)} placeholder="영상 제목" />
                        </TableCell>
                        <TableCell onFocus={() => pasteStartCell.current = { rowIndex, colIndex: 1 }}>
                          <Input value={video.url} onChange={(e) => handleInputChange(rowIndex, 'url', e.target.value)} placeholder="https://youtube.com/watch?v=..." />
                        </TableCell>
                        <TableCell onFocus={( ) => pasteStartCell.current = { rowIndex, colIndex: 2 }}>
                          <Input value={video.notes} onChange={(e) => handleInputChange(rowIndex, 'notes', e.target.value)} placeholder="메모" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          <div className="text-center my-6"><Button onClick={handleAnalyze} size="lg">분석 시작</Button></div>
        </>
      )}

      {analysisStatus === 'loading' && (
        <div className="text-center my-20"><Loader2 className="mx-auto h-12 w-12 animate-spin" /><p className="mt-4 text-lg">영상 데이터를 분석 중입니다. 잠시만 기다려주세요...</p></div>
      )}

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
          <strong className="font-bold">오류 발생: </strong><span className="block sm:inline">{error}</span>
        </div>
      )}

      {analysisStatus === 'completed' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 flex flex-col gap-4">
            <Card><CardHeader><CardTitle className="flex items-center"><CheckCircle className="mr-2 text-green-500" /> 분석 완료 ({completedVideos.length})</CardTitle></CardHeader>
              <CardContent className="max-h-96 overflow-y-auto"><ul className="space-y-2">{completedVideos.map(item => (<li key={item.value.id} onClick={() => setSelectedVideo(item)} className={`p-2 rounded-md cursor-pointer hover:bg-gray-100 ${selectedVideo?.status === 'fulfilled' && selectedVideo.value.id === item.value.id ? 'bg-blue-100' : ''}`}>{item.value.title}</li>))}</ul></CardContent>
            </Card>
            <Card><CardHeader><CardTitle className="flex items-center"><AlertCircle className="mr-2 text-red-500" /> 분석 미완 ({failedVideos.length})</CardTitle></CardHeader>
              <CardContent className="max-h-96 overflow-y-auto"><ul className="space-y-2">{failedVideos.map(item => (<li key={item.reason.id} onClick={() => setSelectedVideo(item)} className={`p-2 rounded-md cursor-pointer hover:bg-gray-100 ${selectedVideo?.status === 'rejected' && selectedVideo.reason.id === item.reason.id ? 'bg-red-100' : ''}`}><p className="font-medium">{item.reason.title}</p><p className="text-xs text-red-600">{item.reason.error}</p></li>))}</ul></CardContent>
            </Card>
          </div>
          <div className="lg:col-span-2">{renderAnalysisDetail()}</div>
        </div>
      )}
    </main>
  );
}
