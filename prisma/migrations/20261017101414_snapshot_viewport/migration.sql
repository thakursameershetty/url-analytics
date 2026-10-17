-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PageSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "viewportH" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PageSnapshot_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PageSnapshot" ("device", "height", "html", "id", "path", "siteId", "updatedAt", "width") SELECT "device", "height", "html", "id", "path", "siteId", "updatedAt", "width" FROM "PageSnapshot";
DROP TABLE "PageSnapshot";
ALTER TABLE "new_PageSnapshot" RENAME TO "PageSnapshot";
CREATE UNIQUE INDEX "PageSnapshot_siteId_path_device_key" ON "PageSnapshot"("siteId", "path", "device");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
