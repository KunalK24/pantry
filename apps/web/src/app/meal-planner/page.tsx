import { Suspense } from "react";

import MealPlanner from "@/components/MealPlanner";
import SignedInShell from "@/components/SignedInShell";

export default function MealPlannerPage() {
  return (
    <SignedInShell activeSection="meal-planner">
      <div className="mx-auto w-full max-w-[64rem]">
        <header>
          <h1 className="[font-family:Georgia,serif] text-[3rem] font-bold leading-none tracking-normal text-[#24342b] sm:text-[3.6rem]">
            Meal planner
          </h1>
        </header>
        <div className="mt-9">
          <Suspense
            fallback={
              <p
                className="border-y border-[#e5e1d8] py-6 text-sm font-semibold text-[#69736b]"
                role="status"
              >
                Loading meal planner...
              </p>
            }
          >
            <MealPlanner />
          </Suspense>
        </div>
      </div>
    </SignedInShell>
  );
}
