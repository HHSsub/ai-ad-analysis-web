"use client";

import React from "react";

type Props = {
  items: any[];
  fileName?: string;
  workbookTitle?: string;
  folderId?: string;
  className?: string;
};

export default function DriveUploadButton({ items, fileName, workbookTitle, folderId, className }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<{ id: string; webViewLink?: string } | null>(null);

  const onClick = async () => {
    try {
      setLoading(true);
      setResult(null);
      const res = await fetch("/api/drive/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, fileName, workbookTitle, folderId }),
      });

      const ct = res.headers.get("content-type") || "";
      let data: any;
      if (ct.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(text || "업로드 실패 (non-JSON 응답)");
      }

      if (!res.ok) {
        throw new Error(data?.message || "업로드 실패");
      }

      setResult({ id: data.id, webViewLink: data.webViewLink });
    } catch (e: any) {
      alert(e?.message || "드라이브 업로드 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className}>
      <button onClick={onClick} disabled={loading}>
        {loading ? "Drive 업로드 중..." : "Drive 업로드"}
      </button>
      {result && (
        <p style={{ marginTop: 8 }}>
          업로드 완료 (fileId: {result.id})
          {result.webViewLink ? (
            <>
              {" "}- <a href={result.webViewLink} target="_blank" rel="noreferrer">열기</a>
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}