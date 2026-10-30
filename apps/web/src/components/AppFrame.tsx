"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";

import AppNav from "@/components/AppNav";

export default function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const normalizedPathname =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  const hideHeader =
    normalizedPathname === "/recipes" ||
    normalizedPathname.startsWith("/recipes/") ||
    normalizedPathname === "/pantry" ||
    normalizedPathname.startsWith("/pantry/") ||
    normalizedPathname === "/grocery-list" ||
    normalizedPathname === "/meal-planner";

  return (
    <>
      {hideHeader ? null : (
        <header className="border-b border-[#e5e1d8] bg-[#f4f1e8] text-[#24342b]">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 sm:px-8">
            <Link className="[font-family:Georgia,serif] text-2xl font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]" href="/recipes">Pantry</Link>
            <AppNav />
          </div>
        </header>
      )}
      {children}
    </>
  );
}
