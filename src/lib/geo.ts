export interface GeoResult {
  country: string | null;
  countryCode: string | null;
  state: string | null;
  stateCode: string | null;
  city: string | null;
}

const PRIVATE_PREFIXES = ["192.168.", "10.", "172.16.", "172.17.", "172.18.", "172.19.",
  "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.",
  "172.28.", "172.29.", "172.30.", "172.31.", "fc", "fd", "::1", "127."];

export async function geoLookup(ip: string): Promise<GeoResult> {
  const empty: GeoResult = { country: null, countryCode: null, state: null, stateCode: null, city: null };
  if (!ip || PRIVATE_PREFIXES.some((p) => ip.startsWith(p))) return empty;

  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,region,city`,
      { next: { revalidate: 3600 } } as RequestInit
    );
    const data = await res.json();
    if (data.status !== "success") return empty;
    return {
      country: data.country ?? null,
      countryCode: data.countryCode?.toLowerCase() ?? null,
      state: data.regionName ?? null,
      stateCode: data.region?.toLowerCase() ?? null,
      city: data.city ?? null,
    };
  } catch { return empty; }
}
