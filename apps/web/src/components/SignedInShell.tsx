import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import FirstUseGuide from "@/components/FirstUseGuide";
import SignOutButton from "@/components/SignOutButton";

type Section = "recipes" | "pantry" | "grocery-list" | "meal-planner";

const sections: { href: string; label: string; key: Section }[] = [
  { href: "/recipes", label: "Recipe book", key: "recipes" },
  { href: "/pantry", label: "Pantry", key: "pantry" },
  { href: "/grocery-list", label: "Grocery list", key: "grocery-list" },
  { href: "/meal-planner", label: "Meal planner", key: "meal-planner" },
];

function CookingPotMark() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M4 10h16" />
      <path d="M6 10v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8" />
      <path d="M5 10V9a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1" />
      <path d="M10 4h4" />
      <path d="M12 4v3" />
    </svg>
  );
}

export default function SignedInShell({
  activeSection,
  children,
}: {
  activeSection: Section;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[#fbfaf6] text-[#24342b]">
      <header className="sticky top-0 z-30 border-b border-[#e5e1d8] bg-[#f4f1e8]">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 sm:px-8 lg:flex-nowrap lg:px-10 xl:px-12">
          <Link
            className="flex w-full items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#35644f] lg:w-auto lg:shrink-0"
            href="/recipes"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#35644f] text-white">
              <CookingPotMark />
            </span>
            <span className="[font-family:Georgia,serif] text-[2rem] font-bold text-[#24342b]">
              Pantry
            </span>
          </Link>

          <nav aria-label="Primary navigation" className="min-w-0 flex-1 overflow-x-auto">
            <ul className="flex min-w-max gap-1 lg:justify-end lg:gap-2">
              {sections.map((section) => {
                const isActive = section.key === activeSection;
                return (
                  <li key={section.key}>
                    <Link
                      aria-current={isActive ? "page" : undefined}
                      className={`flex min-h-10 items-center rounded-xl px-3 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] lg:min-h-11 ${
                        isActive
                          ? "bg-white text-[#285843] shadow-[0_8px_20px_rgba(42,48,38,0.06)]"
                          : "text-[#66746a] hover:bg-white/60 hover:text-[#285843]"
                      }`}
                      href={section.href}
                    >
                      {section.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              className="rounded-lg px-3 py-2 text-sm font-bold text-[#35644f] transition-colors hover:bg-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
              href="/recipes?guide=1"
            >
              How to use Pantry
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="min-w-0 px-5 py-7 sm:px-8 lg:px-10 lg:py-10 xl:px-12">
        <Suspense fallback={null}>
          <FirstUseGuide section={`/${activeSection}`} />
        </Suspense>
        {children}
      </main>
    </div>
  );
}
