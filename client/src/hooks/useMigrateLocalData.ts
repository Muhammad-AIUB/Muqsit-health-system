"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { migrateLocalDataToServer } from "@/lib/migrateLocalData";

// Runs the one-time localStorage → server migration after sign-in, then
// refreshes the affected queries so the moved data shows up immediately.
export function useMigrateLocalData() {
  const qc = useQueryClient();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    migrateLocalDataToServer()
      .then((moved) => {
        if (!moved) return;
        qc.invalidateQueries({ queryKey: ["templates"] });
        qc.invalidateQueries({ queryKey: ["prescription-layout"] });
        qc.invalidateQueries({ queryKey: ["patient"] });
      })
      .catch(() => {});
  }, [qc]);
}
