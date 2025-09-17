"use client";

import React from "react";

type Props = {
  items: any[]; // analyze API의 성공 결과 배열(value들)
  fileName?: string;
  workbookTitle?: string;
  className?: string;
};

export default function DownloadExcelButton({ items, fileName, workbookTitle, className }: Props) {
  const [loading, setLoading] = React.useState(false);

  const onClick = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/export/excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, fileName, workbookTitle }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "다운로드 실패");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || `analysis-${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e?.message || "엑셀 다운로드 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={onClick} disabled={loading} className={className}>
      {loading ? "엑셀 생성 중..." : "Excel 다운로드"}
    </button>
  );
}