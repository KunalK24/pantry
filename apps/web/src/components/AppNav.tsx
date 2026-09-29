"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/recipes/new", label: "Create recipe" },
  { href: "/recipes", label: "Recipe library" },
];

export default function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary navigation">
      <ul className="flex flex-wrap gap-1">
        {links.map((link) => {
          const isActive =
            link.href === "/recipes"
              ? pathname === link.href || pathname.includes("/edit")
              : pathname === link.href;

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
      </ul>
    </nav>
  );
}
