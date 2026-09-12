export interface AuditEvent {
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

const MAX_EVENTS = 20;
const events: AuditEvent[] = [];

export function saveAuditEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): AuditEvent {
  const entry: AuditEvent = {
    ...event,
    id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
  };
  events.unshift(entry);
  if (events.length > MAX_EVENTS) events.pop();
  return entry;
}

export function getAuditEvents(): AuditEvent[] {
  return events;
}

export function getAuditEventById(id: string): AuditEvent | undefined {
  return events.find((e) => e.id === id);
}
