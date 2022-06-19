-- CreateTable
CREATE TABLE "wallets" (
    "id" CHAR(36) NOT NULL PRIMARY KEY,
    "seed" CHAR(128) NOT NULL,
    "mnemonic" TEXT NOT NULL,
    "representative" VARCHAR(65) NOT NULL DEFAULT 'nano_3arg3asgtigae3xckabaaewkx3bzsh7nwz7jkmjos79ihyaxwphhm6qgjps4',
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL
);
