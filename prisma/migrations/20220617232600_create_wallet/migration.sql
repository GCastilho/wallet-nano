-- CreateTable
CREATE TABLE "Wallet" (
    "id" CHAR(36) NOT NULL PRIMARY KEY,
    "seed" VARCHAR(128) NOT NULL,
    "mnemonic" TEXT NOT NULL,
    "representative" VARCHAR(65),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL
);
