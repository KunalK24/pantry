"use client";

import { usePathname } from "next/navigation";
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
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <span className="text-lg font-semibold">Pantry</span>
            <AppNav />
          </div>
        </header>
      )}
      {children}
    </>
  );
}
