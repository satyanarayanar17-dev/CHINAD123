import { useEffect, useRef } from 'react';

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
];

interface UseIdleTimeoutOptions {
  enabled: boolean;
  timeoutMs: number;
  warningMs: number;
  onWarning: (remainingMs: number) => void;
  onTimeout: () => void;
}

export function useIdleTimeout({
  enabled,
  timeoutMs,
  warningMs,
  onWarning,
  onTimeout,
}: UseIdleTimeoutOptions) {
  const lastActivityAtRef = useRef(0);
  const warningShownRef = useRef(false);
  const timedOutRef = useRef(false);
  const onWarningRef = useRef(onWarning);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onWarningRef.current = onWarning;
  }, [onWarning]);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    if (!enabled) {
      warningShownRef.current = false;
      timedOutRef.current = false;
      return;
    }

    const resetActivity = () => {
      if (timedOutRef.current) {
        return;
      }

      lastActivityAtRef.current = Date.now();
      warningShownRef.current = false;
    };

    lastActivityAtRef.current = Date.now();
    warningShownRef.current = false;
    timedOutRef.current = false;

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, resetActivity, { passive: true });
    });

    const intervalId = window.setInterval(() => {
      const idleMs = Date.now() - lastActivityAtRef.current;
      const remainingMs = timeoutMs - idleMs;

      if (remainingMs <= 0) {
        if (!timedOutRef.current) {
          timedOutRef.current = true;
          onTimeoutRef.current();
        }
        return;
      }

      if (remainingMs <= warningMs && !warningShownRef.current) {
        warningShownRef.current = true;
        onWarningRef.current(remainingMs);
      }
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, resetActivity);
      });
    };
  }, [enabled, timeoutMs, warningMs]);
}
