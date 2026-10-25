"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Database,
  GitBranch,
  Home,
  Moon,
  Network,
  Play,
  RefreshCw,
  Server,
  Shield,
  ShieldCheck,
  Sun,
  Terminal,
  Wifi,
  WifiOff,
  XCircle,
  Zap,
  Lock,
  Unlock,
  Bug,
  Search,
  FileText,
  Code,
  AlertCircle,
  CheckCircle,
  ChevronRight,
  Eye,
  EyeOff,
  Key,
  ShieldAlert,
  Layers,
} from "lucide-react";

import { useFlowStore } from "@/store/flowguardStore";
import { cn } from "@/lib/utils";

type TabId = "overview" | "scanner" | "combined" | "audit" | "websocket" | "policy" | "cases";
type WsStatus = "disconnected" | "connecting" | "connected" | "error";

type WsMessage = {
  id: string;
  type: string;
  payload: unknown;
  time: string;
  direction: "in" | "out";
};

type DemoCase = {
  case_id: string;
  name: string;
  description: string;
  pr_id: number;
  title: string;
  author: string;
  project_id: string;
  expected_reliability: string;
  expected_security: string;
  expected_combined_status: string;
  eligible_for_review: boolean;
  reliability: any;
  security: any;
  combined: any;
};

type SecurityScanReport = {
  scan_id: string;
  pr_id: number;
  tenant_id: string;
  policy_version: string;
  scanners: Array<{
    scanner: string;
    status: string;
    findings_count: number;
    error_message?: string;
  }>;
  findings: Array<{
    id: string;
    category: string;
    severity: string;
    title: string;
    description: string;
    file_path?: string;
    line_number?: number;
    code_snippet?: string;
    remediation?: string;
  }>;
  policy: {
    verdict: string;
    passed: boolean;
    blocking_findings_count: number;
    summary: string;
    policy_version: string;
  };
  is_clean: boolean;
  has_failures: boolean;
};

type CombinedResult = {
  pr_id: number;
  combined_status: string;
  reliability: { verdict: string; score: number };
  security: { verdict: string; is_clean: boolean };
  eligible_for_review: boolean;
  summary: string;
};

const TABS: { id: TabId; label: string; icon: typeof Home }[] = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "scanner", label: "Security Scanner", icon: Search },
  { id: "combined", label: "Combined Gate", icon: Shield },
  { id: "cases", label: "Demo Cases", icon: FileText },
  { id: "audit", label: "Audit Log", icon: ShieldCheck },
  { id: "websocket", label: "WebSocket Security", icon: Wifi },
  { id: "policy", label: "Policy Engine", icon: Layers },
];

function formatTime(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function severityColor(severity: string): string {
  switch (severity?.toLowerCase()) {
    case "critical": return "text-rose-600 bg-rose-100 dark:bg-rose-900/30";
    case "high": return "text-orange-600 bg-orange-100 dark:bg-orange-900/30";
    case "medium": return "text-amber-600 bg-amber-100 dark:bg-amber-900/30";
    case "low": return "text-blue-600 bg-blue-100 dark:bg-blue-900/30";
    default: return "text-slate-600 bg-slate-100 dark:bg-slate-800";
  }
}

function verdictColor(verdict: string): string {
  switch (verdict?.toUpperCase()) {
    case "PASS": return "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30";
    case "FAIL": return "text-rose-600 bg-rose-100 dark:bg-rose-900/30";
    case "INCOMPLETE": return "text-amber-600 bg-amber-100 dark:bg-amber-900/30";
    case "ELIGIBLE_FOR_REVIEW": return "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30";
    case "BLOCKED_SECURITY": return "text-rose-600 bg-rose-100 dark:bg-rose-900/30";
    case "BLOCKED_RELIABILITY": return "text-orange-600 bg-orange-100 dark:bg-orange-900/30";
    case "BLOCKED_BOTH": return "text-rose-600 bg-rose-100 dark:bg-rose-900/30";
    case "BLOCKED_CHECKS_INCOMPLETE": return "text-amber-600 bg-amber-100 dark:bg-amber-900/30";
    default: return "text-slate-600 bg-slate-100 dark:bg-slate-800";
  }
}

function Card({ title, icon: Icon, children, className }: { title: string; icon: typeof Activity; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900", className)}>
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-5 w-5 text-emerald-500" />
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function SecurityDemoPage() {
  const resilienceScore = useFlowStore((state) => state.resilience_score);
  const scenario = useFlowStore((state) => state.scenario);
  const severity = useFlowStore((state) => state.severity);
  const mode = useFlowStore((state) => state.mode);
  const nodes = useFlowStore((state) => state.nodes);
  const events = useFlowStore((state) => state.events);

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [isDark, setIsDark] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [wsStatus, setWsStatus] = useState<WsStatus>("disconnected");
  const [wsMessages, setWsMessages] = useState<WsMessage[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Security data
  const [demoCases, setDemoCases] = useState<DemoCase[]>([]);
  const [selectedCase, setSelectedCase] = useState<DemoCase | null>(null);
  const [securityScan, setSecurityScan] = useState<SecurityScanReport | null>(null);
  const [combinedResult, setCombinedResult] = useState<CombinedResult | null>(null);
  const [auditVerification, setAuditVerification] = useState<any>(null);
  const [auditEntries, setAuditEntries] = useState<any[]>([]);
  const [auditStats, setAuditStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const numericScore = useMemo(() => {
    const value = Number(resilienceScore ?? 85);
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 85;
  }, [resilienceScore]);

  // Load demo cases on mount
  useEffect(() => {
    const loadCases = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/pr/demo-cases/all");
        if (res.ok) {
          const data = await res.json();
          setDemoCases(Object.values(data) as DemoCase[]);
        }
      } catch (e) {
        setError("Failed to load demo cases");
      } finally {
        setLoading(false);
      }
    };
    loadCases();
  }, []);

  // Load audit data periodically
  const fetchAuditData = useCallback(async () => {
    try {
      const [verifyRes, entriesRes, statsRes] = await Promise.all([
        fetch("/api/audit/verify", { cache: "no-store" }),
        fetch("/api/audit/entries?limit=20", { cache: "no-store" }),
        fetch("/api/audit/stats", { cache: "no-store" }),
      ]);
      if (verifyRes.ok) setAuditVerification(await verifyRes.json());
      if (entriesRes.ok) {
        const data = await entriesRes.json();
        setAuditEntries(data.entries || data || []);
      }
      if (statsRes.ok) setAuditStats(await statsRes.json());
    } catch (e) {
      console.error("Audit fetch failed:", e);
    }
  }, []);

  useEffect(() => {
    fetchAuditData();
    const timer = setInterval(fetchAuditData, 15000);
    return () => clearInterval(timer);
  }, [fetchAuditData]);

  // WebSocket handling (same as before)
  const disconnectWebSocket = useCallback(() => {
    const socket = wsRef.current;
    if (socket) {
      socket.onopen = null; socket.onmessage = null; socket.onerror = null; socket.onclose = null;
      socket.close(); wsRef.current = null;
    }
    setWsStatus("disconnected");
  }, []);

  const connectWebSocket = useCallback(() => {
    if (typeof window === "undefined") return;
    const existing = wsRef.current;
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) return;

    setWsStatus("connecting");
    try {
      const token = window.localStorage.getItem("auth_token");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = new URL(`${protocol}//${window.location.hostname}:8000/ws`);
      url.searchParams.set("project_id", "demo");
      if (token) url.searchParams.set("token", token);

      const socket = new WebSocket(url.toString());
      wsRef.current = socket;

      socket.onopen = () => {
        if (wsRef.current !== socket) return;
        setWsStatus("connected");
        setWsMessages((current) => [{ id: `${Date.now()}-connected`, type: "connection", payload: { message: "WebSocket connected" }, time: new Date().toLocaleTimeString(), direction: "in" }, ...current].slice(0, 50));
      };
      socket.onmessage = (event) => {
        if (wsRef.current !== socket) return;
        let parsed: { type?: string; payload?: unknown };
        try { parsed = JSON.parse(String(event.data)) as { type?: string; payload?: unknown }; } catch { parsed = { type: "message", payload: event.data }; }
        setWsMessages((current) => [{ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, type: parsed.type ?? "message", payload: parsed.payload ?? parsed, time: new Date().toLocaleTimeString(), direction: "in" }, ...current].slice(0, 50));
      };
      socket.onerror = () => { if (wsRef.current === socket) setWsStatus("error"); };
      socket.onclose = () => { if (wsRef.current === socket) { wsRef.current = null; setWsStatus("disconnected"); } };
    } catch { setWsStatus("error"); }
  }, []);

  useEffect(() => () => { const socket = wsRef.current; if (socket) { socket.onclose = null; socket.close(); wsRef.current = null; } }, []);

  const sendCommand = useCallback((command: string, params: Record<string, unknown> = {}) => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) { setWsStatus("disconnected"); return; }
    const payload = { type: "command", payload: { command, params }, timestamp: Date.now() / 1000, message_id: `${Date.now()}-${Math.random().toString(16).slice(2)}` };
    try {
      socket.send(JSON.stringify(payload));
      setWsMessages((current) => [{ id: payload.message_id, type: "command", payload: payload.payload, time: new Date().toLocaleTimeString(), direction: "out" }, ...current].slice(0, 50));
    } catch { setWsStatus("error"); }
  }, []);

  const statusClass = wsStatus === "connected" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : wsStatus === "connecting" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : wsStatus === "error" ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";

  const loadSecurityScan = async (prId: number) => {
    setLoading(true);
    try {
      const [scanRes, combinedRes] = await Promise.all([
        fetch(`/api/pr/${prId}/security/analyze`, { method: "POST" }),
        fetch(`/api/pr/${prId}/combined`, { method: "POST" }),
      ]);
      if (scanRes.ok) setSecurityScan(await scanRes.json());
      if (combinedRes.ok) setCombinedResult(await combinedRes.json());
    } catch (e) {
      setError("Failed to load security data");
    } finally {
      setLoading(false);
    }
  };

  const handleCaseSelect = (caseData: DemoCase) => {
    setSelectedCase(caseData);
    loadSecurityScan(caseData.pr_id);
    setActiveTab("scanner");
  };

  return (
    <div className={cn("min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100", isDark && "dark")}>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-600 p-2 text-white"><Shield className="h-6 w-6" /></div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">FLOWGUARD</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Security demo dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("hidden rounded-full px-3 py-1 text-xs font-semibold sm:inline-flex", mode === "live" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300")}>
              {mode === "live" ? "LIVE MODE" : "REPLAY MODE"}
            </span>
            <button onClick={() => setIsDark(v => !v)} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" aria-label="Toggle theme">{isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-screen-2xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className={cn("h-fit rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900", !sidebarOpen && "lg:w-[72px]")}>
          <div className="mb-3 flex items-center justify-between px-2 py-1">
            {sidebarOpen && <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Navigation</span>}
            <button onClick={() => setSidebarOpen(v => !v)} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Toggle sidebar">{sidebarOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</button>
          </div>
          <nav className="space-y-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveTab(id)} title={label} aria-current={activeTab === id ? "page" : undefined} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition", activeTab === id ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800")}>
                <Icon className="h-5 w-5 shrink-0" />{sidebarOpen && <span>{label}</span>}
              </button>
            ))}
          </nav>
          <div className="mt-5 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70">
            <div className="flex items-center gap-2 text-xs font-semibold">
              {wsStatus === "connected" ? <Wifi className="h-4 w-4 text-emerald-500" /> : <WifiOff className="h-4 w-4 text-slate-400" />}
              {sidebarOpen && <span>WebSocket: {wsStatus}</span>}
            </div>
            {sidebarOpen && <button onClick={wsStatus === "connected" ? disconnectWebSocket : connectWebSocket} className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600">{wsStatus === "connected" ? "Disconnect" : "Connect"}</button>}
          </div>
        </aside>

        <main className="min-w-0 space-y-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-medium text-emerald-600">Monitoring / Security</p>
              <h2 className="mt-1 text-3xl font-bold tracking-tight">Security overview</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Static analysis, combined gates, audit integrity, and WebSocket security.</p>
            </div>
            <button onClick={fetchAuditData} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh audit</button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {TABS.map(({ id, label }) => (
              <button key={id} onClick={() => setActiveTab(id)} className={cn("whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium", activeTab === id ? "bg-emerald-600 text-white" : "border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900")}>{label}</button>
            ))}
          </div>

          {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}

          {/* OVERVIEW TAB */}
          {activeTab === "overview" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card title="Resilience score" icon={ShieldCheck}>
                  <div className={cn("text-4xl font-bold", numericScore >= 80 ? "text-emerald-600" : numericScore >= 50 ? "text-amber-600" : "text-rose-600")}>
                    {numericScore.toFixed(0)}<span className="text-lg">/100</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{numericScore >= 80 ? "Healthy" : numericScore >= 50 ? "Degraded" : "Critical"} system status</p>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={cn("h-full rounded-full", numericScore >= 80 ? "bg-emerald-500" : numericScore >= 50 ? "bg-amber-500" : "bg-rose-500")} style={{ width: `${numericScore}%` }} /></div>
                </Card>
                <Card title="Security scan" icon={Search}>
                  <div className="text-4xl font-bold">{demoCases.length}</div>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Demo cases available</p>
                </Card>
                <Card title="Combined gate" icon={Shield}>
                  <div className="text-2xl font-bold">{combinedResult ? combinedResult.combined_status : "—"}</div>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Unified reliability + security verdict</p>
                </Card>
                <Card title="Audit integrity" icon={Database}>
                  <div className="text-2xl font-bold">{auditVerification?.valid === true ? "Verified" : auditVerification?.valid === false ? "Invalid" : auditVerification ? "Available" : "Pending"}</div>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{auditEntries.length} entries loaded</p>
                </Card>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <Card title="Decision Matrix" icon={Layers}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-slate-200 dark:border-slate-700"><th className="text-left py-2 px-3 font-medium">Reliability</th><th className="text-left py-2 px-3 font-medium">Security</th><th className="text-left py-2 px-3 font-medium">Combined Status</th><th className="text-left py-2 px-3 font-medium">Review</th></tr></thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {[
                          { rel: "PASS", sec: "PASS", status: "ELIGIBLE_FOR_REVIEW", review: "✅", desc: "PR 13: Clean" },
                          { rel: "PASS", sec: "FAIL", status: "BLOCKED_SECURITY", review: "🚫", desc: "PR 21: Exposed cred" },
                          { rel: "FAIL", sec: "PASS", status: "BLOCKED_RELIABILITY", review: "🚫", desc: "PR 12: Resilience drop" },
                          { rel: "FAIL", sec: "FAIL", status: "BLOCKED_BOTH", review: "🚫", desc: "PR 22: Both fail" },
                          { rel: "INCOMPLETE", sec: "INCOMPLETE", status: "BLOCKED_CHECKS_INCOMPLETE", review: "⏸️", desc: "PR 23: Scanner crash" },
                        ].map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="py-2 px-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", row.rel === "PASS" ? "bg-emerald-100 text-emerald-700" : row.rel === "FAIL" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700")}>{row.rel}</span></td>
                            <td className="py-2 px-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", row.sec === "PASS" ? "bg-emerald-100 text-emerald-700" : row.sec === "FAIL" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700")}>{row.sec}</span></td>
                            <td className="py-2 px-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", verdictColor(row.status))}>{row.status}</span></td>
                            <td className="py-2 px-3">{row.review} {row.desc}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card title="Quick actions" icon={Terminal}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button onClick={() => { setActiveTab("scanner"); if (wsStatus !== "connected") connectWebSocket(); }} className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-emerald-400 hover:bg-emerald-50 dark:border-slate-700 dark:hover:bg-emerald-950/30"><Search className="h-5 w-5 text-emerald-500" /><span><span className="block text-sm font-semibold">Security Scanner</span><span className="text-xs text-slate-500">Run Bandit, pip-audit, npm-audit</span></span></button>
                    <button onClick={() => setActiveTab("combined")} className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-emerald-400 hover:bg-emerald-50 dark:border-slate-700 dark:hover:bg-emerald-950/30"><Shield className="h-5 w-5 text-emerald-500" /><span><span className="block text-sm font-semibold">Combined Gate</span><span className="text-xs text-slate-500">Reliability + Security matrix</span></span></button>
                    <button onClick={() => setActiveTab("cases")} className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-emerald-400 hover:bg-emerald-50 dark:border-slate-700 dark:hover:bg-emerald-950/30"><FileText className="h-5 w-5 text-emerald-500" /><span><span className="block text-sm font-semibold">Demo Cases</span><span className="text-xs text-slate-500">5 reproducible scenarios</span></span></button>
                    <button onClick={() => setActiveTab("audit")} className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-emerald-400 hover:bg-emerald-50 dark:border-slate-700 dark:hover:bg-emerald-950/30"><ShieldCheck className="h-5 w-5 text-emerald-500" /><span><span className="block text-sm font-semibold">Audit Trail</span><span className="text-xs text-slate-500">Tamper-proof verification</span></span></button>
                    <button onClick={() => setActiveTab("websocket")} className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-emerald-400 hover:bg-emerald-50 dark:border-slate-700 dark:hover:bg-emerald-950/30"><Wifi className="h-5 w-5 text-emerald-500" /><span><span className="block text-sm font-semibold">WebSocket Security</span><span className="text-xs text-slate-500">Auth, rate limits, 1 conn/project</span></span></button>
                    <button onClick={() => setActiveTab("policy")} className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-emerald-400 hover:bg-emerald-50 dark:border-slate-700 dark:hover:bg-emerald-950/30"><Layers className="h-5 w-5 text-emerald-500" /><span><span className="block text-sm font-semibold">Policy Engine</span><span className="text-xs text-slate-500">Deterministic evaluation</span></span></button>
                  </div>
                </Card>
              </div>
            </>
          )}

          {/* SECURITY SCANNER TAB */}
          {activeTab === "scanner" && (
            <div className="space-y-6">
              <Card title="Security Scan Results" icon={Search}>
                {selectedCase ? (
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{selectedCase.title} (PR #{selectedCase.pr_id})</p>
                      <p className="text-sm text-slate-500">Author: {selectedCase.author} • Project: {selectedCase.project_id}</p>
                    </div>
                    <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", verdictColor(securityScan?.policy?.verdict || "—"))}>
                      {securityScan?.policy?.verdict || "Loading..."}
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Select a demo case from the Cases tab or Overview to view security scan results.</p>
                )}

                {securityScan && (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
                        <p className="text-xs text-slate-500">Scanners Run</p>
                        <p className="text-2xl font-bold">{securityScan.scanners.length}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
                        <p className="text-xs text-slate-500">Total Findings</p>
                        <p className="text-2xl font-bold">{securityScan.findings.length}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
                        <p className="text-xs text-slate-500">Clean</p>
                        <p className="text-2xl font-bold">{securityScan.is_clean ? "Yes" : "No"}</p>
                      </div>
                    </div>

                    <div>
                      <h4 className="mb-2 font-semibold">Scanners Executed</h4>
                      <div className="space-y-2">
                        {securityScan.scanners.map((s, i) => (
                          <div key={i} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                            <div className="flex items-center gap-2"><Code className="h-4 w-4 text-slate-500" />{s.scanner}</div>
                            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", s.status === "passed" ? "bg-emerald-100 text-emerald-700" : s.status === "failed" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700")}>{s.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {securityScan.findings.length > 0 && (
                      <div>
                        <h4 className="mb-2 font-semibold">Findings</h4>
                        <div className="space-y-3 max-h-96 overflow-auto">
                          {securityScan.findings.map((f, i) => (
                            <div key={f.id || i} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className={cn("rounded-full px-2 py-1 text-xs font-semibold", severityColor(f.severity))}>{f.severity}</span>
                                <span className="rounded-full px-2 py-1 text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800">{f.category}</span>
                                {f.file_path && <span className="text-xs text-slate-500 font-mono">{f.file_path}:{f.line_number || ""}</span>}
                              </div>
                              <p className="mt-2 font-medium">{f.title}</p>
                              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{f.description}</p>
                              {f.code_snippet && (
                                <pre className="mt-2 overflow-x-auto rounded bg-slate-950 p-2 text-xs text-emerald-300"><code>{f.code_snippet}</code></pre>
                              )}
                              {f.remediation && <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">💡 {f.remediation}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <h4 className="mb-2 font-semibold">Policy Evaluation</h4>
                      <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
                        <div className="flex items-center justify-between">
                          <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", verdictColor(securityScan.policy.verdict))}>{securityScan.policy.verdict}</span>
                          <span className="text-sm text-slate-500">{securityScan.policy.blocking_findings_count} blocking findings</span>
                        </div>
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{securityScan.policy.summary}</p>
                        <p className="mt-1 text-xs text-slate-500">Policy version: {securityScan.policy.policy_version}</p>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* COMBINED GATE TAB */}
          {activeTab === "combined" && (
            <Card title="Combined Verification Gate" icon={Shield}>
              {selectedCase && combinedResult ? (
                <div className="space-y-4">
                  <div className="rounded-xl p-4" style={{ background: `linear-gradient(135deg, ${combinedResult.combined_status.includes("ELIGIBLE") ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)"} 0%, ${combinedResult.combined_status.includes("BOTH") ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)"} 100%)` }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">PR #{combinedResult.pr_id} • {selectedCase.title}</p>
                        <p className="text-3xl font-bold mt-1" style={{ color: combinedResult.combined_status.includes("ELIGIBLE") ? "#16a34a" : "#ef4444" }}>{combinedResult.combined_status}</p>
                      </div>
                      <span className={cn("rounded-full px-4 py-2 text-lg font-bold", combinedResult.eligible_for_review ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
                        {combinedResult.eligible_for_review ? "ELIGIBLE FOR REVIEW" : "BLOCKED"}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                      <div className="flex items-center justify-between mb-3"><Shield className="h-5 w-5 text-blue-500" /><h4 className="font-semibold">Reliability</h4></div>
                      <div className={cn("text-4xl font-bold", combinedResult.reliability.verdict === "PASS" ? "text-emerald-600" : "text-rose-600")}>{combinedResult.reliability.verdict}</div>
                      <p className="text-sm text-slate-500">Score: {combinedResult.reliability.score}/100</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                      <div className="flex items-center justify-between mb-3"><Lock className="h-5 w-5 text-emerald-500" /><h4 className="font-semibold">Security</h4></div>
                      <div className={cn("text-4xl font-bold", combinedResult.security.verdict === "PASS" ? "text-emerald-600" : "text-rose-600")}>{combinedResult.security.verdict}</div>
                      <p className="text-sm text-slate-500">{combinedResult.security.is_clean ? "Clean scan" : "Violations found"}</p>
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
                    <p className="font-semibold mb-2">Summary</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{combinedResult.summary}</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Shield className="mx-auto mb-4 h-12 w-12 text-slate-400" />
                  <p className="font-semibold text-lg">Select a demo case</p>
                  <p className="mt-1 text-sm text-slate-500">Choose a case from the Cases tab to see combined verification results.</p>
                </div>
              )}
            </Card>
          )}

          {/* DEMO CASES TAB */}
          {activeTab === "cases" && (
            <Card title="Reproducible Demo Cases" icon={FileText}>
              {loading ? (
                <div className="flex items-center justify-center py-8"><RefreshCw className="h-8 w-8 animate-spin text-emerald-500" /><span className="ml-3">Loading cases...</span></div>
              ) : demoCases.length === 0 ? (
                <p className="text-center text-slate-500 py-8">No demo cases available. Check backend connection.</p>
              ) : (
                <div className="space-y-3">
                  {demoCases.map((c, i) => (
                    <button key={c.case_id} onClick={() => handleCaseSelect(c)} className={cn("w-full text-left rounded-xl border border-slate-200 p-4 hover:border-emerald-400 hover:bg-emerald-50 dark:border-slate-700 dark:hover:bg-emerald-950/30 transition-colors", selectedCase?.case_id === c.case_id && "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30")}>
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className={cn("rounded-lg p-2", i < 2 ? "bg-emerald-100 text-emerald-600" : i < 4 ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-600")}>
                            <ChevronRight className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-semibold">{c.name}</p>
                            <p className="text-xs text-slate-500">PR #{c.pr_id} • {c.title} • {c.author}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className={cn("rounded-full px-2 py-0.5 font-semibold", c.expected_reliability === "PASS" ? "bg-emerald-100 text-emerald-700" : c.expected_reliability === "FAIL" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700")}>Rel: {c.expected_reliability}</span>
                          <span className={cn("rounded-full px-2 py-0.5 font-semibold", c.expected_security === "PASS" ? "bg-emerald-100 text-emerald-700" : c.expected_security === "FAIL" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700")}>Sec: {c.expected_security}</span>
                          <span className={cn("rounded-full px-2 py-0.5 font-semibold", verdictColor(c.expected_combined_status))}>{c.expected_combined_status}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* AUDIT LOG TAB */}
          {activeTab === "audit" && (
            <Card title="Immutable Audit Log" icon={ShieldCheck}>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
                <div className="flex items-center gap-3">
                  {auditVerification?.valid === true ? <CheckCircle2 className="h-6 w-6 text-emerald-500" /> : auditVerification?.valid === false ? <XCircle className="h-6 w-6 text-rose-500" /> : <CircleHelp className="h-6 w-6 text-amber-500" />}
                  <div>
                    <p className="font-semibold">{auditVerification?.valid === true ? "Audit chain verified ✓" : auditVerification?.valid === false ? "Audit verification FAILED ✗" : "Verification status unavailable"}</p>
                    <p className="text-xs text-slate-500">Merkle root: {auditVerification?.merkle_root?.slice(0, 16)}... | Entries: {auditVerification?.entries || 0}</p>
                  </div>
                </div>
                <button onClick={fetchAuditData} disabled={loading} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900"><RefreshCw className={cn("mr-2 inline h-4 w-4", loading && "animate-spin")} /> Verify again</button>
              </div>

              {auditVerification && (
                <pre className="mb-5 overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs text-emerald-300">{JSON.stringify(auditVerification, null, 2)}</pre>
              )}

              {auditStats && (
                <div className="mb-5 grid gap-4 sm:grid-cols-4">
                  <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70"><p className="text-xs text-slate-500">Total Entries</p><p className="text-2xl font-bold">{auditStats.total_entries}</p></div>
                  <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70"><p className="text-xs text-slate-500">By Action</p><p className="text-sm font-semibold">{Object.keys(auditStats.by_action || {}).length} types</p></div>
                  <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70"><p className="text-xs text-slate-500">By Tenant</p><p className="text-sm font-semibold">{Object.keys(auditStats.by_tenant || {}).length} tenants</p></div>
                  <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70"><p className="text-xs text-slate-500">By User</p><p className="text-sm font-semibold">{Object.keys(auditStats.by_user || {}).length} users</p></div>
                </div>
              )}

              <h3 className="mb-3 font-semibold">Recent entries ({auditEntries.length})</h3>
              {auditEntries.length === 0 ? (
                <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500 dark:bg-slate-800">No audit entries. Start the audit-log service (docker-compose) to generate entries.</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-auto">
                  {auditEntries.map((entry, index) => (
                    <div key={String(entry.id ?? index)} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{String(entry.event ?? entry.action ?? "Audit event")}</span>
                        <span className="text-xs text-slate-500">{formatTime(entry.timestamp)}</span>
                      </div>
                      <div className="grid gap-2 text-xs text-slate-600 dark:text-slate-400">
                        <div><span className="font-medium">Tenant:</span> {entry.tenant_id}</div>
                        <div><span className="font-medium">User:</span> {entry.user_id}</div>
                        <div><span className="font-medium">Resource:</span> {entry.resource}</div>
                        <div><span className="font-medium">Hash:</span> <code>{entry.entry_hash?.slice(0, 32)}...</code></div>
                        <div><span className="font-medium">Merkle:</span> <code>{entry.merkle_root?.slice(0, 32)}...</code></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* WEBSOCKET SECURITY TAB */}
          {activeTab === "websocket" && (
            <Card title="WebSocket Security Manager" icon={Wifi}>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2"><span className={cn("h-2.5 w-2.5 rounded-full", statusClass)} /><span className="text-sm capitalize">{wsStatus}</span></div>
                <div className="flex gap-2">
                  {wsStatus !== "connected" ? (
                    <button onClick={connectWebSocket} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><Play className="h-4 w-4" /> Connect</button>
                  ) : (
                    <button onClick={disconnectWebSocket} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Disconnect</button>
                  )}
                  <button onClick={() => setWsMessages([])} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Clear</button>
                </div>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                <button disabled={wsStatus !== "connected"} onClick={() => sendCommand("ping")} className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40 dark:border-slate-700">Send ping</button>
                <button disabled={wsStatus !== "connected"} onClick={() => sendCommand("get_status")} className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40 dark:border-slate-700">Get status</button>
                <button disabled={wsStatus !== "connected"} onClick={() => sendCommand("chaos", { scenario: "db_latency", severity: 1 })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40 dark:border-slate-700">Trigger chaos</button>
                <button disabled={wsStatus !== "connected"} onClick={() => sendCommand("reset")} className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40 dark:border-slate-700">Reset sim</button>
              </div>

              <div className="mb-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 text-sm">
                <p className="font-semibold mb-2">Security Features Active:</p>
                <ul className="space-y-1 text-slate-600 dark:text-slate-400">
                  <li>• Connection limit: 1 per project per user (enforced via Redis)</li>
                  <li>• Auth timeout: 5 seconds to authenticate after connect</li>
                  <li>• Message validation: Pydantic schema with strict types</li>
                  <li>• Rate limiting: 10 messages/second per connection</li>
                  <li>• Message size limit: 64KB</li>
                  <li>• Role-based command authorization (engineer/admin for chaos)</li>
                  <li>• Distributed tracking via Redis</li>
                </ul>
              </div>

              <div className="max-h-[520px] space-y-3 overflow-auto">
                {wsMessages.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500 dark:bg-slate-800">No WebSocket messages yet. Connect to begin.</p>
                ) : (
                  wsMessages.map((message) => (
                    <div key={message.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{message.type} <span className="font-normal text-slate-500">({message.direction})</span></span>
                        <time className="text-xs text-slate-500">{message.time}</time>
                      </div>
                      <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-slate-600 dark:text-slate-300">{JSON.stringify(message.payload, null, 2)}</pre>
                    </div>
                  ))
                )}
              </div>
            </Card>
          )}

          {/* POLICY ENGINE TAB */}
          {activeTab === "policy" && (
            <Card title="Deterministic Policy Engine" icon={Layers}>
              <div className="space-y-6">
                <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
                  <h4 className="font-semibold mb-3">Policy Configuration</h4>
                  <div className="grid gap-4 sm:grid-cols-2 text-sm">
                    <div><span className="text-slate-500">Policy Version:</span> <code className="ml-2 font-mono">1.1.0</code></div>
                    <div><span className="text-slate-500">Block on Critical:</span> <span className="ml-2 font-semibold text-emerald-600">Yes</span></div>
                    <div><span className="text-slate-500">Block on High:</span> <span className="ml-2 font-semibold text-emerald-600">Yes</span></div>
                    <div><span className="text-slate-500">Allow Medium (warn):</span> <span className="ml-2 font-semibold text-amber-600">Yes</span></div>
                    <div><span className="text-slate-500">Allow Low (info):</span> <span className="ml-2 font-semibold text-blue-600">Yes</span></div>
                    <div><span className="text-slate-500">Secret Detection:</span> <span className="ml-2 font-semibold text-emerald-600">Enabled (entropy + regex)</span></div>
                    <div><span className="text-slate-500">Scanner Timeout:</span> <span className="ml-2 font-mono">60s</span></div>
                    <div><span className="text-slate-500">Evaluation:</span> <span className="ml-2 font-semibold text-emerald-600">Deterministic</span></div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Evaluation Logic</h4>
                  <div className="space-y-2 text-sm">
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"><code>IF any finding.severity IN [CRITICAL, HIGH] → verdict = FAIL</code></div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"><code>ELSE IF scanner.status == FAILED → verdict = INCOMPLETE</code></div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"><code>ELSE IF findings.empty → verdict = PASS</code></div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"><code>ELSE → verdict = PASS (with warnings for MEDIUM/LOW)</code></div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Supported Scanners</h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { name: "Bandit", lang: "Python", checks: "AST-based security linting (SQLi, XSS, hardcoded secrets, etc.)" },
                      { name: "pip-audit", lang: "Python", checks: "Vulnerable dependencies (CVE database)" },
                      { name: "npm audit", lang: "JavaScript/TypeScript", checks: "Vulnerable npm packages" },
                      { name: "Secret Scanner", lang: "All", checks: "High-entropy strings, API keys, tokens, passwords" },
                    ].map((s, i) => (
                      <div key={i} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                        <div className="flex items-center gap-2 mb-1"><Code className="h-4 w-4 text-emerald-500" />{s.name}</div>
                        <p className="text-xs text-slate-500">{s.lang}</p>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{s.checks}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Combined Gate Matrix</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-slate-200 dark:border-slate-700"><th className="text-left py-2 px-3">Reliability</th><th className="text-left py-2 px-3">Security</th><th className="text-left py-2 px-3">Combined</th><th className="text-left py-2 px-3">Action</th></tr></thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {[
                          { rel: "PASS", sec: "PASS", comb: "ELIGIBLE_FOR_REVIEW", action: "Auto-approve eligible" },
                          { rel: "PASS", sec: "FAIL", comb: "BLOCKED_SECURITY", action: "Block - fix security first" },
                          { rel: "FAIL", sec: "PASS", comb: "BLOCKED_RELIABILITY", action: "Block - fix reliability first" },
                          { rel: "FAIL", sec: "FAIL", comb: "BLOCKED_BOTH", action: "Block - fix both" },
                          { rel: "INCOMPLETE", sec: "INCOMPLETE", comb: "BLOCKED_CHECKS_INCOMPLETE", action: "Retry pipeline" },
                        ].map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="py-2 px-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", row.rel === "PASS" ? "bg-emerald-100 text-emerald-700" : row.rel === "FAIL" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700")}>{row.rel}</span></td>
                            <td className="py-2 px-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", row.sec === "PASS" ? "bg-emerald-100 text-emerald-700" : row.sec === "FAIL" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700")}>{row.sec}</span></td>
                            <td className="py-2 px-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", verdictColor(row.comb))}>{row.comb}</span></td>
                            <td className="py-2 px-3 text-sm text-slate-600 dark:text-slate-400">{row.action}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </Card>
          )}

          <footer className="flex flex-col gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <span>FLOWGUARD Security Demo — Static Analysis, Combined Gates, Audit Logs, WebSocket Security</span>
            <span>Backend: FastAPI • Security: Bandit + pip-audit + npm-audit + Secrets • Audit: Hash-chained + HMAC</span>
          </footer>
        </main>
      </div>
    </div>
  );
}