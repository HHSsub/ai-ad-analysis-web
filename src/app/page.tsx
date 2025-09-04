'use client';

import { useState, Fragment, ChangeEvent, ClipboardEvent } from 'react';

// --- 타입 정의 ---
type RowStatus = 'idle' | 'loading' | 'success' | 'error';

interface TableRow {
  id: number;
  title: string;
  videoUrl: string;
  notes: string;
  status: RowStatus;
  result?: any; // 분석 결과 저장
  error?: string; // 에러 메시지 저장
}

// 30개의 빈 행을 생성하는 함수
const createInitialRows = (count = 30): TableRow[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i,
    title: '',
    videoUrl: '',
    notes: '',
    status: 'idle',
  }));

export default function HomePage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [rows, setRows] = useState<TableRow[]>(createInitialRows());
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // --- 모달 열기/닫기 ---
  const openModal = () => {
    setRows(createInitialRows()); // 모달 열 때마다 테이블 초기화
    setIsAnalyzing(false);
    setIsModalOpen(true);
  };
  const closeModal = () => setIsModalOpen(false);

  // --- 테이블 값 변경 핸들러 ---
  const handleInputChange = (index: number, field: keyof TableRow, value: string) => {
    const newRows = [...rows];
    (newRows[index] as any)[field] = value;
    setRows(newRows);
  };

  // --- ✨ 엑셀 등에서 동시 붙여넣기 처리 핸들러 ✨ ---
  const handlePaste = (e: ClipboardEvent<HTMLInputElement>, startRow: number, startCol: number) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text');
    const pastedRows = pasteData.split('\n').map(row => row.split('\t'));

    const newRows = [...rows];
    pastedRows.forEach((row, rowIndex) => {
      const currentRowIndex = startRow + rowIndex;
      if (currentRowIndex < newRows.length) {
        row.forEach((cell, colIndex) => {
          const currentColIndex = startCol + colIndex;
          if (currentColIndex === 0) newRows[currentRowIndex].title = cell;
          if (currentColIndex === 1) newRows[currentRowIndex].videoUrl = cell;
          if (currentColIndex === 2) newRows[currentRowIndex].notes = cell;
        });
      }
    });
    setRows(newRows);
  };

  // --- ✨ 다중 영상 순차 분석 처리 핸들러 ✨ ---
  const handleBatchAnalysis = async () => {
    const targets = rows.filter(row => row.videoUrl.trim() !== '');
    if (targets.length === 0) {
      alert('분석할 영상 링크를 하나 이상 입력해주세요.');
      return;
    }

    setIsAnalyzing(true);

    for (const row of targets) {
      // 현재 분석 중인 행의 상태를 'loading'으로 변경
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, status: 'loading' } : r));

      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl: row.videoUrl }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || '분석 실패');
        }

        // 성공 시 상태 업데이트
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, status: 'success', result: data.data } : r));

      } catch (err: any) {
        // 실패 시 상태 업데이트
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, status: 'error', error: err.message } : r));
      }
    }
    setIsAnalyzing(false);
  };
  
  // --- 상태에 따른 아이콘 렌더링 ---
  const renderStatusIcon = (status: RowStatus) => {
    switch (status) {
      case 'loading':
        return <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500 mx-auto"></div>;
      case 'success':
        return <span className="text-green-500">✔</span>;
      case 'error':
        return <span className="text-red-500">✖</span>;
      default:
        return null;
    }
  };

  return (
    <Fragment>
      {/* --- 기존 메인 페이지 (완벽 유지) --- */}
      <main className="flex min-h-screen flex-col items-center justify-center p-24">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-extrabold">AI 광고 영상 분석</h1>
        </div>
        <div className="flex space-x-4">
          <button className="bg-gray-300 text-gray-500 font-bold py-4 px-8 rounded-lg cursor-not-allowed">
            수집 자동화 (개발중)
          </button>
          <button onClick={openModal} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-lg">
            링크 수동 추가
          </button>
        </div>
      </main>

      {/* --- ✨ 테이블 입력 방식의 모달 창 ✨ --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
            <div className="p-4 border-b">
              <h2 className="text-2xl font-bold">링크 수동 추가 (최대 30개)</h2>
              <p className="text-sm text-gray-600">엑셀, 구글 시트 등에서 여러 행을 복사하여 붙여넣기 할 수 있습니다.</p>
            </div>
            <div className="flex-grow overflow-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-700 uppercase bg-gray-100 sticky top-0">
                  <tr>
                    <th className="px-2 py-3 w-16 text-center">상태</th>
                    <th className="px-4 py-3">영상 제목</th>
                    <th className="px-4 py-3">영상 링크</th>
                    <th className="px-4 py-3">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={row.id} className="bg-white border-b hover:bg-gray-50">
                      <td className="px-2 py-2 text-center">{renderStatusIcon(row.status)}</td>
                      <td className="px-1 py-1">
                        <input type="text" value={row.title} onChange={(e) => handleInputChange(rowIndex, 'title', e.target.value)} onPaste={(e) => handlePaste(e, rowIndex, 0)} className="w-full p-2 border rounded"/>
                      </td>
                      <td className="px-1 py-1">
                        <input type="text" value={row.videoUrl} onChange={(e) => handleInputChange(rowIndex, 'videoUrl', e.target.value)} onPaste={(e) => handlePaste(e, rowIndex, 1)} className="w-full p-2 border rounded"/>
                      </td>
                      <td className="px-1 py-1">
                        <input type="text" value={row.notes} onChange={(e) => handleInputChange(rowIndex, 'notes', e.target.value)} onPaste={(e) => handlePaste(e, rowIndex, 2)} className="w-full p-2 border rounded"/>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t flex justify-between items-center">
              <button onClick={closeModal} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded">
                닫기
              </button>
              <button onClick={handleBatchAnalysis} disabled={isAnalyzing} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:bg-gray-400">
                {isAnalyzing ? '분석 진행 중...' : `분석 시작 (${rows.filter(r => r.videoUrl).length}개)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </Fragment>
  );
}
