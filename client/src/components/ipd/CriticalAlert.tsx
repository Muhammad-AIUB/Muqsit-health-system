"use client";

import { useIpdList } from "@/hooks/useIpd";

// A small flashing red emergency beacon shown in the top nav whenever any IPD
// patient is marked "Critical". Click it to jump to the IPD ward. Lives in the
// nav so it draws attention from every tab.
export default function CriticalAlert({ onClick }: { onClick: () => void }) {
  const { data: admissions = [] } = useIpdList();
  const count = admissions.filter((a) => a.status === "Critical").length;
  if (count === 0) return null;

  return (
    <>
      <style>{`@keyframes mhsSiren{0%,100%{box-shadow:0 0 0 0 rgba(226,75,74,.65);opacity:1}50%{box-shadow:0 0 0 7px rgba(226,75,74,0);opacity:.4}}@keyframes mhsBlink{0%,100%{opacity:1}50%{opacity:.45}}`}</style>
      <button
        onClick={onClick}
        title={`${count} critical patient${count > 1 ? "s" : ""} in IPD — click to view`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 8, padding: "3px 10px",
          borderRadius: 999, border: "1px solid #F2A6A6", background: "#FCEBEB", cursor: "pointer",
          fontFamily: "inherit", animation: "mhsBlink 1s infinite",
        }}
      >
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#E24B4A", display: "inline-block", animation: "mhsSiren 0.9s infinite" }} />
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "#A32D2D", letterSpacing: "0.03em", whiteSpace: "nowrap" }}>
          CRITICAL{count > 1 ? ` ×${count}` : ""}
        </span>
      </button>
    </>
  );
}
