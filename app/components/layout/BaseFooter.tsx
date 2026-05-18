"use client";

import { usePathname } from "next/navigation";

const BaseFooter = () => {
  const pathname = usePathname();
  if (pathname?.startsWith("/auth") || pathname?.startsWith("/estimator") || pathname?.startsWith("/catalog")) return null;
  return (
    <footer className="container py-6 text-center text-sm text-muted-foreground">
      <p>
        © 2026 ANC Sports Proposal Engine. All rights reserved.
      </p>
    </footer>
  );
};

export default BaseFooter;
