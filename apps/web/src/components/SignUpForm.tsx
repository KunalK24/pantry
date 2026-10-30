"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type SubmitEvent } from "react";

type AuthStatus = {
  type: "error";
  message: string;
} | null;

function authErrorMessage(payload: unknown, status: number) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  if (status === 409) {
    return "That email is already registered.";
  }

  return "Unable to create your account. Please try again.";
}

const inputClasses =
  "mt-1 w-full rounded-xl border border-[#d8d3c8] bg-white px-3 py-2.5 text-sm text-[#24342b] outline-none transition-colors focus:border-[#35644f] focus:ring-2 focus:ring-[#35644f]/15 disabled:cursor-not-allowed disabled:bg-[#f4f1e8]";

export default function SignUpForm() {
  const router = useRouter();
  const submittingRef = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<AuthStatus>(null);

  function updateField(setter: (value: string) => void, value: string) {
    setStatus(null);
    setter(value);
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submittingRef.current) {
      return;
    }

    setStatus(null);

    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setStatus({
        type: "error",
        message: "Enter an email and password to create your account.",
      });
      return;
    }

    if (password.length < 8) {
      setStatus({
        type: "error",
        message: "Password must be at least 8 characters.",
      });
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password }),
      });

      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        setStatus({
          type: "error",
          message: authErrorMessage(payload, response.status),
        });
        return;
      }

      router.push("/recipes");
      router.refresh();
    } catch {
      setStatus({
        type: "error",
        message: "Unable to reach the server. Please try again.",
      });
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <form className="w-full space-y-6" onSubmit={handleSubmit}>
      <fieldset className="space-y-6" disabled={isSubmitting}>
        <legend className="[font-family:Georgia,serif] text-3xl font-bold text-[#24342b]">
          Create account
        </legend>

        <p className="text-sm text-[#6f7a71]">
          Start a Pantry account for your recipes and meal planning.
        </p>

        <div>
          <label
            className="text-sm font-bold text-[#334238]"
            htmlFor="sign-up-email"
          >
            Email
          </label>
          <input
            autoComplete="email"
            className={inputClasses}
            id="sign-up-email"
            name="email"
            onChange={(event) => updateField(setEmail, event.target.value)}
            required
            type="email"
            value={email}
          />
        </div>

        <div>
          <label
            className="text-sm font-bold text-[#334238]"
            htmlFor="sign-up-password"
          >
            Password
          </label>
          <input
            aria-describedby="sign-up-password-hint"
            autoComplete="new-password"
            className={inputClasses}
            id="sign-up-password"
            minLength={8}
            name="password"
            onChange={(event) => updateField(setPassword, event.target.value)}
            required
            type="password"
            value={password}
          />
          <p
            className="mt-2 text-xs text-[#6f7a71]"
            id="sign-up-password-hint"
          >
            Use at least 8 characters.
          </p>
        </div>

        <button
          className="min-h-11 rounded-xl bg-[#35644f] px-5 text-sm font-bold text-white transition-colors hover:bg-[#2d5644] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
        >
          {isSubmitting ? "Creating account..." : "Create account"}
        </button>
      </fieldset>

      {status ? (
        <p
          className="text-sm font-semibold text-[#9b4f40]"
          role="alert"
        >
          {status.message}
        </p>
      ) : null}

      <p className="text-sm text-[#6f7a71]">
        Already have an account?{" "}
        <Link
          className="font-bold text-[#35644f] underline-offset-4 hover:underline"
          href="/sign-in"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
