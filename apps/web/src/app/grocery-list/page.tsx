import { Suspense } from "react";
import Link from "next/link";

import GroceryList from "@/components/GroceryList";
import SignOutButton from "@/components/SignOutButton";

const navItems = [
  { href: "/recipes", label: "Recipe book", icon: "book", active: false },
  { href: "/pantry", label: "Pantry", icon: "pantry", active: false },
  { href: "/grocery-list", label: "Grocery list", icon: "list", active: true },
  {
    href: "/meal-planner",
    label: "Meal planner",
    icon: "calendar",
    active: false,
  },
];

function LeafMark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex items-center justify-center ${className}`}
    >
      <span className="h-5 w-3 rotate-45 rounded-[100%_0] border-2 border-current" />
      <span className="absolute h-4 w-px -rotate-45 bg-current" />
    </span>
  );
}

function NavIcon({ icon }: { icon: string }) {
  const base = "h-5 w-5 text-current";

  if (icon === "book") {
    return (
      <span aria-hidden="true" className={`${base} flex gap-0.5`}>
        <span className="h-5 w-2 rounded-l-sm border-2 border-current border-r-0" />
        <span className="h-5 w-2 rounded-r-sm border-2 border-current border-l-0" />
      </span>
    );
  }

  if (icon === "pantry") {
    return (
      <span
        aria-hidden="true"
        className={`${base} rounded-sm border-2 border-current before:mx-auto before:mt-1.5 before:block before:h-0.5 before:w-3 before:bg-current`}
      />
    );
  }

  if (icon === "calendar") {
    return (
      <span
        aria-hidden="true"
        className={`${base} rounded-sm border-2 border-current before:block before:h-1.5 before:border-b-2 before:border-current`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${base} flex flex-col justify-center gap-1`}
    >
      <span className="h-0.5 w-4 bg-current" />
      <span className="h-0.5 w-3 bg-current" />
      <span className="h-0.5 w-4 bg-current" />
    </span>
  );
}

export default function GroceryListPage() {
  return (
    <main className="min-h-dvh bg-[#fbfaf6] text-[#24342b]">
      <div className="grid min-h-dvh lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="border-b border-[#e5e1d8] bg-[#f4f1e8] px-5 py-5 lg:flex lg:min-h-dvh lg:flex-col lg:border-b-0 lg:border-r lg:px-5 lg:py-7">
          <div className="flex items-center justify-between gap-4 lg:block">
            <Link
              className="flex w-fit items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#35644f]"
              href="/recipes"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#35644f] text-white">
                <LeafMark className="h-5 w-5" />
              </span>
              <span className="[font-family:Georgia,serif] text-[1.8rem] font-bold tracking-normal text-[#24342b]">
                Pantry
              </span>
            </Link>
          </div>

          <nav aria-label="Primary navigation" className="mt-7 lg:mt-16">
            <p className="px-4 text-xs font-bold uppercase tracking-[0.18em] text-[#939c92]">
              Your kitchen
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    aria-current={item.active ? "page" : undefined}
                    className={`flex min-h-12 items-center gap-3 rounded-xl px-4 text-[0.9rem] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] ${
                      item.active
                        ? "bg-white text-[#285843] shadow-[0_14px_35px_rgba(42,48,38,0.08)]"
                        : "text-[#747f76] hover:bg-white/60 hover:text-[#285843]"
                    }`}
                    href={item.href}
                  >
                    <NavIcon icon={item.icon} />
                    <span>{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-8 grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] lg:mt-auto lg:block">
            <div className="flex items-center justify-between gap-3 rounded-2xl px-1 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e8f1e9] text-[#35644f]">
                  <LeafMark className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[#263129]">
                    Account
                  </p>
                  <p className="text-xs text-[#8b958c]">Signed in</p>
                </div>
              </div>
              <SignOutButton />
            </div>
          </div>
        </aside>

        <section className="min-w-0 px-5 py-8 sm:px-8 lg:px-10 lg:py-16 xl:px-12">
          <div className="mx-auto w-full max-w-[64rem]">
            <header className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c5745a]">
                  Next shop
                </p>
                <h1 className="mt-3 [font-family:Georgia,serif] text-[3rem] font-bold leading-none tracking-normal text-[#24342b] sm:text-[3.6rem]">
                  Grocery list
                </h1>
                <p className="mt-4 max-w-2xl text-lg leading-7 text-[#6f7a71]">
                  Build a shopping list from recipes and pantry items that are
                  running low.
                </p>
              </div>
            </header>

            <div className="mt-9">
              <Suspense
                fallback={
                  <p
                    className="border-y border-[#e5e1d8] py-6 text-sm font-semibold text-[#69736b]"
                    role="status"
                  >
                    Loading grocery list...
                  </p>
                }
              >
                <GroceryList />
              </Suspense>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
