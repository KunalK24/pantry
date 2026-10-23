import {
  scrypt as scryptCallback,
  timingSafeEqual,
  randomBytes,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { type SignInInput, type SignUpInput } from "@/schemas/auth";

const scrypt = promisify(scryptCallback);

const PASSWORD_KEY_LENGTH = 64;
const SESSION_TOKEN_BYTES = 32;
const DUMMY_PASSWORD_HASH =
  "scrypt$dummy-salt$1APtKtunlZ35LvSzrJ5eGZgsxdo8-I5tXSX9kdk615DDcgd4Scev-KPn2J8KVITmyVat2GKQtA0BWNf8ACKG9w";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const userSelect = {
  id: true,
  email: true,
} as const;

export type PublicUser = {
  id: string;
  email: string;
};

export type CreatedSession = {
  token: string;
  expiresAt: Date;
};

export class EmailAlreadyRegisteredError extends Error {
  constructor(email: string) {
    super(`Email ${email} is already registered`);
    this.name = "EmailAlreadyRegisteredError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password");
    this.name = "InvalidCredentialsError";
  }
}

function isKnownPrismaError(error: unknown, code: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

async function hashPassword(
  password: string,
  salt = randomBytes(16).toString("base64url"),
) {
  const derivedKey = (await scrypt(
    password,
    salt,
    PASSWORD_KEY_LENGTH,
  )) as Buffer;

  return `scrypt$${salt}$${derivedKey.toString("base64url")}`;
}

async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, hash] = storedHash.split("$");

  if (algorithm !== "scrypt" || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, "base64url");
  if (
    expected.length !== PASSWORD_KEY_LENGTH ||
    expected.toString("base64url") !== hash
  ) {
    return false;
  }
  const actual = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

async function createSession(
  userId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<CreatedSession> {
  const token = randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await client.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
    },
  });

  return {
    token,
    expiresAt,
  };
}

export async function signUp(input: SignUpInput) {
  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    let user: PublicUser;
    try {
      user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
        },
        select: userSelect,
      });
    } catch (error) {
      if (isKnownPrismaError(error, "P2002")) {
        throw new EmailAlreadyRegisteredError(input.email);
      }
      throw error;
    }
    const session = await createSession(user.id, tx);

    return { user, session };
  });
}

export async function signIn(input: SignInInput) {
  const user = await prisma.user.findUnique({
    where: {
      email: input.email,
    },
    select: {
      id: true,
      email: true,
      passwordHash: true,
    },
  });

  const isPasswordValid = await verifyPassword(
    input.password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );
  if (!user || !isPasswordValid) {
    throw new InvalidCredentialsError();
  }

  const session = await createSession(user.id);

  return {
    user: {
      id: user.id,
      email: user.email,
    },
    session,
  };
}

export async function getSessionUser(
  token: string,
): Promise<PublicUser | null> {
  const session = await prisma.session.findUnique({
    where: {
      tokenHash: hashSessionToken(token),
    },
    select: {
      expiresAt: true,
      user: {
        select: userSelect,
      },
    },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt <= new Date()) {
    await prisma.session.deleteMany({
      where: {
        tokenHash: hashSessionToken(token),
      },
    });

    return null;
  }

  return session.user;
}

export async function signOut(token: string) {
  await prisma.session.deleteMany({
    where: {
      tokenHash: hashSessionToken(token),
    },
  });
}
