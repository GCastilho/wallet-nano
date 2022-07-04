-- CreateTable
CREATE TABLE "works" (
    "address" CHAR(65) NOT NULL PRIMARY KEY,
    "hash" CHAR(64) NOT NULL,
    "work" CHAR(16) NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,
    CONSTRAINT "works_address_fkey" FOREIGN KEY ("address") REFERENCES "accounts" ("account") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "works_hash_key" ON "works"("hash");
