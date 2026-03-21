import { headerBlock, ticketBlock, actionRow, contextBlock } from "@/lib/slack/blocks";

const SENTIMENT_EMOJI: Record<string, string> = {
  angry: "😠",
  frustrated: "😤",
  happy: "😊",
  neutral: "😐",
};

function formatSla(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

export function formatTriageCard(data: {
  ticketId: number;
  subject: string;
  category: string;
  messagePreview: string;
  sentiment: string;
  priority: string;
  assignee: string | null;
  slaMinutes: number;
}): object[] {
  const { ticketId, subject, category, messagePreview, sentiment, priority, assignee, slaMinutes } = data;

  const sentimentEmoji = SENTIMENT_EMOJI[sentiment] ?? "😐";
  const slaDisplay = formatSla(slaMinutes);
  const assigneeDisplay = assignee ? assignee.split("@")[0] : "Unassigned";

  const contextParts = [
    `Sentiment: ${sentimentEmoji} ${sentiment.charAt(0).toUpperCase() + sentiment.slice(1)}`,
    `Priority: ${priority.charAt(0).toUpperCase() + priority.slice(1)}`,
    `Auto-assigned → ${assigneeDisplay}`,
    `SLA: ${slaDisplay}`,
  ];

  const blocks: object[] = [
    headerBlock(`🎫  New: #${ticketId}  ·  ${category}`),
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `"${messagePreview}"`,
      },
    },
    contextBlock(contextParts.join("  ·  ")),
    actionRow([
      {
        text: "Reply →",
        actionId: "open_reply_modal",
        value: JSON.stringify({ ticketId, tags: [], subject: subject.slice(0, 100) }),
      },
      {
        text: "Reassign →",
        actionId: "reassign_ticket",
        value: JSON.stringify({ ticketId }),
      },
      {
        text: "Wrong Category?",
        actionId: "show_category_triage",
        value: JSON.stringify({ ticketId }),
      },
    ]),
  ];

  return blocks;
}
