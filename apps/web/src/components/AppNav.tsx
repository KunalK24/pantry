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
    return pathname === href || pathname.startsWith(`${href}/`);
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
                className={`block rounded-lg px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] ${
                  isActive
                    ? "bg-white text-[#285843] shadow-[0_8px_20px_rgba(42,48,38,0.06)]"
                    : "text-[#66746a] hover:bg-white/60 hover:text-[#285843]"
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
