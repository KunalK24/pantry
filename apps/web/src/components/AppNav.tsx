"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import SignOutButton from "@/components/SignOutButton";

const links = [
  { href: "/recipes", label: "Recipe library" },
  { href: "/meal-planner", label: "Meal planner" },
  { href: "/pantry", label: "Pantry" },
  { href: "/grocery-list", label: "Grocery list" },
];

const authLinks = [
  { href: "/sign-in", label: "Sign in" },
  { href: "/sign-up", label: "Sign up" },
];

type SessionStatus = "loading" | "signed-in" | "signed-out";

function isLinkActive(pathname: string, href: string) {
  if (href === "/recipes") {
    return (
      pathname === href ||
      pathname === "/recipes/new" ||
      /^\/recipes\/[^/]+\/edit\/?$/.test(pathname)
    );
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppNav() {
  const pathname = usePathname();
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("loading");

  useEffect(() => {
    const controller = new AbortController();

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
          signal: controller.signal,
        });

        setSessionStatus(response.ok ? "signed-in" : "signed-out");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setSessionStatus("signed-out");
      }
    }

    loadSession();

    return () => controller.abort();
  }, [pathname]);

  const visibleLinks =
    sessionStatus === "signed-in"
      ? links
      : sessionStatus === "signed-out"
        ? authLinks
        : [];

  return (
    <nav aria-label="Primary navigation">
      <ul className="flex flex-wrap gap-1">
        {visibleLinks.map((link) => {
          const isActive = isLinkActive(pathname, link.href);

          return (
            <li key={link.href}>
              <Link
                aria-current={isActive ? "page" : undefined}
                className={`block px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 dark:focus-visible:outline-zinc-100 ${
                  isActive
                    ? "bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950"
                    : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white"
                }`}
                href={link.href}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
        {sessionStatus === "signed-in" ? (
          <li>
            <SignOutButton />
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
