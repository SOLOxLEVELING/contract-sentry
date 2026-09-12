'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Shield,
  ShieldCheck,
  FileText,
  Play,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  ArrowRight,
  DollarSign,
  Tag,
  Send,
  Pencil,
  Plus,
  X,
  Banknote,
  Upload,
  Terminal,
  Radio,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────

interface LineItem {
  description: string;
  hours: number;
  rate: number;
  total: number;
}

interface Invoice {
  invoiceNumber: string;
  vendorName: string;
  date: string;
  lineItems: LineItem[];
  totalClaimed: number;
}

interface ContractRules {
  contractId: string;
  vendorName: string;
  maxHourlyRate: number;
  maxMonthlyHours: number;
  allowedCategories: string[];
  sowClauseReference: string;
}

interface Violation {
  lineItem: string;
  violationType: 'RATE_EXCEEDED' | 'HOURS_CAPPED' | 'UNAUTHORIZED_CATEGORY';
  charged: string | number;
  allowed: string | number;
  clauseCited: string;
}

interface AuditReport {
  verdict: 'APPROVED' | 'FLAGGED';
  discrepancyCount: number;
  totalOvercharge: number;
  violations: Violation[];
  suggestedAction: string;
  disputeDraft: string;
}

interface ExecutionStep {
  tool: string;
  label: string;
  input: unknown;
  output: unknown;
  durationMs: number;
}

interface AuditResponse {
  invoice: Invoice;
  contractRules: ContractRules | null;
  steps: ExecutionStep[];
  report: AuditReport | null;
}

interface EditableRow {
  id: string;
  description: string;
  hours: string;
  rate: string;
}

interface WebhookEvent {
  id: string;
  timestamp: string;
  vendorName: string;
  invoiceNumber: string;
  totalClaimed: number;
  verdict: 'APPROVED' | 'FLAGGED';
  overcharge: number;
  violations: number;
  source: 'WEBHOOK' | 'UI';
}

type Tab = 'clean' | 'dirty' | 'custom';
type ActionState = 'idle' | 'dispute_loading' | 'dispute_sent' | 'override_prompt' | 'overridden' | 'payout_loading' | 'payout_authorized';

// ── Fixtures ─────────────────────────────────────────────────────────────

const CLEAN_INVOICE: Invoice = {
  invoiceNumber: 'INV-2026-001',
  vendorName: 'Acme Consulting',
  date: '2026-09-01',
  lineItems: [
    { description: 'Backend Development', hours: 20, rate: 75, total: 1500 },
    { description: 'Code Review', hours: 10, rate: 75, total: 750 },
    { description: 'Bug Fixing', hours: 8, rate: 70, total: 560 },
  ],
  totalClaimed: 2810,
};

const DIRTY_INVOICE: Invoice = {
  invoiceNumber: 'INV-2026-002',
  vendorName: 'Acme Consulting',
  date: '2026-09-01',
  lineItems: [
    { description: 'Backend Development', hours: 20, rate: 115, total: 2300 },
    { description: 'Code Review', hours: 15, rate: 75, total: 1125 },
    { description: 'Bug Fixing', hours: 10, rate: 75, total: 750 },
    { description: 'Weekend Rush Surcharge', hours: 5, rate: 150, total: 750 },
  ],
  totalClaimed: 4925,
};

const CONTRACT_DISPLAY: ContractRules = {
  contractId: 'SOW-2026-ACME',
  vendorName: 'Acme Consulting',
  maxHourlyRate: 75,
  maxMonthlyHours: 40,
  allowedCategories: ['Backend Development', 'Code Review', 'Bug Fixing'],
  sowClauseReference: 'SOW-2026-Section 4.2',
};

const DEFAULT_CUSTOM_ROWS: EditableRow[] = [
  { id: '1', description: 'Backend Development', hours: '25', rate: '90' },
  { id: '2', description: 'Code Review', hours: '10', rate: '75' },
  { id: '3', description: 'Deployment Support', hours: '6', rate: '80' },
];

// ── Helpers ──────────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, typeof FileText> = {
  fetchContractRules: FileText,
  auditLineItems: DollarSign,
  recordAuditResult: CheckCircle2,
};

const VIOLATION_LABELS: Record<string, string> = {
  RATE_EXCEEDED: 'Rate Exceeded',
  HOURS_CAPPED: 'Hours Cap',
  UNAUTHORIZED_CATEGORY: 'Unauthorized',
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

let rowCounter = 10;
function nextId() {
  return String(++rowCounter);
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [tab, setTab] = useState<Tab | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [copied, setCopied] = useState(false);
  const [actionState, setActionState] = useState<ActionState>('idle');
  const [overrideReason, setOverrideReason] = useState('');
  const [customRows, setCustomRows] = useState<EditableRow[]>(DEFAULT_CUSTOM_ROWS);
  const [customVendor, setCustomVendor] = useState('Acme Consulting');
  const [customMaxRate, setCustomMaxRate] = useState('75');
  const [customMaxHours, setCustomMaxHours] = useState('40');
  const [customCategories, setCustomCategories] = useState('Backend Development, Code Review, Bug Fixing');
  const [customClause, setCustomClause] = useState('SOW-2026-Section 4.2');
  const [extracting, setExtracting] = useState(false);
  const [extractNotice, setExtractNotice] = useState<string | null>(null);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([]);
  const [curlCopied, setCurlCopied] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (webhookOpen) {
      const poll = () => {
        fetch('/api/webhook/events').then(r => r.json()).then(d => {
          if (d.events) setWebhookEvents(d.events);
        }).catch(() => {});
      };
      poll();
      pollingRef.current = setInterval(poll, 3000);
      return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
    } else {
      if (pollingRef.current) clearInterval(pollingRef.current);
    }
  }, [webhookOpen]);

  // ── Tab switching ──────────────────────────────────────────────────

  const selectTab = useCallback((t: Tab) => {
    setTab(t);
    setResult(null);
    setError(null);
    setVisibleSteps(0);
    setActionState('idle');
    setOverrideReason('');

    if (t === 'clean') setInvoice(CLEAN_INVOICE);
    else if (t === 'dirty') setInvoice(DIRTY_INVOICE);
    else setInvoice(null);
  }, []);

  // ── Build custom invoice from editor state ─────────────────────────

  function buildCustomInvoice(): Invoice {
    const lineItems = customRows
      .filter((r) => r.description.trim() && (parseFloat(r.hours) || 0) > 0)
      .map((r) => {
        const h = parseFloat(r.hours) || 0;
        const rt = parseFloat(r.rate) || 0;
        return { description: r.description.trim(), hours: h, rate: rt, total: Math.round(h * rt * 100) / 100 };
      });
    const totalClaimed = lineItems.reduce((s, li) => s + li.total, 0);
    return {
      invoiceNumber: `INV-CUSTOM-${Date.now().toString(36).toUpperCase()}`,
      vendorName: customVendor,
      date: new Date().toISOString().split('T')[0]!,
      lineItems,
      totalClaimed: Math.round(totalClaimed * 100) / 100,
    };
  }

  // ── Run audit ──────────────────────────────────────────────────────

  const runAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setVisibleSteps(0);
    setActionState('idle');
    setOverrideReason('');

    try {
      let body: Record<string, unknown>;
      if (tab === 'custom') {
        const inv = buildCustomInvoice();
        setInvoice(inv);
        body = {
          invoice: inv,
          customContractRules: {
            contractId: `SOW-CUSTOM-${customVendor.toUpperCase().replace(/\s+/g, '-')}`,
            vendorName: customVendor,
            maxHourlyRate: parseFloat(customMaxRate) || 75,
            maxMonthlyHours: parseFloat(customMaxHours) || 40,
            allowedCategories: customCategories.split(',').map(s => s.trim()).filter(Boolean),
            sowClauseReference: customClause || 'Custom SOW',
          },
        };
      } else {
        body = { fixtureId: tab };
      }

      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data: AuditResponse = await res.json();
      setResult(data);
      data.steps.forEach((_, i) => {
        setTimeout(() => setVisibleSteps(i + 1), (i + 1) * 350);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, customRows, customVendor, customMaxRate, customMaxHours, customCategories, customClause]);

  // ── Clipboard ──────────────────────────────────────────────────────

  const copyDispute = useCallback(async () => {
    if (!result?.report?.disputeDraft) return;
    await navigator.clipboard.writeText(result.report.disputeDraft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result]);

  // ── Custom editor mutations ────────────────────────────────────────

  function updateRow(id: string, field: keyof EditableRow, value: string) {
    setCustomRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function removeRow(id: string) {
    setCustomRows((prev) => prev.filter((r) => r.id !== id));
  }

  function addRow() {
    setCustomRows((prev) => [...prev, { id: nextId(), description: '', hours: '', rate: '' }]);
  }

  // ── PDF / image extraction ────────────────────────────────────────

  async function handleFileExtract(file: File) {
    setExtracting(true);
    setExtractNotice(null);
    setError(null);

    try {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), ''),
      );

      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: base64,
          mimeType: file.type,
          fileName: file.name,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const inv = data.invoice as {
        vendorName: string;
        invoiceNumber: string;
        date: string;
        lineItems: Array<{ description: string; hours: number; rate: number }>;
      };

      setCustomVendor(inv.vendorName);
      setCustomRows(
        inv.lineItems.map((li, i) => ({
          id: nextId(),
          description: li.description,
          hours: String(li.hours),
          rate: String(li.rate),
        })),
      );
      setExtractNotice('Items extracted. Verify values below before running Sentry audit.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Extraction failed');
    } finally {
      setExtracting(false);
    }
  }

  // ── Derived state ──────────────────────────────────────────────────

  const report = result?.report;
  const steps = result?.steps ?? [];
  const contractRules = result?.contractRules ?? (tab === 'custom' ? {
    contractId: `SOW-CUSTOM-${customVendor.toUpperCase().replace(/\s+/g, '-')}`,
    vendorName: customVendor,
    maxHourlyRate: parseFloat(customMaxRate) || 75,
    maxMonthlyHours: parseFloat(customMaxHours) || 40,
    allowedCategories: customCategories.split(',').map(s => s.trim()).filter(Boolean),
    sowClauseReference: customClause || 'Custom SOW',
  } : invoice ? CONTRACT_DISPLAY : null);
  const canRun = tab !== null && !loading;

  const displayVerdict =
    actionState === 'overridden' ? 'OVERRIDDEN'
    : actionState === 'dispute_sent' ? 'DISPUTED'
    : actionState === 'payout_authorized' ? 'SETTLED'
    : report?.verdict ?? null;

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/10">
              <Shield className="h-4 w-4 text-emerald-400" />
            </div>
            <span className="text-[15px] font-semibold text-zinc-100">ContractSentry</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setWebhookOpen(!webhookOpen)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                webhookOpen
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Terminal className="h-3 w-3" />
              Webhook Console
              {webhookEvents.length > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-emerald-500/20 px-1 text-[10px] font-mono text-emerald-400">
                  {webhookEvents.length}
                </span>
              )}
            </button>
            <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-[11px] text-zinc-500">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-dot" />
              Strands SDK &middot; Amazon Nova Pro
            </div>
          </div>
        </div>
      </header>

      {/* Webhook Console */}
      {webhookOpen && (
        <div className="border-b border-zinc-800/60 bg-zinc-900/50">
          <div className="mx-auto max-w-7xl px-6 py-4">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              <Radio className="h-3 w-3 text-emerald-500" />
              Autonomous Webhook Ingestion
            </div>

            <div className="mb-4 rounded-md border border-zinc-800 bg-zinc-950 p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-zinc-600">POST /api/webhook/invoice</span>
                <button
                  onClick={() => {
                    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com';
                    const cmd = `curl -X POST ${origin}/api/webhook/invoice \\\n  -H "Content-Type: application/json" \\\n  -d '{"vendorName":"Acme Consulting","invoiceNumber":"INV-WH-001","date":"2026-09-12","lineItems":[{"description":"Backend Development","hours":30,"rate":120},{"description":"Weekend Rush Surcharge","hours":5,"rate":150}]}'`;
                    navigator.clipboard.writeText(cmd);
                    setCurlCopied(true);
                    setTimeout(() => setCurlCopied(false), 2000);
                  }}
                  className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400 transition-colors hover:bg-zinc-700"
                >
                  {curlCopied ? <><Check className="h-3 w-3 text-emerald-400" /> Copied</> : <><Copy className="h-3 w-3" /> Copy cURL</>}
                </button>
              </div>
              <pre className="overflow-x-auto text-[12px] leading-relaxed text-emerald-400/80">
                <code>{`curl -X POST ${typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com'}/api/webhook/invoice \\
  -H "Content-Type: application/json" \\
  -d '{"vendorName":"Acme Consulting","invoiceNumber":"INV-WH-001","date":"2026-09-12","lineItems":[{"description":"Backend Development","hours":30,"rate":120},{"description":"Weekend Rush Surcharge","hours":5,"rate":150}]}'`}</code>
              </pre>
            </div>

            <div className="rounded-md border border-zinc-800 bg-zinc-950">
              <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
                <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-dot" />
                  Live Ingest Stream
                </span>
                <span className="text-[10px] font-mono text-zinc-700">polling 3s</span>
              </div>
              {webhookEvents.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-zinc-600">
                  No webhook events yet. Paste the cURL command in your terminal to ingest an invoice.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 text-left text-[10px] uppercase tracking-wider text-zinc-600">
                      <th className="px-3 py-2 font-medium">Time</th>
                      <th className="px-3 py-2 font-medium">Source</th>
                      <th className="px-3 py-2 font-medium">Vendor</th>
                      <th className="px-3 py-2 font-medium">Invoice</th>
                      <th className="px-3 py-2 font-medium text-right">Claimed</th>
                      <th className="px-3 py-2 font-medium text-right">Overcharge</th>
                      <th className="px-3 py-2 font-medium text-center">Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {webhookEvents.map((evt) => (
                      <tr key={evt.id} className="border-b border-zinc-800/50 last:border-0">
                        <td className="px-3 py-2 font-mono text-zinc-600">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            evt.source === 'WEBHOOK' ? 'bg-blue-500/10 text-blue-400' : 'bg-zinc-800 text-zinc-400'
                          }`}>
                            {evt.source}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-zinc-300">{evt.vendorName}</td>
                        <td className="px-3 py-2 font-mono text-zinc-500">{evt.invoiceNumber}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-300">
                          {fmt(evt.totalClaimed)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-red-400">
                          {evt.overcharge > 0 ? fmt(evt.overcharge) : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            evt.verdict === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                          }`}>
                            {evt.verdict}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-6 py-6">
        {/* Tab bar */}
        <div className="mb-6 flex items-center justify-between border-b border-zinc-800/60">
          <nav className="flex gap-0">
            <TabButton active={tab === 'clean'} onClick={() => selectTab('clean')}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Clean Invoice
            </TabButton>
            <TabButton active={tab === 'dirty'} onClick={() => selectTab('dirty')}>
              <AlertTriangle className="h-3.5 w-3.5" /> Flagged Invoice
            </TabButton>
            <TabButton active={tab === 'custom'} onClick={() => selectTab('custom')}>
              <Pencil className="h-3.5 w-3.5" /> Custom Invoice
            </TabButton>
          </nav>
          <button
            onClick={runAudit}
            disabled={!canRun}
            className="mb-2 flex items-center gap-2 rounded-md bg-zinc-100 px-4 py-1.5 text-[13px] font-medium text-zinc-900 transition-colors hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run Sentry Audit
          </button>
        </div>

        {/* Empty state */}
        {tab === null && (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <Shield className="mb-3 h-10 w-10 text-zinc-800" />
            <p className="text-sm text-zinc-600">Select an invoice above to begin.</p>
          </div>
        )}

        {/* Main grid */}
        {tab !== null && (
          <div className="grid gap-5 lg:grid-cols-3">
            {/* ── Left Column ─────────────────────────────────── */}
            <div className="space-y-4">
              {tab === 'custom' ? (
                <>
                  <InvoiceDropzone
                    onFile={handleFileExtract}
                    extracting={extracting}
                    notice={extractNotice}
                  />
                  <CustomEditor
                    rows={customRows}
                    vendor={customVendor}
                    onVendorChange={setCustomVendor}
                    onUpdate={updateRow}
                    onRemove={removeRow}
                    onAdd={addRow}
                  />
                  <SOWEditor
                    maxRate={customMaxRate}
                    maxHours={customMaxHours}
                    categories={customCategories}
                    clause={customClause}
                    onMaxRateChange={setCustomMaxRate}
                    onMaxHoursChange={setCustomMaxHours}
                    onCategoriesChange={setCustomCategories}
                    onClauseChange={setCustomClause}
                  />
                </>
              ) : invoice ? (
                <InvoiceCard invoice={invoice} />
              ) : null}

              {tab !== 'custom' && contractRules && <SOWCard rules={contractRules} />}
            </div>

            {/* ── Center Column: Timeline ──────────────────────── */}
            <div>
              <Card label="Agent Execution" icon={DollarSign}>
                {loading && steps.length === 0 && (
                  <div className="flex items-center gap-3 py-10 text-[13px] text-zinc-500">
                    <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                    Agent processing...
                  </div>
                )}

                {!loading && steps.length === 0 && (
                  <p className="py-10 text-center text-[13px] text-zinc-600">
                    {result ? 'No steps recorded.' : 'Awaiting audit.'}
                  </p>
                )}

                {steps.length > 0 && (
                  <ol className="relative ml-3 border-l border-zinc-800">
                    {steps.map((step, i) => {
                      const visible = i < visibleSteps;
                      const Icon = TOOL_ICONS[step.tool] ?? DollarSign;
                      return (
                        <li
                          key={i}
                          className={`relative pb-6 pl-7 last:pb-0 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
                        >
                          <span
                            className={`absolute -left-[5px] top-[5px] flex h-[9px] w-[9px] items-center justify-center rounded-full ring-4 ring-zinc-950 ${
                              visible ? 'bg-emerald-500' : 'bg-zinc-700'
                            }`}
                          />
                          <p className="text-[13px] font-medium text-zinc-200">{step.label}</p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
                            <Icon className="h-3 w-3 text-zinc-600" />
                            <code className="text-zinc-500">{step.tool}</code>
                            <span className="text-zinc-700">&middot;</span>
                            <span className="font-mono tabular-nums">{step.durationMs >= 1000 ? `${(step.durationMs / 1000).toFixed(1)}s` : `${step.durationMs}ms`}</span>
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </Card>
            </div>

            {/* ── Right Column: Verdict ─────────────────────── */}
            <div className="space-y-4">
              {/* Verdict banner */}
              {report && (
                <div
                  className={`animate-fade-in-up rounded-lg border p-4 ${
                    displayVerdict === 'APPROVED' || displayVerdict === 'SETTLED'
                      ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
                      : displayVerdict === 'OVERRIDDEN'
                        ? 'border-amber-500/20 bg-amber-500/[0.04]'
                        : displayVerdict === 'DISPUTED'
                          ? 'border-blue-500/20 bg-blue-500/[0.04]'
                          : 'border-red-500/20 bg-red-500/[0.04]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {displayVerdict === 'APPROVED' || displayVerdict === 'SETTLED' ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" />
                    ) : displayVerdict === 'OVERRIDDEN' ? (
                      <ShieldCheck className="mt-0.5 h-5 w-5 text-amber-400" />
                    ) : displayVerdict === 'DISPUTED' ? (
                      <Send className="mt-0.5 h-5 w-5 text-blue-400" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-5 w-5 text-red-400" />
                    )}
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-semibold ${
                          displayVerdict === 'APPROVED' || displayVerdict === 'SETTLED'
                            ? 'text-emerald-400'
                            : displayVerdict === 'OVERRIDDEN'
                              ? 'text-amber-400'
                              : displayVerdict === 'DISPUTED'
                                ? 'text-blue-400'
                                : 'text-red-400'
                        }`}
                      >
                        {displayVerdict === 'OVERRIDDEN' ? 'OVERRIDDEN BY HUMAN'
                          : displayVerdict === 'DISPUTED' ? 'DISPUTED — Awaiting Revised Invoice'
                          : displayVerdict === 'SETTLED' ? 'SETTLED & PAID'
                          : report.verdict}
                      </p>
                      {displayVerdict === 'OVERRIDDEN' ? (
                        <p className="mt-1 text-xs text-zinc-500">
                          Reason: <span className="text-zinc-400">{overrideReason}</span>
                        </p>
                      ) : displayVerdict === 'DISPUTED' ? (
                        <p className="mt-0.5 text-xs text-zinc-500">Dispute dispatched to contractor. Ref <span className="font-mono text-blue-400">DISP-9021</span></p>
                      ) : displayVerdict === 'SETTLED' ? (
                        <p className="mt-0.5 text-xs text-zinc-500">Payout of <span className="font-mono text-emerald-400">{fmt(invoice?.totalClaimed ?? 0)}</span> executed. Ref <span className="font-mono text-emerald-400">TX-4019</span></p>
                      ) : (
                        <p className="mt-0.5 text-xs text-zinc-500">{report.suggestedAction}</p>
                      )}
                    </div>
                  </div>

                  {report.totalOvercharge > 0 && !['OVERRIDDEN', 'DISPUTED', 'SETTLED'].includes(displayVerdict ?? '') && (
                    <div className="mt-3 flex gap-6 border-t border-zinc-800/60 pt-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-zinc-600">Discrepancies</p>
                        <p className="font-mono text-sm font-semibold tabular-nums text-zinc-200">
                          {report.discrepancyCount}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-zinc-600">Overcharge</p>
                        <p className="font-mono text-sm font-semibold tabular-nums text-red-400">
                          {fmt(report.totalOvercharge)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Violations */}
              {report && report.violations.length > 0 && !['OVERRIDDEN', 'DISPUTED', 'SETTLED'].includes(displayVerdict ?? '') && (
                <Card label="Violations" icon={AlertTriangle}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 text-left text-[10px] uppercase tracking-wider text-zinc-600">
                        <th className="pb-2 pr-2 font-medium">Item</th>
                        <th className="pb-2 pr-2 font-medium">Type</th>
                        <th className="pb-2 pr-2 font-medium text-right">Billed</th>
                        <th className="pb-2 font-medium text-right">Allowed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.violations.map((v, i) => (
                        <tr key={i} className="border-b border-zinc-800/50 last:border-0">
                          <td className="py-2 pr-2 text-zinc-300">{v.lineItem}</td>
                          <td className="py-2 pr-2">
                            <span
                              className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                v.violationType === 'RATE_EXCEEDED'
                                  ? 'bg-red-500/10 text-red-400'
                                  : v.violationType === 'HOURS_CAPPED'
                                    ? 'bg-amber-500/10 text-amber-400'
                                    : 'bg-zinc-800 text-zinc-400'
                              }`}
                            >
                              {VIOLATION_LABELS[v.violationType]}
                            </span>
                          </td>
                          <td className="py-2 pr-2 text-right font-mono tabular-nums text-red-400">
                            {typeof v.charged === 'number' ? fmt(v.charged) : v.charged}
                          </td>
                          <td className="py-2 text-right font-mono tabular-nums text-emerald-400">
                            {typeof v.allowed === 'number' ? fmt(v.allowed) : v.allowed}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}

              {/* ── Action Buttons ─────────────────────────────── */}
              {report && actionState === 'idle' && (
                <div className="animate-fade-in-up flex gap-2">
                  {report.verdict === 'FLAGGED' && (
                    <>
                      <button
                        onClick={async () => {
                          setActionState('dispute_loading');
                          try {
                            await fetch('/api/notify', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ invoice, report }),
                            });
                          } catch {}
                          setActionState('dispute_sent');
                        }}
                        className="flex flex-1 items-center justify-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-[13px] font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
                      >
                        <Send className="h-3.5 w-3.5" /> Send Dispute
                      </button>
                      <button
                        onClick={() => setActionState('override_prompt')}
                        className="flex flex-1 items-center justify-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2 text-[13px] font-medium text-amber-400 transition-colors hover:bg-amber-500/10"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" /> Override &amp; Authorize
                      </button>
                    </>
                  )}
                  {report.verdict === 'APPROVED' && (
                    <button
                      onClick={() => {
                        setActionState('payout_loading');
                        setTimeout(() => setActionState('payout_authorized'), 1800);
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-md bg-zinc-100 px-3 py-2 text-[13px] font-medium text-zinc-900 transition-colors hover:bg-white"
                    >
                      <Banknote className="h-3.5 w-3.5" /> Authorize Payout
                    </button>
                  )}
                </div>
              )}

              {/* Loading states */}
              {actionState === 'dispute_loading' && (
                <div className="animate-fade-in-up flex items-center justify-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-[13px] font-medium text-zinc-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Dispatching Dispute...
                </div>
              )}

              {actionState === 'payout_loading' && (
                <div className="animate-fade-in-up flex items-center justify-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-[13px] font-medium text-zinc-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing Transfer...
                </div>
              )}

              {/* Override prompt */}
              {actionState === 'override_prompt' && (
                <div className="animate-fade-in-up rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4">
                  <p className="mb-2 text-xs font-medium text-amber-400">Override Reason</p>
                  <input
                    type="text"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="e.g. Client verbal approval on rush work"
                    className="mb-3 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500/40 focus:outline-none"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (overrideReason.trim()) setActionState('overridden');
                      }}
                      disabled={!overrideReason.trim()}
                      className="flex-1 rounded-md bg-amber-500/10 px-3 py-1.5 text-[13px] font-medium text-amber-400 transition-colors hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Confirm Override
                    </button>
                    <button
                      onClick={() => { setActionState('idle'); setOverrideReason(''); }}
                      className="rounded-md px-3 py-1.5 text-[13px] text-zinc-500 hover:text-zinc-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Confirmation states */}
              {actionState === 'dispute_sent' && (
                <div className="animate-fade-in-up flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2 text-[13px] font-medium text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  Dispute Dispatched <span className="font-mono text-[11px] text-emerald-500/70">(Ref #DISP-9021)</span>
                </div>
              )}

              {actionState === 'payout_authorized' && report && (
                <div className="animate-fade-in-up flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2 text-[13px] font-medium text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  Payout Executed <span className="font-mono text-[11px] text-emerald-500/70">({fmt(invoice?.totalClaimed ?? 0)} &middot; Ref #TX-4019)</span>
                </div>
              )}

              {/* Dispute draft */}
              {report?.disputeDraft && report.verdict === 'FLAGGED' && !['OVERRIDDEN', 'DISPUTED', 'SETTLED'].includes(displayVerdict ?? '') && (
                <Card label="Dispute Draft" icon={FileText}>
                  <div className="relative">
                    <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-400">
                      {report.disputeDraft}
                    </pre>
                    <button
                      onClick={copyDispute}
                      className="absolute right-2 top-2 flex items-center gap-1.5 rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:bg-zinc-700"
                    >
                      {copied ? <><Check className="h-3 w-3 text-emerald-400" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                    </button>
                  </div>
                </Card>
              )}

              {/* Waiting states */}
              {!report && !loading && tab && (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800 py-16 text-center">
                  <p className="text-[13px] text-zinc-600">Awaiting audit.</p>
                </div>
              )}

              {loading && !report && (
                <div className="flex flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/50 py-16 text-center">
                  <Loader2 className="mb-2 h-5 w-5 animate-spin text-zinc-500" />
                  <p className="text-[13px] text-zinc-500">Analyzing invoice...</p>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] p-3 text-[13px] text-red-400">
                  {error}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Reusable Components ──────────────────────────────────────────────────

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 border-b-2 px-4 pb-3 text-[13px] font-medium transition-colors ${
        active ? 'border-zinc-100 text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {children}
    </button>
  );
}

function Card({ label, icon: Icon, children }: { label: string; icon: typeof FileText; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-3 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      {children}
    </div>
  );
}

function InvoiceCard({ invoice }: { invoice: Invoice }) {
  return (
    <Card label="Invoice" icon={FileText}>
      <div className="mb-3 flex items-center justify-between text-[11px] text-zinc-600">
        <span className="font-mono">{invoice.invoiceNumber}</span>
        <span>{invoice.date}</span>
      </div>
      <p className="mb-4 text-sm font-medium text-zinc-200">{invoice.vendorName}</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-[10px] uppercase tracking-wider text-zinc-600 whitespace-nowrap">
            <th className="pb-2 font-medium">Description</th>
            <th className="w-16 pb-2 font-medium text-right">Qty</th>
            <th className="w-24 pb-2 font-medium text-right">Rate</th>
            <th className="w-24 pb-2 font-medium text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lineItems.map((li, i) => (
            <tr key={i} className="border-b border-zinc-800/50 last:border-0">
              <td className="py-2 text-zinc-300">{li.description}</td>
              <td className="py-2 text-right font-mono tabular-nums text-zinc-400">{li.hours}</td>
              <td className="py-2 text-right font-mono tabular-nums text-zinc-400">{fmt(li.rate)}</td>
              <td className="py-2 text-right font-mono tabular-nums text-zinc-200">{fmt(li.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="pt-3 text-right text-[11px] uppercase tracking-wider text-zinc-600">
              Total Claimed
            </td>
            <td className="pt-3 text-right font-mono text-sm font-semibold tabular-nums text-zinc-100">
              {fmt(invoice.totalClaimed)}
            </td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

function SOWCard({ rules }: { rules: ContractRules }) {
  return (
    <Card label="SOW Terms" icon={Tag}>
      <div className="space-y-2.5 text-xs">
        <KV label="Contract" value={rules.contractId} />
        <KV label="Max Rate ($)" value={fmt(rules.maxHourlyRate)} mono />
        <KV label="Max Units / Cap" value={`${rules.maxMonthlyHours} /mo`} mono />
        <KV label="Clause" value={rules.sowClauseReference} />
        <div>
          <span className="text-zinc-600">Allowed Categories</span>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {rules.allowedCategories.map((c) => (
              <span key={c} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-600">{label}</span>
      <span className={`text-zinc-300 ${mono ? 'font-mono tabular-nums' : ''}`}>{value}</span>
    </div>
  );
}

function ConfirmBanner({ color, children }: { color: 'zinc' | 'emerald'; children: React.ReactNode }) {
  return (
    <div
      className={`animate-fade-in-up flex items-center gap-2.5 rounded-lg border p-3 text-[13px] ${
        color === 'emerald'
          ? 'border-emerald-500/20 bg-emerald-500/[0.04] text-emerald-400'
          : 'border-zinc-800 bg-zinc-900 text-zinc-300'
      }`}
    >
      {children}
    </div>
  );
}

function InvoiceDropzone({
  onFile,
  extracting,
  notice,
}: {
  onFile: (f: File) => void;
  extracting: boolean;
  notice: string | null;
}) {
  const [dragOver, setDragOver] = useState(false);
  const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp';

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    e.target.value = '';
  }

  return (
    <div className="space-y-2">
      <label
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-4 text-center transition-colors ${
          dragOver
            ? 'border-emerald-500/40 bg-emerald-500/[0.04]'
            : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-600'
        }`}
      >
        {extracting ? (
          <div className="flex items-center gap-2 text-[13px] text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Extracting invoice via Nova Pro Vision...
          </div>
        ) : (
          <>
            <Upload className="mb-1.5 h-4 w-4 text-zinc-600" />
            <p className="text-[12px] text-zinc-500">
              Drop invoice <span className="text-zinc-400">PDF / PNG / JPG</span> or{' '}
              <span className="text-zinc-400 underline underline-offset-2">browse</span>
            </p>
          </>
        )}
        <input
          type="file"
          accept={ACCEPT}
          onChange={handleChange}
          className="hidden"
          disabled={extracting}
        />
      </label>
      {notice && (
        <div className="flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-1.5 text-[11px] text-emerald-400">
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          {notice}
        </div>
      )}
    </div>
  );
}

function SOWEditor({
  maxRate,
  maxHours,
  categories,
  clause,
  onMaxRateChange,
  onMaxHoursChange,
  onCategoriesChange,
  onClauseChange,
}: {
  maxRate: string;
  maxHours: string;
  categories: string;
  clause: string;
  onMaxRateChange: (v: string) => void;
  onMaxHoursChange: (v: string) => void;
  onCategoriesChange: (v: string) => void;
  onClauseChange: (v: string) => void;
}) {
  return (
    <Card label="SOW Terms" icon={Tag}>
      <div className="space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11px] text-zinc-600">Max Rate ($)</label>
            <div className="flex items-center gap-1">
              <span className="text-zinc-600">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={maxRate}
                onChange={(e) => onMaxRateChange(e.target.value)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 font-mono text-xs tabular-nums text-zinc-200 focus:border-zinc-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-zinc-600">Max Units / Cap</label>
            <input
              type="text"
              inputMode="numeric"
              value={maxHours}
              onChange={(e) => onMaxHoursChange(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 font-mono text-xs tabular-nums text-zinc-200 focus:border-zinc-500 focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-zinc-600">Allowed Categories (comma-separated)</label>
          <input
            type="text"
            value={categories}
            onChange={(e) => onCategoriesChange(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 focus:border-zinc-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-zinc-600">Clause Reference</label>
          <input
            type="text"
            value={clause}
            onChange={(e) => onClauseChange(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 focus:border-zinc-500 focus:outline-none"
          />
        </div>
      </div>
    </Card>
  );
}

function CustomEditor({
  rows,
  vendor,
  onVendorChange,
  onUpdate,
  onRemove,
  onAdd,
}: {
  rows: EditableRow[];
  vendor: string;
  onVendorChange: (v: string) => void;
  onUpdate: (id: string, field: keyof EditableRow, value: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <Card label="Custom Invoice" icon={Pencil}>
      <div className="mb-4">
        <label className="mb-1 block text-[11px] text-zinc-600">Vendor Name</label>
        <input
          type="text"
          value={vendor}
          onChange={(e) => onVendorChange(e.target.value)}
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 focus:border-zinc-500 focus:outline-none"
        />
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-[10px] uppercase tracking-wider text-zinc-600 whitespace-nowrap">
            <th className="min-w-[180px] pb-2 font-medium">Description</th>
            <th className="w-16 pb-2 font-medium text-right">Qty</th>
            <th className="w-24 pb-2 font-medium text-right">Rate</th>
            <th className="w-24 pb-2 font-medium text-right">Total</th>
            <th className="w-6 pb-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const total = (parseFloat(r.hours) || 0) * (parseFloat(r.rate) || 0);
            return (
              <tr key={r.id} className="border-b border-zinc-800/50 group">
                <td className="min-w-[180px] py-1 pr-2">
                  <input
                    type="text"
                    value={r.description}
                    title={r.description}
                    onChange={(e) => onUpdate(r.id, 'description', e.target.value)}
                    className="w-full border-0 bg-transparent py-1 text-xs text-zinc-300 placeholder:text-zinc-700 focus:outline-none"
                    placeholder="Category"
                  />
                </td>
                <td className="w-16 py-1 pr-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={r.hours}
                    onChange={(e) => onUpdate(r.id, 'hours', e.target.value)}
                    className="w-full border-0 bg-transparent py-1 text-right font-mono text-xs tabular-nums text-zinc-400 focus:outline-none"
                    placeholder="0"
                  />
                </td>
                <td className="w-24 py-1 pr-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={r.rate}
                    onChange={(e) => onUpdate(r.id, 'rate', e.target.value)}
                    className="w-full border-0 bg-transparent py-1 text-right font-mono text-xs tabular-nums text-zinc-400 focus:outline-none"
                    placeholder="0"
                  />
                </td>
                <td className="py-1 pr-1 text-right font-mono tabular-nums text-zinc-500">
                  {total > 0 ? fmt(total) : '—'}
                </td>
                <td className="py-1 text-center">
                  <button
                    onClick={() => onRemove(r.id)}
                    className="text-zinc-700 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="pt-3 text-right text-[11px] uppercase tracking-wider text-zinc-600">
              Total
            </td>
            <td className="pt-3 text-right font-mono text-sm font-semibold tabular-nums text-zinc-100">
              {fmt(
                rows.reduce((s, r) => s + (parseFloat(r.hours) || 0) * (parseFloat(r.rate) || 0), 0),
              )}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
      <button
        onClick={onAdd}
        className="mt-3 flex items-center gap-1 text-[12px] text-zinc-600 transition-colors hover:text-zinc-300"
      >
        <Plus className="h-3 w-3" /> Add line item
      </button>
    </Card>
  );
}
