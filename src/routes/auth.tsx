import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Industrial Knowledge Intelligence" },
      { name: "description", content: "Sign in or create an account to access your private industrial knowledge workspace." },
      { property: "og:title", content: "Sign in — Industrial Knowledge Intelligence" },
      { property: "og:description", content: "Private, secure sign-in for the Industrial Knowledge Intelligence platform." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setNotice("");
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/dashboard" },
        });
        if (error) throw error;
        setNotice("Account created. If email confirmation is required, check your inbox — otherwise sign in below.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    setErr("");
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw new Error(result.error.message ?? "Google sign-in failed");
      if (result.redirected) return;
      navigate({ to: "/dashboard", replace: true });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      background: "linear-gradient(135deg,#0b1220 0%,#152238 100%)",
      padding: 24,
      fontFamily: "'IBM Plex Sans',sans-serif",
    }}>
      <div style={{
        width: "100%", maxWidth: 420, background: "#fff", borderRadius: 16,
        padding: 32, boxShadow: "0 20px 60px rgba(0,0,0,.35)",
      }}>
        <Link to="/" style={{ fontSize: 12, color: "#5f7396", textDecoration: "none" }}>← Back to home</Link>
        <h1 style={{ marginTop: 12, marginBottom: 6, fontSize: 22, fontWeight: 700, color: "#152238", fontFamily: "'Space Grotesk',sans-serif" }}>
          {mode === "signin" ? "Sign in" : "Create your account"}
        </h1>
        <p style={{ fontSize: 13, color: "#5f7396", margin: "0 0 20px" }}>
          Your uploaded documents and knowledge graph are private to your account.
        </p>

        <button
          onClick={google}
          disabled={busy}
          style={{
            width: "100%", padding: "10px 12px", borderRadius: 10,
            border: "1px solid #d3dbe6", background: "#fff", fontWeight: 600,
            fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", gap: 10, color: "#152238",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.9 2.5 30.4 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.8 6C12.1 13.2 17.5 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.3 5.6-4.9 7.3l7.6 5.9c4.4-4.1 7.1-10.1 7.1-17.7z"/>
            <path fill="#FBBC05" d="M10.3 28.7c-.5-1.5-.8-3.1-.8-4.7s.3-3.2.8-4.7l-7.8-6C.9 16.8 0 20.3 0 24s.9 7.2 2.5 10.7l7.8-6z"/>
            <path fill="#34A853" d="M24 48c6.4 0 11.9-2.1 15.8-5.8l-7.6-5.9c-2.1 1.4-4.8 2.2-8.2 2.2-6.5 0-12-4.4-13.7-10.3l-7.8 6C6.4 42.6 14.6 48 24 48z"/>
          </svg>
          Continue with Google
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0", color: "#8ea0bc", fontSize: 11 }}>
          <div style={{ flex: 1, height: 1, background: "#e5eaf2" }} /> OR <div style={{ flex: 1, height: 1, background: "#e5eaf2" }} />
        </div>

        <form onSubmit={submit}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#4a5872" }}>Email</label>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", marginTop: 4, marginBottom: 12, padding: "10px 12px",
              borderRadius: 10, border: "1px solid #d3dbe6", fontSize: 14 }}
          />
          <label style={{ fontSize: 12, fontWeight: 600, color: "#4a5872" }}>Password</label>
          <input
            type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", marginTop: 4, marginBottom: 16, padding: "10px 12px",
              borderRadius: 10, border: "1px solid #d3dbe6", fontSize: 14 }}
          />
          {err && <div style={{ color: "#c0392b", fontSize: 12, marginBottom: 12 }}>{err}</div>}
          {notice && <div style={{ color: "#0b6b4f", fontSize: 12, marginBottom: 12 }}>{notice}</div>}
          <button
            type="submit" disabled={busy}
            style={{ width: "100%", padding: "11px 12px", borderRadius: 10, border: "none",
              background: "#3b7ec4", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "#5f7396" }}>
          {mode === "signin" ? (
            <>New here? <button onClick={() => setMode("signup")} style={{ background: "none", border: "none", color: "#3b7ec4", fontWeight: 600, cursor: "pointer" }}>Create an account</button></>
          ) : (
            <>Already registered? <button onClick={() => setMode("signin")} style={{ background: "none", border: "none", color: "#3b7ec4", fontWeight: 600, cursor: "pointer" }}>Sign in</button></>
          )}
        </div>
      </div>
    </div>
  );
}
