"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { migrateLocalDataToServer } from "@/lib/migrateLocalData";
import { useAuth } from "@/context/AuthContext";

// Runs the one-time localStorage → server migration after sign-in, then
// refreshes the affected queries so the moved data shows up immediately.
export function useMigrateLocalData() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const ran = useRef(false);

  useEffect(() => {
    // Scope the migration to the signed-in user (its done-flag is per-user), so
    // on a shared browser one doctor's sign-in doesn't consume another's.
    const userId = user?.id;
    if (!userId || ran.current) return;
    ran.current = true;
    migrateLocalDataToServer(userId)
      .then((moved) => {
        if (!moved) return;
        qc.invalidateQueries({ queryKey: ["templates"] });
        qc.invalidateQueries({ queryKey: ["prescription-layout"] });
        qc.invalidateQueries({ queryKey: ["patient"] });
      })
      .catch(() => {});
  }, [qc, user?.id]);
}
