-- CreateTable
CREATE TABLE "Link" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shortId" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "title" TEXT,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "linkId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'link',
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "country" TEXT,
    "countryCode" TEXT,
    "city" TEXT,
    "region" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "browser" TEXT,
    "os" TEXT,
    "device" TEXT NOT NULL DEFAULT 'Desktop',
    "deviceVendor" TEXT,
    "deviceModel" TEXT,
    "language" TEXT,
    "referer" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Visit_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "Link" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Link_shortId_key" ON "Link"("shortId");

-- CreateIndex
CREATE INDEX "Visit_linkId_createdAt_idx" ON "Visit"("linkId", "createdAt");

-- CreateIndex
CREATE INDEX "Visit_createdAt_idx" ON "Visit"("createdAt");
