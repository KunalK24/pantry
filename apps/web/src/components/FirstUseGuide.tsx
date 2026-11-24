"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { markGuideComplete } from "@/lib/first-use-guide";

const GUIDE_ACTIVE_KEY = "pantry.first-use-guide.active";

const steps = [
  {
    href: "/recipes",
    title: "Import a recipe",
    target: "recipes",
    actions: [
      { control: "Import recipe", detail: "Open the import dialog in your Recipe book." },
      { control: "Text · Image · URL", detail: "Choose how to import, then paste text, upload an image, or enter a recipe link." },
      { control: "Review recipe → Save recipe", detail: "Check the converted recipe and save it to your book." },
    ],
  },
  {
    href: "/pantry",
    title: "Add what you have",
    target: "pantry",
    actions: [
      { control: "Import from image", detail: "Upload a photo of your groceries on the Pantry page." },
      { control: "Review items", detail: "Check the suggested names and quantities. Edit or remove anything that looks wrong." },
      { control: "Save selected items", detail: "Add the checked items to your pantry." },
    ],
  },
  {
    href: "/meal-planner",
    title: "Plan a meal",
    target: "meal-planner",
    actions: [
      { control: "+ Add", detail: "Find a day and meal type, such as dinner, then open its recipe picker." },
      { control: "Add", detail: "Choose a recipe from your Recipe book for that slot." },
      { control: "Save plan", detail: "Save your week. Add week to grocery list can send those meals to a list." },
    ],
  },
  {
    href: "/grocery-list",
    title: "Make a grocery list",
    target: "grocery-list",
    actions: [
      { control: "+ New list", detail: "Name a list for your next shopping trip, then select Create." },
      { control: "+ Add item", detail: "Type an item, or choose from your pantry and recipes." },
      { control: "Save list", detail: "Save your changes, then check off items as you shop." },
    ],
  },
] as const;

type FirstUseGuideProps = {
  section: (typeof steps)[number]["href"];
};

export default function FirstUseGuide({ section }: FirstUseGuideProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const timerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const highlightedRef = useRef<HTMLElement | null>(null);
  const previousPathRef = useRef<string | null>(null);
  const previousRequestRef = useRef(false);
  const [isActive, setIsActive] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<
    "idle" | "locating" | "highlighted" | "disabled" | "unavailable"
  >("idle");
  const isGuideRequested = searchParams.get("guide") === "1";
  const stepIndex = steps.findIndex((step) => step.href === section);
  const step = steps[stepIndex];
  const previousStep = steps[stepIndex - 1];
  const nextStep = steps[stepIndex + 1];
  const exitParams = new URLSearchParams(searchParams.toString());
  exitParams.delete("guide");
  const exitQuery = exitParams.toString();
  const exitHref = exitQuery ? `${pathname}?${exitQuery}` : pathname;

  useEffect(() => {
    let isStoredActive = false;

    try {
      isStoredActive = window.sessionStorage.getItem(GUIDE_ACTIVE_KEY) === "true";
      if (isGuideRequested) {
        window.sessionStorage.setItem(GUIDE_ACTIVE_KEY, "true");
      }
    } catch {
      // The URL still opens the guide when session storage is unavailable.
    }

    const shouldShow = isGuideRequested || isStoredActive;
    const isNewPage = previousPathRef.current !== pathname;
    const isNewRequest = isGuideRequested && !previousRequestRef.current;

    previousPathRef.current = pathname;
    previousRequestRef.current = isGuideRequested;

    let isCurrent = true;
    queueMicrotask(() => {
      if (!isCurrent) {
        return;
      }

      setIsActive(shouldShow);
      if (shouldShow && (isNewPage || isNewRequest)) {
        setIsOpen(true);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [isGuideRequested, pathname]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }

    return () => {
      if (dialog.open) {
        dialog.close();
      }
    };
  }, [isActive, isOpen]);

  useEffect(() => () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }
    highlightedRef.current?.classList.remove("first-use-guide-highlight");
  }, []);

  async function saveCompletion() {
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const payload: unknown = await response.json();
      if (
        typeof payload === "object" &&
        payload !== null &&
        "user" in payload &&
        typeof payload.user === "object" &&
        payload.user !== null &&
        "id" in payload.user &&
        typeof payload.user.id === "string"
      ) {
        markGuideComplete(payload.user.id);
      }
    } catch {
      // The guide can close even if completion cannot be saved.
    }
  }

  function finishGuide() {
    try {
      window.sessionStorage.removeItem(GUIDE_ACTIVE_KEY);
    } catch {
      // The current page can still close the guide.
    }

    setIsActive(false);
    setIsOpen(false);
    void saveCompletion();
  }

  function showActualControl() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }
    highlightedRef.current?.classList.remove("first-use-guide-highlight");
    highlightedRef.current = null;
    dialogRef.current?.close();
    setIsOpen(false);
    setTargetStatus("locating");

    const startedAt = Date.now();
    function focusControl() {
      const targets = document.querySelectorAll<HTMLElement>(
        `[data-first-use-target="${step.target}"]`,
      );
      const target = Array.from(targets).find(
        (element) => element.getClientRects().length > 0,
      );

      if (!target) {
        if (Date.now() - startedAt < 15000) {
          timerRef.current = window.setTimeout(focusControl, 250);
        } else {
          setTargetStatus("unavailable");
        }
        return;
      }

      setTargetStatus(target.matches(":disabled") ? "disabled" : "highlighted");
      highlightedRef.current = target;
      target.classList.add("first-use-guide-highlight");
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      target.focus({ preventScroll: true });
      timerRef.current = window.setTimeout(() => {
        target.classList.remove("first-use-guide-highlight");
        if (highlightedRef.current === target) {
          highlightedRef.current = null;
        }
        setTargetStatus("idle");
      }, 15000);
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = window.requestAnimationFrame(focusControl);
    });
  }

  if (!isActive) {
    return null;
  }

  return (
    <>
      <dialog
        aria-describedby="first-use-guide-description"
        aria-labelledby="first-use-guide-title"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-[1.5rem] border border-[#d6dfd3] bg-[#fbfaf6] p-0 text-[#24342b] shadow-[0_28px_80px_rgba(24,42,29,0.25)] backdrop:bg-[#182c20]/55"
        onCancel={(event) => {
          event.preventDefault();
          setIsOpen(false);
        }}
        ref={dialogRef}
      >
        <div className="border-b border-[#e5e1d8] bg-[#edf4ea] px-5 py-5 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#35644f]">
                Pantry guide · {stepIndex + 1} of {steps.length}
              </p>
              <h2 className="mt-2 [font-family:Georgia,serif] text-3xl font-bold leading-tight" id="first-use-guide-title">
                {step.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#526558]" id="first-use-guide-description">
                Follow these steps on the Pantry page behind this guide.
              </p>
            </div>
            <button
              aria-label="Close guide instructions"
              className="rounded-lg px-2 py-1 text-lg font-bold text-[#35644f] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
              onClick={() => setIsOpen(false)}
              type="button"
            >
              ×
            </button>
          </div>
          <ol aria-label="Guide progress" className="mt-5 flex gap-1.5">
            {steps.map((item, index) => (
              <li
                aria-current={index === stepIndex ? "step" : undefined}
                className={`h-1.5 flex-1 rounded-full ${index <= stepIndex ? "bg-[#35644f]" : "bg-[#c5d8c7]"}`}
                key={item.href}
              >
                <span className="sr-only">{item.title}</span>
              </li>
            ))}
          </ol>
        </div>

        <ol className="space-y-3 px-5 py-5 sm:px-7">
          {step.actions.map((action, index) => (
            <li className="flex gap-4 rounded-xl border border-[#e2e4da] bg-white p-4" key={action.control}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#35644f] text-sm font-bold text-white">
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-bold text-[#285843]">{action.control}</p>
                <p className="mt-1 text-sm leading-6 text-[#526558]">{action.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e1d8] px-5 py-4 sm:px-7">
          <Link
            className="text-sm font-bold text-[#35644f] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
            href={exitHref}
            onClick={finishGuide}
          >
            Skip guide
          </Link>
          <div className="flex flex-wrap gap-2">
            {previousStep ? (
              <Link
                className="inline-flex min-h-10 items-center rounded-xl border border-[#c5d8c7] px-4 text-sm font-bold text-[#35644f] hover:bg-[#edf4ea] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
                href={`${previousStep.href}?guide=1`}
              >
                Back
              </Link>
            ) : null}
            <button
              className="min-h-10 rounded-xl border border-[#35644f] px-4 text-sm font-bold text-[#35644f] hover:bg-[#edf4ea] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
              onClick={showActualControl}
              type="button"
            >
              Show me on the page
            </button>
            {nextStep ? (
              <Link
                className="inline-flex min-h-10 items-center rounded-xl bg-[#35644f] px-4 text-sm font-bold text-white hover:bg-[#2d5644] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
                href={`${nextStep.href}?guide=1`}
              >
                Next: {nextStep.title}
              </Link>
            ) : (
              <Link
                className="inline-flex min-h-10 items-center rounded-xl bg-[#35644f] px-4 text-sm font-bold text-white hover:bg-[#2d5644] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
                href={exitHref}
                onClick={finishGuide}
              >
                Finish guide
              </Link>
            )}
          </div>
        </div>
      </dialog>

      {!isOpen ? (
        <aside aria-label="Pantry guide controls" className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-[#c5d8c7] bg-white p-3 text-[#24342b] shadow-[0_16px_45px_rgba(24,42,29,0.2)] sm:bottom-6 sm:right-6">
          <span className="px-1 text-xs font-bold text-[#526558]">Guide {stepIndex + 1} of {steps.length}</span>
          {targetStatus === "locating" ? <span className="text-xs text-[#526558]" role="status">Finding the control...</span> : null}
          {targetStatus === "highlighted" ? <span className="text-xs text-[#526558]" role="status">Highlighted: {step.actions[0].control}</span> : null}
          {targetStatus === "disabled" ? (
            <span className="text-xs text-[#9b4f40]" role="status">
              {section === "/meal-planner"
                ? "Add a recipe first to enable this control."
                : "This control is temporarily unavailable."}
            </span>
          ) : null}
          {targetStatus === "unavailable" ? <span className="text-xs text-[#9b4f40]" role="status">Control unavailable. Try again shortly.</span> : null}
          <button
            className="min-h-10 rounded-xl border border-[#c5d8c7] px-3 text-sm font-bold text-[#35644f] hover:bg-[#edf4ea] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
            onClick={() => setIsOpen(true)}
            type="button"
          >
            Instructions
          </button>
          {nextStep ? (
            <Link
              className="inline-flex min-h-10 items-center rounded-xl bg-[#35644f] px-3 text-sm font-bold text-white hover:bg-[#2d5644] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
              href={`${nextStep.href}?guide=1`}
            >
              Next: {nextStep.title}
            </Link>
          ) : (
            <Link
              className="inline-flex min-h-10 items-center rounded-xl bg-[#35644f] px-3 text-sm font-bold text-white hover:bg-[#2d5644] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#35644f]"
              href={exitHref}
              onClick={finishGuide}
            >
              Finish guide
            </Link>
          )}
        </aside>
      ) : null}
    </>
  );
}
