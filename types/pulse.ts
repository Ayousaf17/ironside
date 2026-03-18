export interface PulseCheck {
  id: string;
  created_at: string;
  date_range_start: string;
  date_range_end: string;
  ticket_count: number;
  open_count: number;
  closed_count: number;
  resolution_avg_min: number;
  resolution_p50_min: number;
  resolution_p90_min: number;
  tickets_analyzed: number;
  spam_pct: number;
  unassigned_pct: number;
  channel_email: number;
  channel_chat: number;
  workload: Record<string, number>;
  top_questions: { question: string; count: number; ticket_ids: number[] }[];
  tags: Record<string, number>;
  ops_notes: string[];
}
