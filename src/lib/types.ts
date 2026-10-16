export interface LinkSummary {
  id: string;
  shortId: string;
  originalUrl: string;
  title: string | null;
  isCustom: boolean;
  forwardUtm: boolean;
  createdAt: string;
  clicks: number;
  qrScans: number;
  spark: number[];
}

export interface CountRow {
  key: string;
  count: number;
}

export interface RecentVisit {
  id: string;
  at: string;
  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  device: string;
  deviceName: string | null;
  browser: string | null;
  os: string | null;
  referer: string | null;
  platform: string;
  language: string | null;
  source: 'link' | 'qr';
  shortId?: string;
}

export interface GeoPoint {
  lat: number;
  lon: number;
  city: string;
  country: string;
  count: number;
}

/** [timestamp ms, isQrScan, index into Stats.links] */
export type VisitEvent = [number, 0 | 1, number];

export interface StatsLink {
  shortId: string;
  originalUrl: string;
  title: string | null;
  createdAt: string;
  forwardUtm: boolean;
}

export interface Stats {
  /** "all" = every link, "single" = one link, "multi" = a chosen subset. */
  mode: 'all' | 'single' | 'multi';
  /** The links in scope (every link when mode is "all"), oldest first. */
  links: StatsLink[];
  range: string;
  totals: { clicks: number; uniqueVisitors: number; qrScans: number; botsFiltered: number };
  events: VisitEvent[];
  byLink: CountRow[];
  countries: (CountRow & { code: string | null })[];
  cities: CountRow[];
  devices: CountRow[];
  browsers: CountRow[];
  os: CountRow[];
  referrers: CountRow[];
  platforms: CountRow[];
  languages: CountRow[];
  geo: GeoPoint[];
  recent: RecentVisit[];
}
