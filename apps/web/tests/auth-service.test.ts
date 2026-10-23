import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSessionMock,
  createUserMock,
  deleteManySessionsMock,
  findSessionMock,
  findUserMock,
  scryptCallMock,
  transactionMock,
} = vi.hoisted(() => ({
  createSessionMock: vi.fn(),
  createUserMock: vi.fn(),
  deleteManySessionsMock: vi.fn(),
  findSessionMock: vi.fn(),
  findUserMock: vi.fn(),
  scryptCallMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("node:crypto", async (importOriginal) => {
  const crypto = await importOriginal<typeof import("node:crypto")>();
  return {
    ...crypto,
    scrypt: (
      password: string,
      salt: string,
      keyLength: number,
      callback: (error: Error | null, derivedKey: Buffer) => void,
    ) => {
      scryptCallMock(password, salt, keyLength);
      crypto.scrypt(password, salt, keyLength, callback);
    },
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: transactionMock,
    session: {
      create: createSessionMock,
      deleteMany: deleteManySessionsMock,
      findUnique: findSessionMock,
    },
    user: {
      create: createUserMock,
      findUnique: findUserMock,
    },
  },
}));

import { Prisma } from "@/generated/prisma/client";
import {
  EmailAlreadyRegisteredError,
  getSessionUser,
  hashSessionToken,
  InvalidCredentialsError,
  signIn,
  signOut,
  signUp,
} from "@/services/auth-service";

const user = {
  id: "cm12345678901234567890123",
  email: "cook@example.com",
};

function duplicateError() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "7.10.0",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  transactionMock.mockImplementation((operation) =>
    operation({
      user: { create: createUserMock },
      session: { create: createSessionMock },
    }),
  );
});

describe("signUp", () => {
  it("creates a user with a scrypt password hash and opaque session", async () => {
    createUserMock.mockResolvedValue(user);
    createSessionMock.mockResolvedValue({ id: "session-1" });

    const result = await signUp({
      email: user.email,
      password: "correct horse battery staple",
    });

    expect(result.user).toEqual(user);
    expect(result.session.token).toEqual(expect.any(String));
    expect(result.session.expiresAt).toBeInstanceOf(Date);
    expect(createUserMock).toHaveBeenCalledWith({
      data: {
        email: user.email,
        passwordHash: expect.stringMatching(/^scrypt\$/),
      },
      select: {
        id: true,
        email: true,
      },
    });
    expect(createUserMock.mock.calls[0][0].data.passwordHash).not.toContain(
      "correct horse battery staple",
    );
    expect(createSessionMock).toHaveBeenCalledWith({
      data: {
        userId: user.id,
        tokenHash: hashSessionToken(result.session.token),
        expiresAt: result.session.expiresAt,
      },
    });
    expect(transactionMock).toHaveBeenCalledOnce();
  });

  it("translates duplicate emails to a domain error", async () => {
    createUserMock.mockRejectedValue(duplicateError());

    await expect(
      signUp({
        email: user.email,
        password: "password123",
      }),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
  });

  it("propagates session creation failure from the signup transaction", async () => {
    const transactionUserCreate = vi.fn().mockResolvedValue(user);
    let didCommit = false;
    transactionMock.mockImplementation(async (operation) => {
      const result = await operation({
        user: { create: transactionUserCreate },
        session: { create: createSessionMock },
      });
      didCommit = true;
      return result;
    });
    createSessionMock.mockRejectedValue(new Error("Session write failed"));

    await expect(
      signUp({
        email: user.email,
        password: "password123",
      }),
    ).rejects.toThrow("Session write failed");
    expect(transactionMock).toHaveBeenCalledOnce();
    expect(transactionUserCreate).toHaveBeenCalledOnce();
    expect(createUserMock).not.toHaveBeenCalled();
    expect(didCommit).toBe(false);
  });
});

describe("signIn", () => {
  it("verifies credentials and creates a fresh session", async () => {
    createUserMock.mockResolvedValue(user);
    createSessionMock.mockResolvedValue({ id: "session-1" });
    await signUp({
      email: user.email,
      password: "password123",
    });
    const passwordHash = createUserMock.mock.calls[0][0].data.passwordHash;

    vi.clearAllMocks();
    findUserMock.mockResolvedValue({
      ...user,
      passwordHash,
    });
    createSessionMock.mockResolvedValue({ id: "session-2" });

    const result = await signIn({
      email: user.email,
      password: "password123",
    });

    expect(result.user).toEqual(user);
    expect(findUserMock).toHaveBeenCalledWith({
      where: {
        email: user.email,
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
      },
    });
    expect(createSessionMock).toHaveBeenCalledOnce();
  });

  it("uses a generic error for missing users", async () => {
    findUserMock.mockResolvedValue(null);

    await expect(
      signIn({
        email: user.email,
        password: "password123",
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(scryptCallMock).toHaveBeenCalledWith(
      "password123",
      "dummy-salt",
      64,
    );
  });

  it("uses a generic error for wrong passwords", async () => {
    createUserMock.mockResolvedValue(user);
    createSessionMock.mockResolvedValue({ id: "session-1" });
    await signUp({
      email: user.email,
      password: "password123",
    });
    const passwordHash = createUserMock.mock.calls[0][0].data.passwordHash;

    vi.clearAllMocks();
    findUserMock.mockResolvedValue({
      ...user,
      passwordHash,
    });

    await expect(
      signIn({
        email: user.email,
        password: "wrong-password",
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("rejects malformed stored password hashes without creating a session", async () => {
    findUserMock.mockResolvedValue({
      ...user,
      passwordHash: "scrypt$salt$invalid",
    });

    await expect(
      signIn({
        email: user.email,
        password: "password123",
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(createSessionMock).not.toHaveBeenCalled();
  });
});

describe("getSessionUser", () => {
  it("returns the public user for an active session token", async () => {
    findSessionMock.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      user,
    });

    await expect(getSessionUser("raw-token")).resolves.toEqual(user);
    expect(findSessionMock).toHaveBeenCalledWith({
      where: {
        tokenHash: hashSessionToken("raw-token"),
      },
      select: {
        expiresAt: true,
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });
  });

  it("deletes expired sessions and returns null", async () => {
    findSessionMock.mockResolvedValue({
      expiresAt: new Date(Date.now() - 60_000),
      user,
    });

    await expect(getSessionUser("raw-token")).resolves.toBeNull();
    expect(deleteManySessionsMock).toHaveBeenCalledWith({
      where: {
        tokenHash: hashSessionToken("raw-token"),
      },
    });
  });
});

describe("signOut", () => {
  it("deletes the hashed session token", async () => {
    await signOut("raw-token");

    expect(deleteManySessionsMock).toHaveBeenCalledWith({
      where: {
        tokenHash: hashSessionToken("raw-token"),
      },
    });
  });
});
