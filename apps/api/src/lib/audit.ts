export type AuditEvent =
  | "auth.login.success"
  | "auth.login.failure"
  | "auth.register"
  | "auth.logout"
  | "client.create"
  | "client.update"
  | "client.archive"
  | "agent_config.create"
  | "agent_config.update"
  | "agent_config.delete"
  | "agent.job.enqueue"
  | "competitor.create"
  | "competitor.update"
  | "competitor.delete"
  | "article.transition"
  | "article.export";

interface AuditEntry {
  event: AuditEvent;
  userId?: string;
  clientId?: string;
  ip?: string;
  resourceId?: string;
  detail?: Record<string, unknown>;
}

export function audit(entry: AuditEntry): void {
  const record = {
    timestamp: new Date().toISOString(),
    level: "audit",
    ...entry,
  };
  // Structured JSON line — ingestible by log aggregators
  process.stdout.write(JSON.stringify(record) + "\n");
}
