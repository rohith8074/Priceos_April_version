"use client";

import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, TrendingUp, Building2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";

// ── Sign In Form ──────────────────────────────────────────────────────────────

function SignInForm() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();
            if (!res.ok) {
                const errMsg =
                    typeof data.error === "string"
                        ? data.error
                        : data.error?.message || "Invalid email or password";
                setError(errMsg);
                setLoading(false);
                return;
            }
            // If account is pending approval, redirect to pending page
            if (data.pending) {
                router.push("/pending-approval");
                return;
            }
            // If onboarding not yet complete, redirect to wizard
            if (data.needsOnboarding) {
                router.push("/onboarding");
                return;
            }
            router.push("/dashboard");
            router.refresh();
        } catch {
            setError("Network error. Please try again.");
            setLoading(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="form-label">Email</label>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="you@company.com"
                    className="form-input"
                />
            </div>
            <div>
                <label className="form-label">Password</label>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="form-input"
                />
                <div className="mt-1 text-right">
                    <Link href="/forgot-password" className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
                        Forgot password?
                    </Link>
                </div>
            </div>
            {error && <p className="text-sm text-red-400">{typeof error === "object" ? (error as any).message || JSON.stringify(error) : String(error)}</p>}
            <button type="submit" disabled={loading} className="form-submit-btn">
                {loading ? "Signing in…" : "Sign In"}
            </button>
        </form>
    );
}

// ── Market options (matches seed / settings) ─────────────────────────────────

const MARKETS = [
    { code: "UAE_DXB", label: "🇦🇪  Dubai, UAE" },
    { code: "GBR_LON", label: "🇬🇧  London, UK" },
    { code: "USA_NYC", label: "🇺🇸  New York, USA" },
    { code: "FRA_PAR", label: "🇫🇷  Paris, France" },
    { code: "NLD_AMS", label: "🇳🇱  Amsterdam, Netherlands" },
    { code: "ESP_BCN", label: "🇪🇸  Barcelona, Spain" },
    { code: "USA_MIA", label: "🇺🇸  Miami, USA" },
    { code: "PRT_LIS", label: "🇵🇹  Lisbon, Portugal" },
    { code: "USA_NSH", label: "🇺🇸  Nashville, USA" },
    { code: "AUS_SYD", label: "🇦🇺  Sydney, Australia" },
];

// ── Sign Up Form ──────────────────────────────────────────────────────────────

function SignUpForm() {
    const router = useRouter();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [marketCode, setMarketCode] = useState("UAE_DXB");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password, marketCode }),
            });
            const data = await res.json();
            if (!res.ok) {
                const errMsg =
                    typeof data.error === "string"
                        ? data.error
                        : data.error?.message || "Registration failed";
                setError(errMsg);
                setLoading(false);
                return;
            }
            // New users always go to pending approval
            router.push("/pending-approval");
            router.refresh();
        } catch {
            setError("Network error. Please try again.");
            setLoading(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="form-label">Full Name</label>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="name"
                    placeholder="Your name"
                    className="form-input"
                />
            </div>
            <div>
                <label className="form-label">Primary Market</label>
                <select
                    value={marketCode}
                    onChange={(e) => setMarketCode(e.target.value)}
                    className="form-input"
                    style={{ appearance: "none", cursor: "pointer" }}
                >
                    {MARKETS.map((m) => (
                        <option key={m.code} value={m.code} style={{ background: "#1a1a2e", color: "white" }}>
                            {m.label}
                        </option>
                    ))}
                </select>
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", marginTop: "4px" }}>
                    Sets your default currency, weekend definition, and guardrail defaults.
                </p>
            </div>
            <div>
                <label className="form-label">Email</label>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="you@company.com"
                    className="form-input"
                />
            </div>
            <div>
                <label className="form-label">Password</label>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="••••••••"
                    minLength={8}
                    className="form-input"
                />
            </div>
            {error && <p className="text-sm text-red-400">{typeof error === "object" ? (error as any).message || JSON.stringify(error) : String(error)}</p>}
            <button type="submit" disabled={loading} className="form-submit-btn">
                {loading ? "Creating account…" : "Create Account"}
            </button>
        </form>
    );
}

// ── Main Login Content ────────────────────────────────────────────────────────

function LoginContent() {
    const searchParams = useSearchParams();
    const defaultTab = searchParams.get('tab') === 'signup' ? 'signup' : 'signin';
    const [activeTab, setActiveTab] = useState<'signin' | 'signup'>(defaultTab);

    return (
        <div className="min-h-screen grid lg:grid-cols-2 overflow-hidden bg-[#0a0a0b]">
            {/* Left side: Dramatic Branding/Stats */}
            <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden border-r border-white/5">
                {/* Animated Background Mesh */}
                <div className="absolute inset-0 z-0">
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-amber-500/10 blur-[120px] rounded-full animate-pulse" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-500/10 blur-[150px] rounded-full animate-pulse delay-1000" />
                </div>

                <div className="relative z-10">
                    <Link href="/" className="flex items-center gap-3 group">
                        <div className="rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 p-2.5 shadow-lg shadow-amber-500/20 group-hover:scale-110 transition-transform">
                            <Sparkles className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-white tracking-tighter">PriceOS</h1>
                            <p className="text-[10px] text-amber-500/80 font-bold uppercase tracking-[0.2em]">Revenue intelligence</p>
                        </div>
                    </Link>
                </div>

                <div className="relative z-10 max-w-lg space-y-8">
                    <h2 className="text-6xl font-black text-white leading-tight tracking-tighter">
                        Maximize your <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-500 to-emerald-500">
                            Portfolio Potential
                        </span>
                    </h2>
                    <p className="text-lg text-white/50 font-light leading-relaxed">
                        Autonomous revenue management for short-term rental operators — anywhere in the world.
                        Real-time event tracking, automated pricing, and competitor intelligence.
                    </p>

                    <div className="grid grid-cols-2 gap-8 pt-6">
                        <div className="space-y-2 group cursor-default">
                            <div className="flex items-center gap-2 text-amber-500">
                                <TrendingUp className="h-5 w-5" />
                                <span className="text-2xl font-black tracking-tighter text-white group-hover:text-amber-400 transition-colors">+24%</span>
                            </div>
                            <p className="text-[10px] uppercase font-black tracking-widest text-white/30">Avg. Revenue Lift</p>
                        </div>
                        <div className="space-y-2 group cursor-default">
                            <div className="flex items-center gap-2 text-emerald-500">
                                <ShieldCheck className="h-5 w-5" />
                                <span className="text-2xl font-black tracking-tighter text-white group-hover:text-emerald-400 transition-colors">99.8%</span>
                            </div>
                            <p className="text-[10px] uppercase font-black tracking-widest text-white/30">Sync Accuracy</p>
                        </div>
                    </div>
                </div>

                <div className="relative z-10 flex items-center gap-6 text-xs text-white/30 font-medium tracking-wide">
                    <div className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> 10+ Global Markets</div>
                    <div className="w-1 h-1 rounded-full bg-white/10" />
                    <div>Enterprise Grade</div>
                    <div className="w-1 h-1 rounded-full bg-white/10" />
                    <div>24/7 Monitoring</div>
                </div>
            </div>

            {/* Right side: Login Form */}
            <div className="relative flex flex-col items-center justify-center p-6 lg:p-12">
                {/* Mobile Header */}
                <div className="lg:hidden absolute top-8 left-8">
                    <Link href="/" className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-amber-500" />
                        <span className="text-sm font-bold text-white uppercase tracking-tighter">PriceOS</span>
                    </Link>
                </div>

                <div className="w-full max-w-[440px] space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                    <div className="space-y-2 text-center lg:text-left">
                        <h3 className="text-3xl font-black tracking-tighter text-white">Access Your Dashboard</h3>
                        <p className="text-sm text-white/40">Secure administrative access for property operators.</p>
                    </div>

                    <Card className="bg-white/[0.03] backdrop-blur-3xl border-white/5 shadow-2xl relative overflow-hidden group p-0">
                        {/* Top accent line */}
                        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />

                        <Tabs
                            value={activeTab}
                            onValueChange={(value) => setActiveTab(value as 'signin' | 'signup')}
                            className="w-full"
                        >
                            <TabsList className="grid w-full grid-cols-2 bg-transparent border-b border-white/10 rounded-none h-14">
                                <TabsTrigger
                                    value="signin"
                                    className="rounded-none data-[state=active]:bg-white/5 data-[state=active]:text-amber-500 border-b-2 border-transparent data-[state=active]:border-amber-500 text-white/50"
                                >
                                    Sign In
                                </TabsTrigger>
                                <TabsTrigger
                                    value="signup"
                                    className="rounded-none data-[state=active]:bg-white/5 data-[state=active]:text-amber-500 border-b-2 border-transparent data-[state=active]:border-amber-500 text-white/50"
                                >
                                    Sign Up
                                </TabsTrigger>
                            </TabsList>

                            <div className="p-6">
                                <TabsContent value="signin" className="mt-0">
                                    <SignInForm />
                                </TabsContent>
                                <TabsContent value="signup" className="mt-0">
                                    <SignUpForm />
                                </TabsContent>
                            </div>
                        </Tabs>
                    </Card>

                    <p className="text-center text-[10px] text-white/20 px-8 uppercase tracking-widest leading-relaxed">
                        By accessing this system you agree to our
                        <Link href="#" className="text-amber-500/50 hover:text-amber-500 transition-colors mx-1 font-bold">Terms of Service</Link>
                        and
                        <Link href="#" className="text-amber-500/50 hover:text-amber-500 transition-colors mx-1 font-bold">Privacy Policy</Link>.
                    </p>
                </div>
            </div>

            <style jsx global>{`
        form label.form-label {
          display: block;
          color: rgba(255, 255, 255, 0.75) !important;
          font-weight: 600 !important;
          font-size: 0.8rem !important;
          margin-bottom: 0.25rem;
        }

        input.form-input {
          width: 100%;
          background-color: rgba(255, 255, 255, 0.03) !important;
          border: 1px solid rgba(255, 255, 255, 0.05) !important;
          color: white !important;
          border-radius: 8px !important;
          height: 48px !important;
          padding: 0 12px;
          font-size: 0.875rem;
          transition: all 0.2s ease !important;
          outline: none;
        }

        input.form-input:focus {
          border-color: #f59e0b !important;
          background-color: rgba(255, 255, 255, 0.05) !important;
          box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.1) !important;
        }

        input.form-input::placeholder {
          color: rgba(255, 255, 255, 0.3) !important;
        }

        button.form-submit-btn {
          width: 100%;
          background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%) !important;
          font-weight: 800 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.1em !important;
          height: 48px !important;
          border-radius: 8px !important;
          box-shadow: 0 10px 20px -10px rgba(245, 158, 11, 0.5) !important;
          transition: all 0.3s ease !important;
          color: #000 !important;
          border: none;
          cursor: pointer;
          font-size: 0.875rem;
        }

        button.form-submit-btn:hover:not(:disabled) {
          transform: translateY(-2px) !important;
          box-shadow: 0 15px 30px -10px rgba(245, 158, 11, 0.6) !important;
        }

        button.form-submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#0a0a0b]" />}>
            <LoginContent />
        </Suspense>
    );
}
