import { useEffect, useRef } from 'react';
import type { TimelineState } from './timelineTools';
export function useEditorSync(state: TimelineState, onRemote: (state: TimelineState) => void, onEnabled: (enabled: boolean) => void, onError: (message: string) => void) {
  const stateRef = useRef(state), remoteRef = useRef(onRemote), enabledRef = useRef(onEnabled), errorRef = useRef(onError);
  stateRef.current = state; remoteRef.current = onRemote; enabledRef.current = onEnabled; errorRef.current = onError;
  const acknowledge = useRef('');
  const revision = useRef(0);
  useEffect(() => {
    let ready = false, sending = false, submitted = '', disposed = false;
    const events = new EventSource('/api/editor/events');
    const receive = (snapshot: any) => {
      if (snapshot.revision < revision.current) return;
      const newer = snapshot.revision > revision.current;
      revision.current = snapshot.revision;
      enabledRef.current(snapshot.enabled);
      if (ready && !newer) return;
      const serialized = JSON.stringify(snapshot.state);
      if (!ready && snapshot.revision === 0) { ready = true; return; }
      ready = true;
      acknowledge.current = serialized;
      if (serialized !== JSON.stringify(stateRef.current) && serialized !== submitted) remoteRef.current(snapshot.state);
    };
    events.addEventListener('state', e => receive(JSON.parse((e as MessageEvent).data)));
    const timer = setInterval(async () => {
      if (!ready || sending || disposed) return;
      const serialized = JSON.stringify(stateRef.current);
      if (serialized === acknowledge.current) return;
      sending = true; submitted = serialized;
      try {
        const response = await fetch('/api/editor/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: JSON.parse(serialized), revision: revision.current }) });
        const result = await response.json();
        if (disposed) return;
        if (response.status === 409) { submitted = ''; receive(result); errorRef.current('Timeline aggiornata da un altro client: stato sincronizzato.'); }
        else if (!response.ok) throw new Error(result.error || 'Sincronizzazione timeline fallita.');
        else { revision.current = Math.max(revision.current, result.revision); acknowledge.current = serialized; }
      } catch (error) { if (!disposed) errorRef.current((error as Error).message); }
      finally { sending = false; submitted = ''; }
    }, 200);
    return () => { disposed = true; clearInterval(timer); events.close(); };
  }, []);
}
