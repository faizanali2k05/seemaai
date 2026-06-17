'use client';

import { useEffect, useState } from 'react';
import apiClient from '@/lib/api';

/**
 * Shared option lists for DB-driven "add/create" form comboboxes.
 *
 * Fetches existing values once on mount so forms can offer them as <datalist>
 * suggestions while still allowing free-text entry (e.g. a brand-new client on
 * the conflict checker). All values are plain strings.
 *
 * Sources (verified live):
 *  - clientNames:      unique client_name from GET /compliance/matters
 *  - matterReferences: reference from GET /compliance/matters
 *  - partyNames:       party_name from GET /compliance/conflicts/parties
 *
 * Failures are swallowed — suggestions are a progressive enhancement, never a
 * blocker for submitting the form.
 */
export interface ClientMatterOptions {
  clientNames: string[];
  matterReferences: string[];
  partyNames: string[];
}

function dedupeStrings(values: Array<unknown>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const trimmed = v.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function useClientMatterOptions(): ClientMatterOptions {
  const [clientNames, setClientNames] = useState<string[]>([]);
  const [matterReferences, setMatterReferences] = useState<string[]>([]);
  const [partyNames, setPartyNames] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [mattersRes, partiesRes] = await Promise.allSettled([
        apiClient.get('/compliance/matters'),
        apiClient.get('/compliance/conflicts/parties'),
      ]);

      if (cancelled) return;

      if (mattersRes.status === 'fulfilled') {
        const matters = Array.isArray(mattersRes.value.data)
          ? (mattersRes.value.data as any[])
          : [];
        setClientNames(dedupeStrings(matters.map((m) => m?.client_name)));
        setMatterReferences(dedupeStrings(matters.map((m) => m?.reference)));
      }

      if (partiesRes.status === 'fulfilled') {
        const parties = Array.isArray(partiesRes.value.data)
          ? (partiesRes.value.data as any[])
          : [];
        setPartyNames(dedupeStrings(parties.map((p) => p?.party_name)));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { clientNames, matterReferences, partyNames };
}

export default useClientMatterOptions;
