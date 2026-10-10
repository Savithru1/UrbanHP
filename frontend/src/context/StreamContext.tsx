import React, { createContext, useContext, useEffect, useState } from 'react';
import { Incident } from '../types';

interface StreamContextType {
  isConnected: boolean;
  lastUpdatedIncident: Incident | null;
  triggerRefresh: () => void;
  refreshCount: number;
}

const StreamContext = createContext<StreamContextType>({
  isConnected: false,
  lastUpdatedIncident: null,
  triggerRefresh: () => {},
  refreshCount: 0,
});

export const StreamProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdatedIncident, setLastUpdatedIncident] = useState<Incident | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  const triggerRefresh = () => setRefreshCount((prev) => prev + 1);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;

    const connect = () => {
      try {
        eventSource = new EventSource('/api/stream/events');

        eventSource.onopen = () => {
          setIsConnected(true);
        };

        eventSource.onmessage = (e) => {
          try {
            const parsed = JSON.parse(e.data);
            if (parsed.event === 'incident_update') {
              setLastUpdatedIncident(parsed.data);
              triggerRefresh();
            } else if (parsed.event === 'incident_deleted' || parsed.event === 'memory_update') {
              triggerRefresh();
            }
          } catch (err) {
            // Ignore parse errors on raw heartbeat
          }
        };

        eventSource.onerror = () => {
          setIsConnected(false);
          if (eventSource) {
            eventSource.close();
          }
          // Retry after 3s
          reconnectTimeout = setTimeout(connect, 3000);
        };
      } catch (err) {
        setIsConnected(false);
        reconnectTimeout = setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  return (
    <StreamContext.Provider value={{ isConnected, lastUpdatedIncident, triggerRefresh, refreshCount }}>
      {children}
    </StreamContext.Provider>
  );
};

export const useStream = () => useContext(StreamContext);
