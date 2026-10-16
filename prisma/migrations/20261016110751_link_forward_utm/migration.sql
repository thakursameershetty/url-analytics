-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Link" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shortId" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "title" TEXT,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "forwardUtm" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Link" ("createdAt", "id", "isCustom", "originalUrl", "shortId", "title", "updatedAt") SELECT "createdAt", "id", "isCustom", "originalUrl", "shortId", "title", "updatedAt" FROM "Link";
DROP TABLE "Link";
ALTER TABLE "new_Link" RENAME TO "Link";
CREATE UNIQUE INDEX "Link_shortId_key" ON "Link"("shortId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
