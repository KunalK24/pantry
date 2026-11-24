const GUIDE_COMPLETE_PREFIX = "pantry.first-use-guide.complete.";

export function postAuthDestination(payload: unknown, forceGuide = false) {
  if (forceGuide) {
    return "/recipes?guide=1";
  }

  const userId =
    typeof payload === "object" &&
    payload !== null &&
    "user" in payload &&
    typeof payload.user === "object" &&
    payload.user !== null &&
    "id" in payload.user &&
    typeof payload.user.id === "string"
      ? payload.user.id
      : null;

  if (!userId) {
    return "/recipes?guide=1";
  }

  try {
    if (window.localStorage.getItem(`${GUIDE_COMPLETE_PREFIX}${userId}`) === "true") {
      return "/recipes";
    }
  } catch {
    // The guide remains available when browser storage is disabled.
  }

  return "/recipes?guide=1";
}

export function markGuideComplete(userId: string) {
  try {
    window.localStorage.setItem(`${GUIDE_COMPLETE_PREFIX}${userId}`, "true");
  } catch {
    // Finishing the guide should still work when browser storage is disabled.
  }
}
