import { supabase } from '@/lib/supabase';
import { useDemoStore } from '@/stores/demo-store';
import { create } from 'zustand';

export type NetworkState = 'checking' | 'connected' | 'no_internet' | 'server_unreachable';

export interface DiagnosticsResult {
  isOnline: boolean;
  isConfigured: boolean;
  supabaseUrl: string;
  reachable: boolean;
  statusCode?: number;
  statusMessage: string;
  detail?: string;
  possibleReason?: string;
  categoriesInCloud?: number;
  productsInCloud?: number;
  localProductsCount: number;
  localCategoriesCount: number;
  /** Step 1: did a request to a common internet host actually succeed? */
  internetReachable: boolean;
  internetTarget?: string;
  internetMs?: number;
  internetTried: string[];
  internetError?: string;
  /** Step 2: does the Supabase hostname resolve in DNS? null = could not test */
  dnsHost?: string;
  dnsResolves?: boolean | null;
}

export interface SyncStatus {
  success: boolean;
  message: string;
  productsCount: number;
  categoriesCount: number;
  /** Items present on this device but missing from the cloud (never uploaded). */
  localOnlyProducts: number;
  localOnlyCategories: number;
  at: Date;
}

interface NetworkStore {
  state: NetworkState;
  statusMessage: string;
  lastChecked: Date | null;
  errorDetail: string | null;
  lastSync: SyncStatus | null;
  checkConnection: () => Promise<DiagnosticsResult>;
  reportSync: (r: {
    success: boolean;
    message: string;
    productsCount?: number;
    categoriesCount?: number;
    localOnlyProducts?: number;
    localOnlyCategories?: number;
  }) => void;
}

/** Well-known hosts used to prove the device really has working internet. */
const INTERNET_TARGETS = [
  { label: 'google.com', url: 'https://www.google.com/generate_204' },
  { label: 'cloudflare.com', url: 'https://cloudflare.com/cdn-cgi/trace' },
];

const timeoutSignal = (ms: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, done: () => clearTimeout(timer) };
};

/**
 * Step 1 — Pings common hosts. `mode: 'no-cors'` means we cannot read the body,
 * but a resolved request still proves packets leave the device and come back.
 */
async function probeInternet(): Promise<{
  ok: boolean;
  target?: string;
  ms?: number;
  tried: string[];
  error?: string;
}> {
  const tried: string[] = [];
  let lastError = '';
  for (const t of INTERNET_TARGETS) {
    tried.push(t.label);
    const started = Date.now();
    const { controller, done } = timeoutSignal(4000);
    try {
      await fetch(t.url, { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
      return { ok: true, target: t.label, ms: Date.now() - started, tried };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      done();
    }
  }
  return { ok: false, tried, error: lastError };
}

/** Step 2 — Asks Google DNS whether the Supabase hostname resolves. null = could not test. */
async function probeDns(host: string): Promise<boolean | null> {
  const { controller, done } = timeoutSignal(4000);
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { Status?: number; Answer?: unknown[] };
    return json.Status === 0 && Array.isArray(json.Answer) && json.Answer.length > 0;
  } catch {
    return null;
  } finally {
    done();
  }
}

export const useNetworkStore = create<NetworkStore>((set) => ({
  state: 'checking',
  statusMessage: 'Checking server connection...',
  lastChecked: null,
  errorDetail: null,
  lastSync: null,

  reportSync: (r) => set({
    lastSync: {
      success: r.success,
      message: r.message,
      productsCount: r.productsCount ?? 0,
      categoriesCount: r.categoriesCount ?? 0,
      localOnlyProducts: r.localOnlyProducts ?? 0,
      localOnlyCategories: r.localOnlyCategories ?? 0,
      at: new Date(),
    },
  }),

  checkConnection: async (): Promise<DiagnosticsResult> => {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const url = import.meta.env.VITE_SUPABASE_URL || '';
    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
    const localProducts = useDemoStore.getState().products.length;
    const localCategories = useDemoStore.getState().categories.length;

    // ---- Step 1: is there real internet at all? ----
    const net = await probeInternet();

    const base = {
      isOnline,
      isConfigured: Boolean(url && anon),
      supabaseUrl: url,
      localProductsCount: localProducts,
      localCategoriesCount: localCategories,
      internetReachable: net.ok,
      internetTarget: net.target,
      internetMs: net.ms,
      internetTried: net.tried,
      internetError: net.error,
    };

    if (!net.ok) {
      const detail = `Ping test failed — ${net.tried.join(', ')} did not respond${
        net.error ? ` (${net.error})` : ''
      }.`;
      const result: DiagnosticsResult = {
        ...base,
        reachable: false,
        statusMessage: isOnline
          ? 'No real internet — common internet hosts are unreachable'
          : 'No internet connection on device',
        detail,
        possibleReason:
          'The device reports itself as online, but no request actually left the phone. Usual causes: Wi-Fi with no internet (captive portal / hotel / office login page), mobile data turned off, a VPN, or a firewall.',
      };
      set({
        state: 'no_internet',
        statusMessage: result.statusMessage,
        lastChecked: new Date(),
        errorDetail: `${detail}\n\nCause: ${result.possibleReason}`,
      });
      return result;
    }

    if (!url || !anon || !supabase) {
      const result: DiagnosticsResult = {
        ...base,
        reachable: false,
        statusMessage: 'Supabase credentials not configured in .env',
        detail: 'VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.',
      };
      set({
        state: 'server_unreachable',
        statusMessage: result.statusMessage,
        lastChecked: new Date(),
        errorDetail: result.detail,
      });
      return result;
    }

    // ---- Step 2: does the Supabase hostname resolve? ----
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      host = '';
    }
    const dnsResolves = host ? await probeDns(host) : null;

    // ---- Step 3: probe a real Supabase table ----
    // The bare /rest/v1/ root returns "Secret API key required" for publishable
    // keys, and probing a table also proves read permission.
    try {
      const { controller, done } = timeoutSignal(8000);

      const probeUrl = `${url.replace(/\/+$/, '')}/rest/v1/categories?select=id&limit=1`;
      let res: Response;
      try {
        res = await fetch(probeUrl, {
          method: 'GET',
          headers: {
            apikey: anon,
            Authorization: `Bearer ${anon}`,
          },
          signal: controller.signal,
        });
      } finally {
        done();
      }

      if (res.ok) {
        const [catCount, prodCount] = await Promise.all([
          supabase.from('categories').select('*', { count: 'exact', head: true }),
          supabase.from('products').select('*', { count: 'exact', head: true }),
        ]);

        const result: DiagnosticsResult = {
          ...base,
          reachable: true,
          statusCode: res.status,
          statusMessage: 'Live Cloud Server Connected',
          categoriesInCloud: catCount.count ?? 0,
          productsInCloud: prodCount.count ?? 0,
          dnsHost: host || undefined,
          dnsResolves,
        };

        set({
          state: 'connected',
          statusMessage: result.statusMessage,
          lastChecked: new Date(),
          errorDetail: null,
        });
        return result;
      }

      const rawBody = await res.text().catch(() => '');
      let bodyMessage = rawBody;
      try {
        const parsed = JSON.parse(rawBody) as { message?: string; hint?: string; code?: string };
        bodyMessage = parsed.message || parsed.hint || rawBody;
      } catch {
        // Response was not JSON
      }

      const permissionDenied =
        rawBody.includes('42501') ||
        /permission denied/i.test(bodyMessage) ||
        (res.status === 401 && !/secret api key/i.test(bodyMessage)) ||
        res.status === 403;

      const result: DiagnosticsResult = {
        ...base,
        reachable: true,
        statusCode: res.status,
        statusMessage: permissionDenied
          ? `Cloud server reachable, but reads are blocked (HTTP ${res.status})`
          : `Server returned HTTP ${res.status}`,
        detail: bodyMessage || `HTTP status ${res.status}`,
        possibleReason: permissionDenied
          ? 'The Supabase role this app uses (anon) has no permission on the catalog tables — the database only grants reads to signed-in staff. Run supabase/sql/0006_allow_anon_read.sql, or move the app to Supabase Auth login.'
          : res.status === 404
          ? 'The "categories" table was not found. Run supabase/complete_setup.sql to create the schema.'
          : undefined,
        dnsHost: host || undefined,
        dnsResolves,
      };

      set({
        state: 'server_unreachable',
        statusMessage: result.statusMessage,
        lastChecked: new Date(),
        errorDetail: `${result.detail}${result.possibleReason ? `\n\nCause: ${result.possibleReason}` : ''}`,
      });
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const timedOut = err instanceof DOMException && err.name === 'TimeoutError';
      const isFailedFetch = msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('network');

      let possibleReason: string;
      if (dnsResolves === false) {
        possibleReason = `DNS does not resolve ${host}. The name look-up itself failed — the network/ISP or a private DNS setting is blocking it, or the project was deleted.`;
      } else if (dnsResolves === true) {
        possibleReason = `DNS resolves ${host} normally and general internet works, so the connection is being blocked between the phone and Supabase — usually a VPN, private DNS, or an ISP/firewall rule. Try a different network (mobile data vs Wi-Fi).`;
      } else if (timedOut) {
        possibleReason =
          'General internet works, but Supabase did not answer in time. Likely a VPN, private DNS, or an ISP/firewall block between the phone and Supabase.';
      } else if (isFailedFetch) {
        possibleReason = 'The request failed before getting a response (DNS/TLS or blocked). Try another network.';
      } else {
        possibleReason = 'Network error while contacting Supabase.';
      }

      const detail = timedOut
        ? `No response from Supabase within 8 seconds. (Step 1 ping to ${net.target} succeeded in ${net.ms} ms.)`
        : msg;

      const result: DiagnosticsResult = {
        ...base,
        reachable: false,
        statusMessage: timedOut ? 'Supabase request timed out' : 'Cannot reach Supabase server',
        detail,
        possibleReason,
        dnsHost: host || undefined,
        dnsResolves,
      };

      set({
        state: 'server_unreachable',
        statusMessage: result.statusMessage,
        lastChecked: new Date(),
        errorDetail: `${result.detail}\n\nCause: ${result.possibleReason}`,
      });
      return result;
    }
  },
}));
