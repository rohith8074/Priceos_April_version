"use client";

import { useEffect, useRef } from "react";

const INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes
const THROTTLE_MS = 2_000; // ignore repeated events within 2 s

export function InactivityMonitor() {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastResetRef = useRef<number>(Date.now());
    const loggingOutRef = useRef(false);

    useEffect(() => {
        const doLogout = async () => {
            if (loggingOutRef.current) return;
            loggingOutRef.current = true;
            try {
                await fetch("/api/auth/logout", { method: "POST" });
            } catch { /* best-effort */ }
            window.location.href = "/login?signedout=true";
        };

        const resetTimer = () => {
            const now = Date.now();
            if (now - lastResetRef.current < THROTTLE_MS) return;
            lastResetRef.current = now;

            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(doLogout, INACTIVITY_MS);
        };

        resetTimer();

        const events: (keyof WindowEventMap)[] = [
            "mousemove",
            "mousedown",
            "keydown",
            "touchstart",
            "scroll",
            "click",
            "pointerdown",
        ];
        events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));

        const onVisibility = () => {
            if (document.visibilityState === "visible") resetTimer();
        };
        document.addEventListener("visibilitychange", onVisibility);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            events.forEach((e) => window.removeEventListener(e, resetTimer));
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, []);

    return null;
}
