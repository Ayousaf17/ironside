// SW5 Template Responder — Pre-built responses for common Ironside ticket types.
// n8n equivalent: would be a Respond to Webhook node with templated message bodies.
//
// Operations:
//   list_templates    — show all available templates
//   preview_template  — preview a template with ticket context filled in
//   send_template     — send a templated response to a ticket (public reply)

import { DynamicTool } from "@langchain/core/tools";
import { getTicket, replyPublic, commentInternal } from "@/lib/gorgias/client";

interface Template {
  id: string;
  name: string;
  category: string;
  body: string; // uses {{placeholders}}
  internalNote?: string; // optional internal note added alongside
}

const TEMPLATES: Template[] = [
  // ---- Track Order ----
  {
    id: "order_status_in_build",
    name: "Order Status — In Build Window",
    category: "track_order",
    body:
      "Hi {{customer_name}}!\n\n" +
      "Thanks for reaching out about your order. Custom builds at Ironside typically take 15-20 business days from the date your order is verified.\n\n" +
      "Here's how the process works:\n" +
      "1. Order Received & Verification\n" +
      "2. Build Queue\n" +
      "3. Assembly\n" +
      "4. Quality Control & Testing\n" +
      "5. Shipping (via DHL)\n\n" +
      "Your order is currently being processed and you'll receive email updates as it moves through each stage. If you have any other questions, we're here to help!\n\n" +
      "Best,\nIronside Support",
  },
  {
    id: "order_status_shipped",
    name: "Order Status — Shipped",
    category: "track_order",
    body:
      "Hi {{customer_name}}!\n\n" +
      "Great news — your order has shipped via DHL! You should have received a tracking email with your DHL tracking number.\n\n" +
      "You can track your package at: https://www.dhl.com/us-en/home/tracking.html\n\n" +
      "If you need to change the delivery (hold at a DHL location, reschedule, etc.), you can use DHL On Demand Delivery: https://www.dhl.com/us-en/home/our-divisions/parcel/private-customers/receiving/on-demand-delivery.html\n\n" +
      "Typical delivery is 3-5 business days from ship date. Let us know if you need anything else!\n\n" +
      "Best,\nIronside Support",
  },
  {
    id: "order_status_overdue",
    name: "Order Status — Past Build Window",
    category: "track_order",
    body:
      "Hi {{customer_name}},\n\n" +
      "I completely understand your frustration, and I sincerely apologize for the delay on your order. You're right that this has exceeded our standard 15-20 business day build window.\n\n" +
      "I've escalated your order internally for a priority status check. I'll follow up within 24 hours with a specific update on your build stage and a revised timeline.\n\n" +
      "We take our build commitments seriously and I want to make sure we get your system to you as quickly as possible.\n\n" +
      "Thank you for your patience,\nIronside Support",
    internalNote: "ESCALATED: Order past 20-day build window. Customer is upset. Need priority status check from build team ASAP.",
  },

  // ---- Order Verification ----
  {
    id: "verification_what_needed",
    name: "Verification — What Documents Needed",
    category: "order_verification",
    body:
      "Hi {{customer_name}}!\n\n" +
      "For order verification, we need the following:\n\n" +
      "1. A photo of your government-issued ID (driver's license, passport, etc.)\n" +
      "2. A document showing your billing address (utility bill, bank statement, etc.)\n\n" +
      "You can reply to this email with the attachments. Once we verify your order, it enters the build queue and the 15-20 business day build timer starts.\n\n" +
      "This is a standard security step to protect our customers from fraudulent orders. We appreciate your understanding!\n\n" +
      "Best,\nIronside Support",
  },
  {
    id: "verification_confirmed",
    name: "Verification — Confirmed",
    category: "order_verification",
    body:
      "Hi {{customer_name}}!\n\n" +
      "Great news — your order has been verified and is now in the build queue!\n\n" +
      "Your 15-20 business day build window starts today. You'll receive email updates as your build progresses through each stage (Assembly → Quality Control → Shipping).\n\n" +
      "Thanks for getting those documents over quickly. If you have any questions while you wait, don't hesitate to reach out!\n\n" +
      "Best,\nIronside Support",
  },
  {
    id: "verification_stuck",
    name: "Verification — Customer Already Submitted",
    category: "order_verification",
    body:
      "Hi {{customer_name}},\n\n" +
      "I apologize for the delay in processing your verification. I can see you've already submitted your documents and I'm escalating this for immediate review.\n\n" +
      "Our verification team typically processes within 1-2 business days. I'll personally follow up to make sure this gets resolved today.\n\n" +
      "Thank you for your patience — we want to get your build started as soon as possible.\n\n" +
      "Best,\nIronside Support",
    internalNote: "Customer submitted verification docs but they haven't been processed yet. Needs immediate review.",
  },

  // ---- Technical / Report Issue ----
  {
    id: "wifi_driver_fix",
    name: "WIFI/LAN Driver Issue",
    category: "report_issue",
    body:
      "Hi {{customer_name}}!\n\n" +
      "This is a common issue with fresh Windows installs — the WiFi/LAN drivers need to be installed separately.\n\n" +
      "Since you don't have internet on the PC yet, here's what to do:\n\n" +
      "1. On your phone or another computer, go to your motherboard manufacturer's website\n" +
      "2. Search for your motherboard model (you can find it in System Information on the PC)\n" +
      "3. Download the WiFi and LAN drivers to a USB drive\n" +
      "4. Plug the USB into your new build and install the drivers\n\n" +
      "Alternative quick fix: Use a USB-to-Ethernet adapter or tether your phone via USB to get initial internet access, then Windows Update should pull the drivers automatically.\n\n" +
      "If you let me know your motherboard model, I can send you the direct download link!\n\n" +
      "Best,\nIronside Support",
  },
  {
    id: "water_cooling_critical",
    name: "Water Cooling Leak — CRITICAL",
    category: "report_issue",
    body:
      "Hi {{customer_name}},\n\n" +
      "Thank you for contacting us immediately — you did the right thing by powering off right away.\n\n" +
      "**IMPORTANT: Please do NOT power the system back on.** Liquid contact with components can cause damage that worsens with electricity.\n\n" +
      "Here's what happens next:\n" +
      "1. We're initiating an RMA (Return Merchandise Authorization) for your system\n" +
      "2. You'll receive a prepaid shipping label via email within 24 hours\n" +
      "3. Ship the system back to us in its original packaging (or we can arrange a pickup)\n" +
      "4. Our techs will inspect, repair, and test the system before sending it back\n\n" +
      "If there's any damage caused by the leak, it will be fully covered under warranty. We sincerely apologize for this experience.\n\n" +
      "I'll follow up with your shipping label shortly.\n\n" +
      "Best,\nIronside Support",
    internalNote: "CRITICAL: Water cooling leak reported. RMA initiated. Inspect AIO mount and pump upon return. Check for GPU/motherboard liquid damage.",
  },

  // ---- Return / Exchange ----
  {
    id: "return_process",
    name: "Return Request — Process Explanation",
    category: "return_exchange",
    body:
      "Hi {{customer_name}}!\n\n" +
      "We're sorry to hear the build isn't meeting your expectations. Here's how our return process works:\n\n" +
      "- Returns are accepted within 30 days of delivery\n" +
      "- The system must be in its original condition with all accessories\n" +
      "- A 15% restocking fee applies\n" +
      "- Refund is processed within 5-7 business days after we receive and inspect the return\n\n" +
      "To start the return:\n" +
      "1. Reply to confirm you'd like to proceed\n" +
      "2. We'll send you a prepaid return label\n" +
      "3. Pack the system in its original box and ship it back\n\n" +
      "Before returning, would you like to tell us what's not meeting expectations? We may be able to help resolve the issue or offer an upgrade that better fits your needs.\n\n" +
      "Best,\nIronside Support",
  },
];

function fillTemplate(template: Template, customerName: string): { body: string; internalNote?: string } {
  const body = template.body.replace(/\{\{customer_name\}\}/g, customerName || "there");
  const internalNote = template.internalNote?.replace(/\{\{customer_name\}\}/g, customerName || "customer");
  return { body, internalNote };
}

function extractCustomerName(messages: { sender: { type: string; name: string } }[]): string {
  const customerMsg = messages.find(m => m.sender.type === "customer");
  if (!customerMsg) return "there";
  // Use first name only
  return customerMsg.sender.name.split(" ")[0] || "there";
}

export const sw5TemplateTool = new DynamicTool({
  name: "sw5_template_responder",
  description:
    "Send pre-built responses for common Ironside ticket types. " +
    "Input must be a JSON string with: operation (string). " +
    "Operations: " +
    "list_templates — show all available templates, " +
    "preview_template (requires template_id and ticket_id) — preview with customer name filled in, " +
    "send_template (requires template_id and ticket_id) — send the response as a public reply. " +
    'Examples: {"operation": "list_templates"}, ' +
    '{"operation": "preview_template", "template_id": "wifi_driver_fix", "ticket_id": 254532830}, ' +
    '{"operation": "send_template", "template_id": "order_status_in_build", "ticket_id": 254126423}',
  func: async (input: string) => {
    try {
      const params = JSON.parse(input);

      switch (params.operation) {
        case "list_templates": {
          const grouped: Record<string, { id: string; name: string }[]> = {};
          for (const t of TEMPLATES) {
            if (!grouped[t.category]) grouped[t.category] = [];
            grouped[t.category].push({ id: t.id, name: t.name });
          }
          return JSON.stringify({ templates: grouped }, null, 2);
        }

        case "preview_template": {
          if (!params.template_id || !params.ticket_id) {
            return JSON.stringify({ error: "preview_template requires template_id and ticket_id" });
          }
          const template = TEMPLATES.find(t => t.id === params.template_id);
          if (!template) {
            return JSON.stringify({
              error: `Template "${params.template_id}" not found`,
              available: TEMPLATES.map(t => t.id),
            });
          }
          const ticket = await getTicket(Number(params.ticket_id));
          if (!ticket) return JSON.stringify({ error: `Ticket ${params.ticket_id} not found` });

          const customerName = extractCustomerName(ticket.messages);
          const filled = fillTemplate(template, customerName);

          return JSON.stringify({
            template_id: template.id,
            template_name: template.name,
            ticket_id: ticket.id,
            ticket_subject: ticket.subject,
            customer_name: customerName,
            preview_body: filled.body,
            ...(filled.internalNote && { preview_internal_note: filled.internalNote }),
          }, null, 2);
        }

        case "send_template": {
          if (!params.template_id || !params.ticket_id) {
            return JSON.stringify({ error: "send_template requires template_id and ticket_id" });
          }
          const template = TEMPLATES.find(t => t.id === params.template_id);
          if (!template) {
            return JSON.stringify({
              error: `Template "${params.template_id}" not found`,
              available: TEMPLATES.map(t => t.id),
            });
          }
          const ticket = await getTicket(Number(params.ticket_id));
          if (!ticket) return JSON.stringify({ error: `Ticket ${params.ticket_id} not found` });

          const customerName = extractCustomerName(ticket.messages);
          const filled = fillTemplate(template, customerName);

          // Send public reply
          const replyResult = await replyPublic(ticket.id, filled.body);

          // Add internal note if template includes one
          let noteResult = null;
          if (filled.internalNote) {
            noteResult = await commentInternal(ticket.id, filled.internalNote);
          }

          return JSON.stringify({
            status: "sent",
            ticket_id: ticket.id,
            template_used: template.id,
            customer_name: customerName,
            reply_sent: true,
            internal_note_added: !!noteResult,
          }, null, 2);
        }

        default:
          return JSON.stringify({
            error: `Unknown operation: ${params.operation}`,
            valid_operations: ["list_templates", "preview_template", "send_template"],
          });
      }
    } catch (err) {
      return JSON.stringify({ error: `Template operation failed: ${err}` });
    }
  },
});
