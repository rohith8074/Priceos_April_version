"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
// 15 minutes in milliseconds
const INACTIVITY_TIME = 15 * 60 * 1000;

export function InactivityMonitor() {
    const router = useRouter();

    useEffect(() => {
        let timeoutId: NodeJS.Timeout;

        const handleLogout = async () => {
            try {
                await fetch("/api/auth/logout", { method: "POST" });
            } catch { }
            window.location.href = '/login?signedout=true';
        };

        const resetTimer = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(handleLogout, INACTIVITY_TIME);
        };

        resetTimer();

        window.addEventListener("mousemove", resetTimer);
        window.addEventListener("mousedown", resetTimer);
        window.addEventListener("keydown", resetTimer);
        window.addEventListener("touchstart", resetTimer);
        window.addEventListener("scroll", resetTimer);

        return () => {
            clearTimeout(timeoutId);
            window.removeEventListener("mousemove", resetTimer);
            window.removeEventListener("mousedown", resetTimer);
            window.removeEventListener("keydown", resetTimer);
            window.removeEventListener("touchstart", resetTimer);
            window.removeEventListener("scroll", resetTimer);
        };
    }, [router]);

    return null;
}
