"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

const BaseNavbar = () => {
  const pathname = usePathname();

  // Hide Navbar on:
  // 1. Auth (login, etc.) - Standalone auth pages
  // 2. Root ("/") - The main editor
  // 3. Projects Dashboard ("/projects") - Dashboard view
  // 4. Project Editor ("/projects/[id]") - Individual project
  const isAuth = pathname.startsWith("/auth");
  const isEditor =
    pathname === "/" ||
    pathname.startsWith("/projects") ||
    pathname.startsWith("/share") ||
    pathname.startsWith("/tools") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/estimator") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/pipeline");

  if (isAuth || isEditor) return null;

  return (
    <header className="container py-4">
      <Link href="/" className="inline-flex items-center">
        <Image
          src="/anc-logo-blue.png"
          alt="ANC Proposal Engine"
          width={120}
          height={34}
          className="h-8 w-auto"
          priority
        />
      </Link>
    </header>
  );
};

export default BaseNavbar;
