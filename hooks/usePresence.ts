"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface PresenceUser {
  userId: string;
  userName: string;
  userImage: string | null;
  lastSeenAt: string;
}

const HEARTBEAT_MS = 30_000;
const POLL_MS = 15_000;

export function usePresence(projectId: string | undefined) {
  const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Heartbeat: POST every 30s
  const heartbeat = useCallback(async () => {
    if (!projectId) return;
    try {
      await fetch(`/api/projects/${projectId}/presence`, { method: "POST" });
    } catch {}
  }, [projectId]);

  // Poll active users every 15s
  const poll = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/presence`);
      if (res.ok) {
        const data = await res.json();
        setActiveUsers(data.users || []);
      }
    } catch {}
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;

    // Initial heartbeat + poll
    heartbeat();
    poll();

    intervalRef.current = setInterval(heartbeat, HEARTBEAT_MS);
    pollRef.current = setInterval(poll, POLL_MS);

    // Cleanup on unmount
    const cleanup = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      // Best-effort cleanup with keepalive
      fetch(`/api/projects/${projectId}/presence`, { method: "DELETE", keepalive: true }).catch(() => {});
    };

    window.addEventListener("beforeunload", cleanup);

    return () => {
      cleanup();
      window.removeEventListener("beforeunload", cleanup);
      // Also try fetch DELETE
      fetch(`/api/projects/${projectId}/presence`, { method: "DELETE" }).catch(() => {});
    };
  }, [projectId, heartbeat, poll]);

  return { activeUsers };
}
