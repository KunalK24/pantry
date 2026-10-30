"use client";

import { useState } from "react";

import CreatePantryItemDialog from "@/components/CreatePantryItemDialog";
import ExtractionPantryDialog from "@/components/ExtractionPantryDialog";
import PantryLibrary from "@/components/PantryLibrary";
import SignedInShell from "@/components/SignedInShell";

export default function PantryPage() {
  const [refreshSignal, setRefreshSignal] = useState(0);

  function refreshPantry() {
    setRefreshSignal((current) => current + 1);
  }

  return (
    <SignedInShell activeSection="pantry">
      <div className="mx-auto w-full max-w-[64rem]">
        <header className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c5745a]">
              At home
            </p>
            <h1 className="mt-3 [font-family:Georgia,serif] text-[3rem] font-bold leading-none tracking-normal text-[#24342b] sm:text-[3.6rem]">
              Your pantry
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-7 text-[#6f7a71]">
              A simple view of what is on hand, so good food gets used and less
              gets forgotten.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 lg:justify-end">
            <ExtractionPantryDialog onPantryItemsCreated={refreshPantry} />
            <CreatePantryItemDialog onPantryItemCreated={refreshPantry} />
          </div>
        </header>

        <div className="mt-9">
          <PantryLibrary
            onPantryItemCreated={refreshPantry}
            refreshSignal={refreshSignal}
          />
        </div>
      </div>
    </SignedInShell>
  );
}
