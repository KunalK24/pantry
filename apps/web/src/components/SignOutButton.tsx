"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export default function SignOutButton() {
  const router = useRouter();
  const submittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignOut() {
    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
      router.push("/sign-in");
      router.refresh();
    }
  }

  return (
    <button
      className="block px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white dark:focus-visible:outline-zinc-100"
      disabled={isSubmitting}
      onClick={handleSignOut}
      type="button"
    >
      {isSubmitting ? "Signing out..." : "Sign out"}
    </button>
  );
}
