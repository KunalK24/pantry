CREATE TABLE "ApprovedEmail" (
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "tokenUsedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovedEmail_pkey" PRIMARY KEY ("email")
);

CREATE UNIQUE INDEX "ApprovedEmail_tokenHash_key" ON "ApprovedEmail"("tokenHash");
