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
  "mt-1 w-full border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition-colors focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 disabled:cursor-not-allowed disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20 dark:disabled:bg-zinc-900";

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
        <legend className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          Create account
        </legend>

        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Start a Pantry account for your recipes and meal planning.
        </p>

        <div>
          <label
            className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
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
            className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
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
            className="mt-2 text-xs text-zinc-500 dark:text-zinc-500"
            id="sign-up-password-hint"
          >
            Use at least 8 characters.
          </p>
        </div>

        <button
          className="h-11 bg-emerald-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400 dark:focus-visible:outline-emerald-400"
          type="submit"
        >
          {isSubmitting ? "Creating account..." : "Create account"}
        </button>
      </fieldset>

      {status ? (
        <p
          className="text-sm font-medium text-red-700 dark:text-red-400"
          role="alert"
        >
          {status.message}
        </p>
      ) : null}

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Already have an account?{" "}
        <Link
          className="font-medium text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-400"
          href="/sign-in"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
