-- CreateTable
CREATE TABLE "work_cache" (
    "address" CHAR(65) NOT NULL PRIMARY KEY,
    "hash" CHAR(64) NOT NULL,
    "work" CHAR(16) NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL,
    CONSTRAINT "work_cache_address_fkey" FOREIGN KEY ("address") REFERENCES "accounts" ("account") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "work_cache_hash_key" ON "work_cache"("hash");
