import Link from "next/link";
import type { ReactNode } from "react";

import SignOutButton from "@/components/SignOutButton";

type Section = "recipes" | "pantry" | "grocery-list" | "meal-planner";

const sections: { href: string; label: string; key: Section }[] = [
  { href: "/recipes", label: "Recipe book", key: "recipes" },
  { href: "/pantry", label: "Pantry", key: "pantry" },
  { href: "/grocery-list", label: "Grocery list", key: "grocery-list" },
  { href: "/meal-planner", label: "Meal planner", key: "meal-planner" },
];

function LeafMark() {
  return (
    <span aria-hidden="true" className="relative inline-flex h-5 w-5 items-center justify-center">
      <span className="h-5 w-3 rotate-45 rounded-[100%_0] border-2 border-current" />
      <span className="absolute h-4 w-px -rotate-45 bg-current" />
    </span>
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
    <main className="min-h-dvh bg-[#fbfaf6] text-[#24342b]">
      <div className="grid min-h-dvh lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="border-b border-[#e5e1d8] bg-[#f4f1e8] lg:flex lg:min-h-dvh lg:flex-col lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3 px-5 py-3 lg:px-5 lg:py-7">
            <Link
              className="flex w-fit items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#35644f] lg:gap-3"
              href="/recipes"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#35644f] text-white lg:h-11 lg:w-11">
                <LeafMark />
              </span>
              <span className="[font-family:Georgia,serif] text-[1.5rem] font-bold text-[#24342b] lg:text-[1.8rem]">
                Pantry
              </span>
            </Link>
            <div className="lg:hidden"><SignOutButton /></div>
          </div>

          <nav aria-label="Primary navigation" className="overflow-x-auto px-3 pb-2 lg:mt-9 lg:overflow-visible lg:px-5 lg:pb-0">
            <p className="hidden px-4 text-xs font-bold uppercase tracking-[0.18em] text-[#939c92] lg:block">
              Your kitchen
            </p>
            <ul className="flex min-w-max gap-1 lg:mt-4 lg:grid lg:min-w-0 lg:gap-2">
              {sections.map((section) => {
                const isActive = section.key === activeSection;
                return (
                  <li key={section.key}>
                    <Link
                      aria-current={isActive ? "page" : undefined}
                      className={`flex min-h-10 items-center rounded-xl px-3 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] lg:min-h-12 lg:px-4 ${
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

          <div className="mt-auto hidden border-t border-[#e5e1d8] px-5 py-5 lg:block">
            <p className="px-3 text-xs font-semibold text-[#78837b]">Signed in</p>
            <SignOutButton />
          </div>
        </aside>

        <section className="min-w-0 px-5 py-7 sm:px-8 lg:px-10 lg:py-16 xl:px-12">
          {children}
        </section>
      </div>
    </main>
  );
}
