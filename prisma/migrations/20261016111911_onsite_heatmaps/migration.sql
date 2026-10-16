-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME
);

-- CreateTable
CREATE TABLE "PageSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT NOT NULL,
    "visitId" TEXT,
    "shortId" TEXT,
    "visitorId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "viewportW" INTEGER NOT NULL,
    "viewportH" INTEGER NOT NULL,
    "docHeight" INTEGER NOT NULL,
    "maxScroll" INTEGER NOT NULL DEFAULT 0,
    "activeMs" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "rageClicks" INTEGER NOT NULL DEFAULT 0,
    "deadClicks" INTEGER NOT NULL DEFAULT 0,
    "referrer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PageSession_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PageEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "t" INTEGER NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "selector" TEXT,
    "ox" REAL,
    "oy" REAL,
    "tag" TEXT,
    "text" TEXT,
    CONSTRAINT "PageEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PageSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PageSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PageSnapshot_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Site_key_key" ON "Site"("key");

-- CreateIndex
CREATE INDEX "PageSession_siteId_path_device_startedAt_idx" ON "PageSession"("siteId", "path", "device", "startedAt");

-- CreateIndex
CREATE INDEX "PageSession_visitId_idx" ON "PageSession"("visitId");

-- CreateIndex
CREATE INDEX "PageSession_shortId_idx" ON "PageSession"("shortId");

-- CreateIndex
CREATE INDEX "PageEvent_sessionId_idx" ON "PageEvent"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PageSnapshot_siteId_path_device_key" ON "PageSnapshot"("siteId", "path", "device");
