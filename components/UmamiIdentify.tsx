"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

declare global {
  interface Window {
    umami?: {
      identify: (data: Record<string, unknown>) => void;
    };
  }
}

export default function UmamiIdentify() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    const u = session?.user as
      | { id?: string; email?: string; name?: string; role?: string }
      | undefined;
    if (!u) return;

    const payload = {
      id: u.id || u.email || "",
      email: u.email || "",
      name: u.name || "",
      role: u.role || "",
    };

    if (window.umami?.identify) {
      window.umami.identify(payload);
      return;
    }

    let tries = 0;
    const interval = setInterval(() => {
      tries += 1;
      if (window.umami?.identify) {
        window.umami.identify(payload);
        clearInterval(interval);
      } else if (tries > 40) {
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [status, session?.user]);

  return null;
}
