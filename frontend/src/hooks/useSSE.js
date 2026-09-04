import { useEffect, useState } from 'react';

const TOKEN_KEY = 'aether_token';
const MAX_EVENTS = 200;

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function parseEventData(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function useSSE(taskId) {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!taskId) return undefined;
    const token = readToken();
    if (!token) return undefined;

    let es;
    let closed = false;

    const append = (rawData) => {
      if (closed) return;
      const parsed = parseEventData(rawData);
      if (!parsed) return;
      setEvents((prev) => [...prev, parsed].slice(-MAX_EVENTS));
    };

    try {
      const url = `/api/events/task/${encodeURIComponent(taskId)}?token=${encodeURIComponent(token)}`;
      es = new EventSource(url);

      es.onopen = () => {
        if (closed) return;
        setConnected(true);
        setError(null);
      };

      es.onerror = () => {
        if (closed) return;
        setConnected(false);
        setError('Live connection lost; reconnecting...');
      };

      es.addEventListener('task', (event) => append(event.data));
      es.addEventListener('execution', (event) => append(event.data));
      es.addEventListener('activity', (event) => append(event.data));
      es.onmessage = (event) => append(event.data);
    } catch {
      return undefined;
    }

    return () => {
      closed = true;
      if (es) es.close();
    };
  }, [taskId]);

  return { events, connected, error };
}