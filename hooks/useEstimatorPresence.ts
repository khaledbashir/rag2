"use client";

import { useState, useEffect, useRef } from "react";

interface PresenceMap {
  [proposalId: string]: Array<{ userName: string; userImage: string | null }>;
}

export function useEstimatorPresence() {
  const [presence, setPresence] = useState<PresenceMap>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/estimator/presence");
        if (res.ok) {
          const data = await res.json();
          setPresence(data);
        }
      } catch {}
    };

    poll();
    pollRef.current = setInterval(poll, 15_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  return presence;
}
