import { Suspense } from "react";

import GroceryList from "@/components/GroceryList";
import SignedInShell from "@/components/SignedInShell";

export default function GroceryListPage() {
  return (
    <SignedInShell activeSection="grocery-list">
      <div className="mx-auto w-full max-w-[82rem]">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c5745a]">
            Plan your shop
          </p>
          <h1 className="mt-3 [font-family:Georgia,serif] text-[3rem] font-bold leading-none tracking-normal text-[#24342b] sm:text-[3.6rem]">
            Grocery lists
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-7 text-[#6f7a71]">
            Keep every shopping trip organized. Build a list by typing items or
            adding them from your pantry and recipes.
          </p>
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
    </SignedInShell>
  );
}
