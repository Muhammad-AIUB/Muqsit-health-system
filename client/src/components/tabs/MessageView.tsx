"use client";

import { C } from "@/theme";

export default function MessageView() {
  return (
    <div style={{ textAlign: "center", padding: 60, color: C.n[500] }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>◈</div>
      <div style={{ fontSize: 16, fontWeight: 500, color: C.n[800] }}>Message</div>
      <div style={{ fontSize: 12, marginTop: 4 }}>End-to-end encrypted doctor-patient messaging</div>
    </div>
  );
}
