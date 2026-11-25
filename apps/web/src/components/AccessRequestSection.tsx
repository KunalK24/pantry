"use client";

import { useRef, useState, type SubmitEvent } from "react";

type RequestStatus =
  | { type: "error"; message: string }
  | { type: "success"; message: string }
  | null;

const inputClasses =
  "mt-1 w-full rounded-xl border border-[#d8d3c8] bg-white px-3 py-2.5 text-sm text-[#24342b] outline-none transition-colors focus:border-[#35644f] focus:ring-2 focus:ring-[#35644f]/15 disabled:cursor-not-allowed disabled:bg-[#f4f1e8]";

function requestErrorMessage(status: number) {
  if (status === 400) {
    return "Check your name, email, and reason, then try again.";
  }
  if (status === 429) {
    return "Too many requests. Please try again later.";
  }
  if (status === 503) {
    return "Access requests are temporarily unavailable. Please try again later.";
  }
  return "We couldn't send your request. Please try again.";
}

export default function AccessRequestSection() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLParagraphElement>(null);
  const submittingRef = useRef(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<RequestStatus>(null);

  function openDialog() {
    setStatus(null);
    dialogRef.current?.showModal();
    requestAnimationFrame(() => nameRef.current?.focus());
  }

  function closeDialog() {
    if (!submittingRef.current) {
      dialogRef.current?.close();
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedReason = reason.trim();
    if (trimmedName.length < 2 || trimmedReason.length < 10) {
      setStatus({
        type: "error",
        message: "Enter your name and at least 10 characters about why you want to try Pantry.",
      });
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setStatus(null);

    try {
      const response = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          reason: trimmedReason,
        }),
      });

      if (response.status === 202) {
        setStatus({
          type: "success",
          message: "Request received. If approved, you'll get an invitation link by email.",
        });
        setName("");
        setEmail("");
        setReason("");
        requestAnimationFrame(() => successRef.current?.focus());
        return;
      }

      setStatus({ type: "error", message: requestErrorMessage(response.status) });
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
    <section className="mt-5 w-full rounded-2xl border border-[#ded9cf] bg-white p-5 text-center shadow-[0_12px_30px_rgba(42,48,38,0.05)] sm:p-6">
      <h2 className="[font-family:Georgia,serif] text-xl font-bold text-[#24342b]">
        Interested in testing Pantry?
      </h2>
      <p className="mt-2 text-sm leading-6 text-[#6f7a71]">
        We&apos;re inviting a small group of early testers. Tell us how you&apos;d use it.
      </p>
      <button
        className="mt-4 min-h-11 rounded-xl border border-[#35644f] px-5 text-sm font-bold text-[#35644f] transition-colors hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
        onClick={openDialog}
        ref={triggerRef}
        type="button"
      >
        Request access
      </button>

      <dialog
        aria-describedby="access-request-disclaimer"
        aria-labelledby="access-request-title"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-[#ded9cf] bg-[#fbfaf6] p-0 text-left text-[#24342b] shadow-[0_24px_60px_rgba(42,48,38,0.18)] backdrop:bg-[#24342b]/35"
        onCancel={(event) => {
          if (submittingRef.current) {
            event.preventDefault();
          }
        }}
        onClose={() => triggerRef.current?.focus()}
        ref={dialogRef}
      >
        <div className="p-5 sm:p-7">
          <div className="mb-5 flex items-start justify-between gap-4">
            <h2
              className="[font-family:Georgia,serif] text-2xl font-bold"
              id="access-request-title"
            >
              Request access
            </h2>
            <button
              aria-label="Close access request"
              className="rounded-lg border border-[#ded9cf] bg-white px-3 py-2 text-sm font-bold text-[#35644f] hover:bg-[#edf3ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:opacity-60"
              disabled={isSubmitting}
              onClick={closeDialog}
              type="button"
            >
              Close
            </button>
          </div>

          <p
            className="mb-5 rounded-xl border border-[#e2d6b6] bg-[#faf5e6] p-4 text-sm leading-6 text-[#5d5037]"
            id="access-request-disclaimer"
          >
            Pantry is in very early testing. Features may change or break, and access
            is reviewed manually. Submitting a request does not guarantee an invitation.
          </p>

          {status?.type === "success" ? (
            <p
              className="rounded-xl border border-[#b6d5bd] bg-[#edf7ee] p-4 text-sm font-semibold text-[#285843]"
              ref={successRef}
              role="status"
              tabIndex={-1}
            >
              {status.message}
            </p>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <fieldset className="space-y-4" disabled={isSubmitting}>
                <legend className="sr-only">Your access request</legend>
                <div>
                  <label className="text-sm font-bold text-[#334238]" htmlFor="access-request-name">
                    Name
                  </label>
                  <input
                    autoComplete="name"
                    className={inputClasses}
                    id="access-request-name"
                    maxLength={120}
                    minLength={2}
                    name="name"
                    onChange={(event) => {
                      setStatus(null);
                      setName(event.target.value);
                    }}
                    ref={nameRef}
                    required
                    value={name}
                  />
                </div>
                <div>
                  <label className="text-sm font-bold text-[#334238]" htmlFor="access-request-email">
                    Email address
                  </label>
                  <input
                    autoComplete="email"
                    className={inputClasses}
                    id="access-request-email"
                    maxLength={254}
                    name="email"
                    onChange={(event) => {
                      setStatus(null);
                      setEmail(event.target.value);
                    }}
                    required
                    type="email"
                    value={email}
                  />
                </div>
                <div>
                  <label className="text-sm font-bold text-[#334238]" htmlFor="access-request-reason">
                    Why would you like to test Pantry?
                  </label>
                  <textarea
                    className={`${inputClasses} min-h-28 resize-y`}
                    id="access-request-reason"
                    maxLength={2000}
                    minLength={10}
                    name="reason"
                    onChange={(event) => {
                      setStatus(null);
                      setReason(event.target.value);
                    }}
                    required
                    value={reason}
                  />
                </div>
                <button
                  className="min-h-11 rounded-xl bg-[#35644f] px-5 text-sm font-bold text-white transition-colors hover:bg-[#2d5644] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f] disabled:cursor-not-allowed disabled:opacity-60"
                  type="submit"
                >
                  {isSubmitting ? "Sending request..." : "Send request"}
                </button>
              </fieldset>
              {status?.type === "error" ? (
                <p className="text-sm font-semibold text-[#9b4f40]" role="alert">
                  {status.message}
                </p>
              ) : null}
            </form>
          )}
        </div>
      </dialog>
    </section>
  );
}
