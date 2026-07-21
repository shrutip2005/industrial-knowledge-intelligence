import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import logoAsset from "@/assets/logo.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Industrial Knowledge Intelligence — Unified Asset & Operations Brain" },
      {
        name: "description",
        content:
          "Ingest engineering manuals, work orders, inspection reports and safety procedures into a queryable AI brain. Ask questions, run RCA, monitor compliance — grounded in your documents.",
      },
      { property: "og:title", content: "Industrial Knowledge Intelligence — Unified Asset & Operations Brain" },
      {
        property: "og:description",
        content: "Ingest engineering manuals, work orders, inspection reports and safety procedures into a queryable AI brain. Ask questions, run RCA, monitor compliance — grounded in your documents.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s?.user));
    return () => sub.subscription.unsubscribe();
  }, []);

  const cta = signedIn ? "Open your workspace" : "Sign in to get started";
  const ctaGo = () => navigate({ to: signedIn ? "/dashboard" : "/auth" });

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg,#0b1220 0%,#152238 60%,#1a3054 100%)",
      color: "#e6edf7",
      fontFamily: "'IBM Plex Sans',sans-serif",
    }}>
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "20px 32px", maxWidth: 1180, margin: "0 auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src={logoAsset.url} alt="Industrial Knowledge Intelligence logo" width={42} height={42} style={{ display: "block" }} />
          <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: 0.2 }}>Industrial Knowledge Intelligence</div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {signedIn ? (
            <Link to="/dashboard" style={ctaStyle}>Go to dashboard →</Link>
          ) : (
            <Link to="/auth" style={ctaStyle}>Sign in</Link>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "48px 32px 80px" }}>
        <div style={{ display: "flex", gap: 40, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ maxWidth: 720, flex: "1 1 480px" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px",
            background: "rgba(59,126,196,.15)", border: "1px solid rgba(59,126,196,.4)",
            borderRadius: 999, fontSize: 12, fontWeight: 600, color: "#8fbde8",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80" }} />
            RAG · Knowledge Graph · RCA · Compliance
          </div>
          <h1 style={{
            fontFamily: "'Space Grotesk',sans-serif",
            fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 700, lineHeight: 1.05,
            margin: "20px 0 16px",
          }}>
            A unified AI brain for your <span style={{ color: "#8fbde8" }}>industrial documents & assets</span>.
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.6, color: "#a8b6d1", maxWidth: 640 }}>
            Upload engineering manuals, work orders, inspection reports and safety procedures.
            Ask questions in natural language, run root-cause analyses on failing equipment, and
            monitor compliance — all grounded in your documents, with source citations.
          </p>
          <button onClick={ctaGo} style={{ ...ctaStyle, fontSize: 15, padding: "12px 20px", marginTop: 28, cursor: "pointer", border: "none" }}>
            {cta} →
          </button>
          </div>
          <img src={logoAsset.url} alt="Industrial Knowledge Intelligence logo" style={{ width: "min(320px, 40vw)", height: "auto", filter: "drop-shadow(0 20px 60px rgba(59,126,196,.35))" }} />
        </div>

        <div style={{
          marginTop: 64,
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        }}>
          {features.map((f) => (
            <div key={f.title} style={{
              background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)",
              borderRadius: 14, padding: 20,
            }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{f.icon}</div>
              <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 15 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: "#8ea0bc", lineHeight: 1.5 }}>{f.body}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 40, fontSize: 12, color: "#5f7396" }}>
          Your uploaded documents, entities, and chat history are private to your account.
        </div>
      </main>
    </div>
  );
}

const ctaStyle: React.CSSProperties = {
  display: "inline-block", padding: "9px 16px", borderRadius: 10,
  background: "#3b7ec4", color: "#fff", fontWeight: 600, fontSize: 13,
  textDecoration: "none", letterSpacing: 0.2,
};

const features = [
  { icon: "📄", title: "Universal ingestion", body: "PDFs, manuals, work orders, procedures — parsed, chunked and embedded automatically." },
  { icon: "🧠", title: "Expert copilot", body: "Ask questions in plain English. Answers are cited back to the source document and page." },
  { icon: "🛠", title: "RCA agent", body: "Fuse work-order history with document context to hypothesize root causes and PdM cadence." },
  { icon: "📋", title: "Compliance view", body: "See at a glance which required procedures and inspection records are missing." },
];
