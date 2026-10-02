import { Suspense } from "react";

import MealPlanner from "@/components/MealPlanner";

export default function MealPlannerPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          Meal planner
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Plan recipes for the week and add their ingredients to your grocery list.
        </p>
      </div>
      <Suspense
        fallback={
          <p className="text-sm text-zinc-600 dark:text-zinc-400" role="status">
            Loading meal planner...
          </p>
        }
      >
        <MealPlanner />
      </Suspense>
    </main>
  );
}
