import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

import { ApiError, postJson, postNoContent } from "@/api/client";

export type PublicUser = { id: string; email: string };
export type Session = { user: PublicUser; token: string; expiresAt: string };
type SignOutNotice = { kind: "confirmed" | "unconfirmed"; message: string };

type AuthContextValue = {
  session: Session | null;
  signOutNotice: SignOutNotice | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearSession: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isSignInResponse(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  if (!("user" in value) || typeof value.user !== "object" || value.user === null) return false;
  const user = value.user;
  return (
    "id" in user && typeof user.id === "string" &&
    "email" in user && typeof user.email === "string" &&
    "token" in value && typeof value.token === "string" && value.token.length > 0 &&
    "expiresAt" in value && typeof value.expiresAt === "string" &&
    Number.isFinite(Date.parse(value.expiresAt))
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [signOutNotice, setSignOutNotice] = useState<SignOutNotice | null>(null);

  async function signIn(email: string, password: string) {
    const result = await postJson(
      "/api/mobile/auth/sign-in",
      { email, password },
      isSignInResponse,
    );
    setSignOutNotice(null);
    setSession(result);
  }

  async function signOut() {
    if (!session) return;
    let notice: SignOutNotice = {
      kind: "confirmed",
      message: "Signed out on this device. The server session is no longer active.",
    };
    try {
      await postNoContent("/api/mobile/auth/sign-out", session.token);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        notice = {
          kind: "unconfirmed",
          message: "Signed out on this device. Server sign-out could not be confirmed, so this session may remain active until it expires.",
        };
      }
    } finally {
      setSignOutNotice(notice);
      setSession(null);
    }
  }

  const clearSession = useCallback(() => setSession(null), []);

  return (
    <AuthContext.Provider value={{ session, signOutNotice, signIn, signOut, clearSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider is missing");
  return context;
}
