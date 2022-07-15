-- CreateTable
CREATE TABLE "accounts" (
    "account" CHAR(65) NOT NULL PRIMARY KEY,
    "account_index" INTEGER NOT NULL,
    "balance" VARCHAR(39) NOT NULL DEFAULT '0',
    "wallet_id" CHAR(36) NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,
    CONSTRAINT "accounts_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_wallet_id_account_index_key" ON "accounts"("wallet_id", "account_index");
