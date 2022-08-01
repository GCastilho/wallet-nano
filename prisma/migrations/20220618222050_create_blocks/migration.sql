-- CreateTable
CREATE TABLE "blocks" (
    "id" VARCHAR(64) NOT NULL PRIMARY KEY,
    "hash" VARCHAR(64),
    "link" CHAR(64) NOT NULL,
    "subtype" VARCHAR(8) NOT NULL,
    "amount" VARCHAR(39) NOT NULL,
    "account_id" CHAR(65) NOT NULL,
    "time" TIMESTAMP NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,
    CONSTRAINT "blocks_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("account") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "blocks_hash_key" ON "blocks"("hash");
