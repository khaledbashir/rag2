"use client";

import { signIn } from "next-auth/react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { Loader2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const microsoftSsoEnabled = process.env.NEXT_PUBLIC_MICROSOFT_SSO_ENABLED === "true";
  const [isHubHost, setIsHubHost] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState("/");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCallbackUrl(params.get("callbackUrl") ?? "/");
    setUrlError(params.get("error"));
    setIsHubHost(["apps.ancsports.net", "app.ancsports.net"].includes(window.location.hostname));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
        callbackUrl,
      });
      console.log("[Login] signIn result:", JSON.stringify(result));
      if (result?.error) {
        if (result.error === "CredentialsSignin") {
          setMessage("Invalid email or password. Make sure you're using your full email address (e.g. name@company.com).");
        } else {
          setMessage(`Login error: ${result.error}`);
        }
        setLoading(false);
        return;
      }
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      setMessage("Login returned no URL — check browser console for details.");
    } catch (err: any) {
      console.error("[Login] Exception:", err);
      setMessage(`Connection error: ${err.message || "Unknown error"}. Check your network.`);
    }
    setLoading(false);
  }

  async function handleMicrosoftSignIn() {
    setMessage("");
    await signIn("microsoft-entra-id", { callbackUrl: callbackUrl || "/hub" });
  }

  const showError = urlError === "CredentialsSignin" || message;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-white">
      <style>{`
        @keyframes login-glow-drift {
          0%, 100% { opacity: 0.15; transform: translate(0%, 0%) scale(1); }
          50% { opacity: 0.25; transform: translate(10%, 10%) scale(1.1); }
        }
      `}</style>

      {/* ── Left Showcase Panel ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="relative h-[30vh] md:h-auto md:w-1/2 lg:w-[55%] overflow-hidden flex items-center justify-center md:justify-start"
        style={{
          background: "linear-gradient(135deg, #002C73 0%, #0385DD 50%, #0A52EF 100%)",
        }}
      >
        {/* Slash pattern overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "repeating-linear-gradient(145deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 60px)",
          }}
        />

        {/* Radial glow with drift */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 30% 30%, rgba(3,184,255,0.2) 0%, transparent 60%)",
            animation: "login-glow-drift 8s ease-in-out infinite",
          }}
        />

        {/* Content */}
        <div className="relative z-10 px-8 md:px-12 lg:px-16 text-center md:text-left">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
          >
            <Image
              src="/anc-logo-white.png"
              alt="ANC"
              width={128}
              height={40}
              priority
              className="inline-block md:block"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.4, ease: "easeOut" }}
          >
            <h2 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold text-white mt-6 md:mt-8 tracking-tight">
              {isHubHost ? "ANC Platform" : "Proposal Engine"}
            </h2>
            <p className="hidden md:block text-base text-white/60 font-light mt-3 tracking-wide">
              {isHubHost ? "One secure place for ANC apps" : "Professional Sports Display Technology"}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.6 }}
            className="hidden md:flex gap-2 mt-12"
          >
            <div className="w-2 h-2 rounded-full bg-[#03B8FF]" />
            <div className="w-2 h-2 rounded-full bg-white" />
            <div className="w-2 h-2 rounded-full bg-[#03B8FF]/50" />
          </motion.div>
        </div>

        {/* Bottom copyright */}
        <span className="hidden md:block absolute bottom-6 left-16 text-xs text-white/25">
          &copy; 2026 ANC Sports Enterprises
        </span>
      </motion.div>

      {/* ── Right Login Panel ── */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 bg-white">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
          className="w-full max-w-sm"
        >
          {/* Mobile-only logo */}
          <div className="md:hidden flex justify-center mb-6">
            <Image
              src="/anc-logo-blue.png"
              alt="ANC"
              width={40}
              height={40}
              priority
            />
          </div>

          {/* Header */}
          <h1 className="font-serif text-2xl font-bold text-zinc-900 tracking-tight text-center md:text-left">
            Welcome back
          </h1>
          <p className="text-sm text-zinc-500 mt-1 text-center md:text-left">
            {isHubHost ? "Sign in once with your ANC Microsoft account" : "Sign in to your account"}
          </p>

          {microsoftSsoEnabled && (
            <>
              <button
                type="button"
                onClick={handleMicrosoftSignIn}
                className="mt-8 flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-zinc-200 bg-white text-sm font-semibold text-zinc-900 shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:border-zinc-300 hover:bg-zinc-50"
              >
                <span className="grid h-5 w-5 grid-cols-2 gap-0.5" aria-hidden="true">
                  <span className="bg-[#f25022]" />
                  <span className="bg-[#7fba00]" />
                  <span className="bg-[#00a4ef]" />
                  <span className="bg-[#ffb900]" />
                </span>
                Sign in with Microsoft
              </button>

              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-zinc-200" />
                <span className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-400">Fallback</span>
                <div className="h-px flex-1 bg-zinc-200" />
              </div>
            </>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="login-email" className="text-sm font-medium text-zinc-700">
                Email address
              </Label>
              <Input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-12 rounded-lg border-zinc-200 bg-zinc-50/50 text-base px-4 focus-visible:ring-[#0A52EF]/30 focus-visible:border-[#0A52EF] transition-all duration-200"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="login-password" className="text-sm font-medium text-zinc-700">
                Password
              </Label>
              <Input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-12 rounded-lg border-zinc-200 bg-zinc-50/50 text-base px-4 focus-visible:ring-[#0A52EF]/30 focus-visible:border-[#0A52EF] transition-all duration-200"
              />
            </div>

            <AnimatePresence>
              {showError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {message || "Invalid credentials. Please try again."}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-lg bg-[#0A52EF] hover:bg-[#0385DD] text-white font-semibold text-base transition-all duration-300 hover:-translate-y-[1px]"
              style={{
                boxShadow: loading
                  ? "none"
                  : "0 10px 25px -5px rgba(10, 82, 239, 0.25)",
              }}
            >
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.span
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center"
                  >
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </motion.span>
                ) : (
                  <motion.span
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    Sign in
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          </form>

          <p className="text-xs text-zinc-400 text-center mt-8">
            Authorized personnel only
          </p>
        </motion.div>
      </div>
    </div>
  );
}
