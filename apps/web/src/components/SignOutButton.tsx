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
      className="block rounded-lg px-3 py-2 text-sm font-bold text-[#66746a] transition-colors hover:bg-white/60 hover:text-[#285843] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-60"
      disabled={isSubmitting}
      onClick={handleSignOut}
      type="button"
    >
      {isSubmitting ? "Signing out..." : "Sign out"}
    </button>
  );
}
