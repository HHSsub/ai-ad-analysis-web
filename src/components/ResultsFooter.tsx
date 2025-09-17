"use client";

import DownloadExcelButton from "@/components/DownloadExcelButton";
import DriveUploadButton from "@/components/DriveUploadButton";

type Props = {
  results: any[]; // analyze API에서 받은 성공 결과들(value)
};

export default function ResultsFooter({ results }: Props) {
  // 성공한 값만 필터링해서 items로 넘기기
  const items = results
    .map((r: any) => (r?.status === "fulfilled" ? r.value : null))
    .filter(Boolean);

  const fileName = `ad-analysis-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return (
    <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
      <DownloadExcelButton items={items} fileName={fileName} workbookTitle="AI Ad Analysis" />
      <DriveUploadButton items={items} fileName={fileName} workbookTitle="AI Ad Analysis" />
    </div>
  );
}