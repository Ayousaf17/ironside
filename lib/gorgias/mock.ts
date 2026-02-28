// Mock Gorgias tickets modeled on real Ironside Computers support data.
// Distribution mirrors actual pulse check patterns (Jan 29 - Feb 27, 2026):
//   ~30% Track Order / ORDER-STATUS
//   ~12% Order Verification
//   ~12% Product Question
//   ~8%  Report Issue / Technical
//   ~5%  Return / Exchange
//   ~3%  Contact Form (real)
//   ~30% Spam / Non-Support (auto-closed)

export interface GorgiasMessage {
  id: number;
  sender: { type: "customer" | "agent"; name: string };
  body_text: string;
  created_datetime: string;
}

export interface GorgiasTicket {
  id: number;
  subject: string;
  status: "open" | "closed";
  channel: "email" | "chat";
  assignee: string | null;
  tags: string[];
  created_datetime: string;
  messages: GorgiasMessage[];
}

// Real agents: Spencer, Danni-Jean, Mackenzie, Gabe
// Real ticket IDs: 252xxxxx - 257xxxxx range
// Real order numbers: 95xxxx range

const MOCK_TICKETS: GorgiasTicket[] = [
  // ========================================
  // TRACK ORDER / ORDER-STATUS (8 tickets)
  // ========================================
  {
    id: 254126423,
    subject: "Track Order",
    status: "open",
    channel: "chat",
    assignee: null,
    tags: ["ORDER-STATUS"],
    created_datetime: "2026-02-25T14:30:00Z",
    messages: [
      { id: 5001, sender: { type: "customer", name: "Marcus Johnson" }, body_text: "I placed order #952555 on Feb 12 and haven't received any updates. What stage is my build at?", created_datetime: "2026-02-25T14:30:00Z" },
    ],
  },
  {
    id: 254090215,
    subject: "Track Order",
    status: "open",
    channel: "chat",
    assignee: null,
    tags: ["ORDER-STATUS", "urgent"],
    created_datetime: "2026-02-25T11:05:00Z",
    messages: [
      { id: 5002, sender: { type: "customer", name: "Emily Chen" }, body_text: "Order #952532. It's been 20 days and I still haven't received a shipping confirmation. This is getting ridiculous.", created_datetime: "2026-02-25T11:05:00Z" },
    ],
  },
  {
    id: 253911765,
    subject: "Track Order",
    status: "closed",
    channel: "chat",
    assignee: "spencer@ironsidecomputers.com",
    tags: ["ORDER-STATUS"],
    created_datetime: "2026-02-24T09:20:00Z",
    messages: [
      { id: 5003, sender: { type: "customer", name: "Jake Williams" }, body_text: "Hey can I get an update on order #952467? Placed it Feb 8.", created_datetime: "2026-02-24T09:20:00Z" },
      { id: 5004, sender: { type: "agent", name: "Spencer" }, body_text: "Hi Jake! Your order is currently in Stage 2 — Build Queue. Expected to enter assembly within 3-5 business days. You'll receive an email once it moves to Stage 3.", created_datetime: "2026-02-24T09:35:00Z" },
    ],
  },
  {
    id: 253740330,
    subject: "Track Order",
    status: "closed",
    channel: "email",
    assignee: "spencer@ironsidecomputers.com",
    tags: ["ORDER-STATUS"],
    created_datetime: "2026-02-23T16:45:00Z",
    messages: [
      { id: 5005, sender: { type: "customer", name: "Sarah Martinez" }, body_text: "Hello, I ordered a custom build (order #952311) about 10 days ago. Could you tell me where it is in the build process?", created_datetime: "2026-02-23T16:45:00Z" },
      { id: 5006, sender: { type: "agent", name: "Spencer" }, body_text: "Hi Sarah! Order #952311 is in Stage 3 — Assembly. Our tech team is building your system now. Once complete, it moves to Quality Control (Stage 4) before shipping. Estimated 5-7 more business days.", created_datetime: "2026-02-23T17:10:00Z" },
    ],
  },
  {
    id: 253344850,
    subject: "Track Order",
    status: "closed",
    channel: "chat",
    assignee: "danni-jean@ironsidecomputers.com",
    tags: ["ORDER-STATUS"],
    created_datetime: "2026-02-22T10:15:00Z",
    messages: [
      { id: 5007, sender: { type: "customer", name: "Tyler Ross" }, body_text: "Tracking for order 952099?", created_datetime: "2026-02-22T10:15:00Z" },
      { id: 5008, sender: { type: "agent", name: "Danni-Jean" }, body_text: "Hi Tyler! Your order #952099 shipped via DHL yesterday. Tracking number: 1Z999AA10123456784. You can track it at dhl.com. Expected delivery: Feb 26.", created_datetime: "2026-02-22T10:22:00Z" },
    ],
  },
  {
    id: 254164939,
    subject: "Track Order",
    status: "open",
    channel: "email",
    assignee: null,
    tags: ["ORDER-STATUS", "urgent"],
    created_datetime: "2026-02-26T08:30:00Z",
    messages: [
      { id: 5009, sender: { type: "customer", name: "David Park" }, body_text: "I've been waiting 25 days for order #952051. Your website says 15-20 business days. This is past due. I need an update immediately or I'm disputing the charge.", created_datetime: "2026-02-26T08:30:00Z" },
    ],
  },
  {
    id: 253999359,
    subject: "Fwd: Order 952099 Update: Stage 1",
    status: "closed",
    channel: "email",
    assignee: "spencer@ironsidecomputers.com",
    tags: ["ORDER-STATUS"],
    created_datetime: "2026-02-21T13:00:00Z",
    messages: [
      { id: 5010, sender: { type: "customer", name: "Tyler Ross" }, body_text: "I got this email saying Stage 1 but I thought my order was already further along? Can you clarify what stage means what?", created_datetime: "2026-02-21T13:00:00Z" },
      { id: 5011, sender: { type: "agent", name: "Spencer" }, body_text: "Hey Tyler! The stages are: 1) Order Received & Verification, 2) Build Queue, 3) Assembly, 4) Quality Control & Testing, 5) Shipping. That email was the initial confirmation. Your order has since moved to Stage 3.", created_datetime: "2026-02-21T13:25:00Z" },
    ],
  },
  {
    id: 254333436,
    subject: "DHL On Demand Delivery",
    status: "closed",
    channel: "email",
    assignee: "danni-jean@ironsidecomputers.com",
    tags: ["ORDER-STATUS"],
    created_datetime: "2026-02-24T11:30:00Z",
    messages: [
      { id: 5012, sender: { type: "customer", name: "Amanda Liu" }, body_text: "I got a DHL notification but I won't be home. Can I change the delivery to a DHL pickup location?", created_datetime: "2026-02-24T11:30:00Z" },
      { id: 5013, sender: { type: "agent", name: "Danni-Jean" }, body_text: "Hi Amanda! Yes, you can manage delivery via DHL On Demand Delivery at dhl.com/ondemand. Use your tracking number to redirect to a DHL Service Point near you.", created_datetime: "2026-02-24T11:45:00Z" },
    ],
  },

  // ========================================
  // ORDER VERIFICATION (4 tickets)
  // ========================================
  {
    id: 254414338,
    subject: "Re: Order 952555 Update: Order Verification",
    status: "open",
    channel: "email",
    assignee: null,
    tags: ["ORDER-STATUS", "urgent"],
    created_datetime: "2026-02-25T09:00:00Z",
    messages: [
      { id: 5020, sender: { type: "customer", name: "Marcus Johnson" }, body_text: "You asked me to verify my order but I already sent my ID and proof of address 3 days ago. How long does this take? My build timer shouldn't start until verification is done right?", created_datetime: "2026-02-25T09:00:00Z" },
    ],
  },
  {
    id: 253956318,
    subject: "Re: Order 952532 Update: Order Verification",
    status: "closed",
    channel: "email",
    assignee: "danni-jean@ironsidecomputers.com",
    tags: ["ORDER-STATUS"],
    created_datetime: "2026-02-23T08:15:00Z",
    messages: [
      { id: 5021, sender: { type: "customer", name: "Emily Chen" }, body_text: "Here is my photo ID and a utility bill with my address. Please verify my order ASAP.", created_datetime: "2026-02-23T08:15:00Z" },
      { id: 5022, sender: { type: "agent", name: "Danni-Jean" }, body_text: "Hi Emily, thank you for sending those over! Your order #952532 has been verified and is now in the build queue. You'll receive a confirmation email shortly. Build time is 15-20 business days from today.", created_datetime: "2026-02-23T09:40:00Z" },
    ],
  },
  {
    id: 254943155,
    subject: "Re: Order 951474 Update: Order Verification",
    status: "open",
    channel: "email",
    assignee: null,
    tags: ["ORDER-STATUS", "urgent"],
    created_datetime: "2026-02-26T15:20:00Z",
    messages: [
      { id: 5023, sender: { type: "customer", name: "Ryan O'Brien" }, body_text: "I don't understand why I need to verify. I've ordered from you before. My order number is 951474. Can someone call me?", created_datetime: "2026-02-26T15:20:00Z" },
    ],
  },
  {
    id: 253838153,
    subject: "Order Verification",
    status: "closed",
    channel: "email",
    assignee: "spencer@ironsidecomputers.com",
    tags: ["ORDER-STATUS"],
    created_datetime: "2026-02-22T14:00:00Z",
    messages: [
      { id: 5024, sender: { type: "customer", name: "Lisa Nguyen" }, body_text: "What documents do I need to send for order verification? I just placed order #952467.", created_datetime: "2026-02-22T14:00:00Z" },
      { id: 5025, sender: { type: "agent", name: "Spencer" }, body_text: "Hi Lisa! For verification we need: 1) A photo of your government-issued ID, and 2) A document showing your billing address (utility bill, bank statement, etc.). You can reply to this email with the attachments. Once verified, your order enters the build queue.", created_datetime: "2026-02-22T14:20:00Z" },
    ],
  },

  // ========================================
  // PRODUCT QUESTIONS (4 tickets)
  // ========================================
  {
    id: 254461813,
    subject: "Product Question",
    status: "open",
    channel: "chat",
    assignee: null,
    tags: [],
    created_datetime: "2026-02-26T19:30:00Z",
    messages: [
      { id: 5030, sender: { type: "customer", name: "Brandon Scott" }, body_text: "I'm looking at the Prism II. Can I upgrade the GPU to a 5090 instead of the 5080? What would the price difference be?", created_datetime: "2026-02-26T19:30:00Z" },
    ],
  },
  {
    id: 254059362,
    subject: "Product Question",
    status: "closed",
    channel: "chat",
    assignee: "spencer@ironsidecomputers.com",
    tags: [],
    created_datetime: "2026-02-25T15:00:00Z",
    messages: [
      { id: 5031, sender: { type: "customer", name: "Jessica Kim" }, body_text: "Does the Titanium Pro come with WiFi or do I need an adapter?", created_datetime: "2026-02-25T15:00:00Z" },
      { id: 5032, sender: { type: "agent", name: "Spencer" }, body_text: "Hi Jessica! The Titanium Pro includes a built-in WiFi 7 module on the motherboard. No separate adapter needed. It also has Bluetooth 5.4.", created_datetime: "2026-02-25T15:08:00Z" },
    ],
  },
  {
    id: 253752016,
    subject: "Product Question",
    status: "closed",
    channel: "email",
    assignee: "spencer@ironsidecomputers.com",
    tags: ["PRODUCT"],
    created_datetime: "2026-02-23T10:45:00Z",
    messages: [
      { id: 5033, sender: { type: "customer", name: "Alex Thompson" }, body_text: "What's the difference between the Minion and the Minion Pro? Is the Pro worth the extra money for streaming + gaming?", created_datetime: "2026-02-23T10:45:00Z" },
      { id: 5034, sender: { type: "agent", name: "Spencer" }, body_text: "Great question Alex! The Minion Pro has a higher-tier GPU (RTX 5070 vs 5060), 32GB RAM vs 16GB, and a larger SSD. For streaming + gaming simultaneously, the Pro is definitely worth it — the extra RAM and GPU power make a big difference for encoding while gaming.", created_datetime: "2026-02-23T11:20:00Z" },
    ],
  },
  {
    id: 254338352,
    subject: "Product Question",
    status: "open",
    channel: "chat",
    assignee: null,
    tags: [],
    created_datetime: "2026-02-26T21:10:00Z",
    messages: [
      { id: 5035, sender: { type: "customer", name: "Chris Morgan" }, body_text: "Can I use my own Windows license or do I have to buy one through you guys?", created_datetime: "2026-02-26T21:10:00Z" },
    ],
  },

  // ========================================
  // REPORT ISSUE / TECHNICAL (3 tickets)
  // ========================================
  {
    id: 253963210,
    subject: "WIFI/LAN Driver Issues",
    status: "open",
    channel: "email",
    assignee: "spencer@ironsidecomputers.com",
    tags: ["urgent"],
    created_datetime: "2026-02-24T18:00:00Z",
    messages: [
      { id: 5040, sender: { type: "customer", name: "Kevin Wright" }, body_text: "Just received my Ironside build and the WiFi isn't working at all. Device Manager shows the network adapter with a yellow exclamation mark. I've tried restarting. Running Windows 11.", created_datetime: "2026-02-24T18:00:00Z" },
      { id: 5041, sender: { type: "agent", name: "Spencer" }, body_text: "Hi Kevin! This is a known issue with fresh installs. Please download the latest WiFi/LAN drivers from your motherboard manufacturer's website. What motherboard model is in your build? You can find it in System Information. I'll send you the direct download link.", created_datetime: "2026-02-24T18:30:00Z" },
      { id: 5042, sender: { type: "customer", name: "Kevin Wright" }, body_text: "It's an ASUS ROG STRIX B650E-E. But I can't download anything because I have no internet connection on this PC.", created_datetime: "2026-02-24T18:45:00Z" },
    ],
  },
  {
    id: 254532830,
    subject: "Report Issue",
    status: "open",
    channel: "email",
    assignee: null,
    tags: ["urgent"],
    created_datetime: "2026-02-26T12:00:00Z",
    messages: [
      { id: 5043, sender: { type: "customer", name: "Nathan Brooks" }, body_text: "My PC is leaking coolant from the AIO water cooler. There's liquid dripping onto my GPU. I've powered it off immediately. This is a brand new build received 3 days ago. Order #952100.", created_datetime: "2026-02-26T12:00:00Z" },
    ],
  },
  {
    id: 254165553,
    subject: "Re: Report Issue",
    status: "closed",
    channel: "email",
    assignee: "danni-jean@ironsidecomputers.com",
    tags: ["urgent"],
    created_datetime: "2026-02-25T10:00:00Z",
    messages: [
      { id: 5044, sender: { type: "customer", name: "Maria Garcia" }, body_text: "The RGB fans on my new build stopped working after 2 days. Everything else is fine. Order #952311.", created_datetime: "2026-02-25T10:00:00Z" },
      { id: 5045, sender: { type: "agent", name: "Danni-Jean" }, body_text: "Hi Maria! Try this: 1) Open your BIOS (press DEL on startup), 2) Navigate to the RGB/LED settings, 3) Make sure 'Addressable RGB' is enabled. If that doesn't work, check if the RGB header cable is firmly seated on the motherboard. Let me know!", created_datetime: "2026-02-25T10:25:00Z" },
      { id: 5046, sender: { type: "customer", name: "Maria Garcia" }, body_text: "The BIOS fix worked! Thank you so much!", created_datetime: "2026-02-25T11:00:00Z" },
    ],
  },

  // ========================================
  // RETURN / EXCHANGE (2 tickets)
  // ========================================
  {
    id: 254125369,
    subject: "Return Request",
    status: "open",
    channel: "email",
    assignee: null,
    tags: ["RETURN/EXCHANGE"],
    created_datetime: "2026-02-26T09:15:00Z",
    messages: [
      { id: 5050, sender: { type: "customer", name: "Mike Turner" }, body_text: "I received my build last week but it's not performing like I expected for the price. I'd like to return it under your 30-day policy. Order #952467. What's the process?", created_datetime: "2026-02-26T09:15:00Z" },
    ],
  },
  {
    id: 253957813,
    subject: "ORDER-CHANGE/CANCEL",
    status: "closed",
    channel: "email",
    assignee: "danni-jean@ironsidecomputers.com",
    tags: ["ORDER-CHANGE/CANCEL"],
    created_datetime: "2026-02-22T16:00:00Z",
    messages: [
      { id: 5051, sender: { type: "customer", name: "Ashley Brown" }, body_text: "I need to cancel order #952051. I found a better deal elsewhere. It hasn't entered the build queue yet so it should be possible right?", created_datetime: "2026-02-22T16:00:00Z" },
      { id: 5052, sender: { type: "agent", name: "Danni-Jean" }, body_text: "Hi Ashley, I've cancelled order #952051 for you. Since it hadn't entered the build queue, you'll receive a full refund within 5-7 business days to your original payment method. You'll get a confirmation email shortly.", created_datetime: "2026-02-22T16:30:00Z" },
    ],
  },

  // ========================================
  // CONTACT FORM SUBMISSIONS (2 real tickets)
  // ========================================
  {
    id: 254942337,
    subject: "New submission from Contact",
    status: "open",
    channel: "email",
    assignee: null,
    tags: [],
    created_datetime: "2026-02-26T20:00:00Z",
    messages: [
      { id: 5060, sender: { type: "customer", name: "Rachel Kim" }, body_text: "I'm interested in a bulk order of 10 gaming PCs for our esports team. Can someone from sales reach out? rachel@teamfrost.gg", created_datetime: "2026-02-26T20:00:00Z" },
    ],
  },
  {
    id: 253871727,
    subject: "New submission from Contact",
    status: "closed",
    channel: "email",
    assignee: "spencer@ironsidecomputers.com",
    tags: ["csat-2week"],
    created_datetime: "2026-02-23T07:30:00Z",
    messages: [
      { id: 5061, sender: { type: "customer", name: "Tom Harris" }, body_text: "Just wanted to say my Ironside Titan arrived and it's absolutely incredible. Best PC I've ever owned. Build quality is top notch.", created_datetime: "2026-02-23T07:30:00Z" },
      { id: 5062, sender: { type: "agent", name: "Spencer" }, body_text: "Thanks so much Tom! We really appreciate the kind words. Enjoy your Titan! If you ever need anything, don't hesitate to reach out.", created_datetime: "2026-02-23T08:00:00Z" },
    ],
  },

  // ========================================
  // CSAT FOLLOW-UP (1 ticket)
  // ========================================
  {
    id: 254011265,
    subject: "Re: How's your new Ironside? (2-week check-in)",
    status: "closed",
    channel: "email",
    assignee: "danni-jean@ironsidecomputers.com",
    tags: ["csat-2week", "feedback", "positive"],
    created_datetime: "2026-02-24T13:00:00Z",
    messages: [
      { id: 5070, sender: { type: "customer", name: "James Wilson" }, body_text: "Everything is running great! Getting 120+ FPS on Cyberpunk at max settings. Very happy with the purchase.", created_datetime: "2026-02-24T13:00:00Z" },
      { id: 5071, sender: { type: "agent", name: "Danni-Jean" }, body_text: "Awesome to hear James! Those are great numbers. If you ever need help or have questions, we're here for you. Game on!", created_datetime: "2026-02-24T13:15:00Z" },
    ],
  },

  // ========================================
  // SPAM / NON-SUPPORT (10 tickets, all auto-closed)
  // Mirrors real patterns: business loans, phishing, SEO, bulk hardware, unicode scams
  // ========================================
  {
    id: 254549291,
    subject: "Reminder: Business Funding Pre-Approval Closing",
    status: "closed",
    channel: "email",
    assignee: null,
    tags: ["auto-close", "non-support-related"],
    created_datetime: "2026-02-26T03:00:00Z",
    messages: [
      { id: 5080, sender: { type: "customer", name: "Capital Advance Group" }, body_text: "Your business has been pre-approved for up to $350,000 in working capital. Limited time offer. Click here to claim your funds before this offer expires.", created_datetime: "2026-02-26T03:00:00Z" },
    ],
  },
  {
    id: 254549290,
    subject: "Final Chance for Fast, Easy Business Funding.",
    status: "closed",
    channel: "email",
    assignee: null,
    tags: ["auto-close", "non-support-related"],
    created_datetime: "2026-02-26T02:45:00Z",
    messages: [
      { id: 5081, sender: { type: "customer", name: "QuickFund Solutions" }, body_text: "Don't miss out on this opportunity. Get $50K-$500K deposited in as fast as 24 hours. No collateral needed.", created_datetime: "2026-02-26T02:45:00Z" },
    ],
  },
  {
    id: 254493246,
    subject: "From Mr.Charles G.Stven REPLY ASAP",
    status: "closed",
    channel: "email",
    assignee: null,
    tags: ["auto-close", "non-support-related"],
    created_datetime: "2026-02-25T22:30:00Z",
    messages: [
      { id: 5082, sender: { type: "customer", name: "Mr. Charles G. Stven" }, body_text: "Dear Friend, I am Mr. Charles G. Stven, a senior banker. I have a business proposal worth $14.5M USD that requires your cooperation. Please reply for details.", created_datetime: "2026-02-25T22:30:00Z" },
    ],
  },
  {
    id: 254761427,
    subject: "You have 4 message(s) in your quarantine inbox",
    status: "closed",
    channel: "email",
    assignee: null,
    tags: ["auto-close", "non-support-related"],
    created_datetime: "2026-02-26T06:00:00Z",
    messages: [
      { id: 5083, sender: { type: "customer", name: "Email Security Alert" }, body_text: "Action Required: You have 4 undelivered messages in quarantine. Click here to review and release them before they are permanently deleted.", created_datetime: "2026-02-26T06:00:00Z" },
    ],
  },
  {
    id: 253073657,
    subject: "45x HP EliteDesk 800 G5 Mini-24.02.2026",
    status: "closed",
    channel: "email",
    assignee: null,
    tags: ["auto-close", "non-support-related"],
    created_datetime: "2026-02-24T04:00:00Z",
    messages: [
      { id: 5084, sender: { type: "customer", name: "IT Liquidators BV" }, body_text: "Dear Sir/Madam, We have 45x HP EliteDesk 800 G5 Mini available for immediate sale. Grade A refurbished. Please see attached price list.", created_datetime: "2026-02-24T04:00:00Z" },
    ],
  },
  {
    id: 254416849,
    subject: "Steel products for your project needs",
    status: "closed",
    channel: "email",
    assignee: null,
    tags: ["auto-close", "non-support-related"],
    created_datetime: "2026-02-25T01:15:00Z",
    messages: [
      { id: 5085, sender: { type: "customer", name: "Jiangsu Steel Co." }, body_text: "Hello, we are a leading steel manufacturer. We offer competitive prices on stainless steel sheets, pipes, and fittings. MOQ: 5 tons. Please contact for quote.", created_datetime: "2026-02-25T01:15:00Z" },
    ],
  },
  {
    id: 254900488,
    subject: "\u054Dр\u0581r\u0561\u0501\u0435 \u0545\u03BF\u057D\u0440 \u053E\u0561\u056C\u056C\u0435\u057F \u039D\u03BF\u0561",
    status: "closed",
    channel: "email",
    assignee: null,
    tags: ["auto-close", "non-support-related"],
    created_datetime: "2026-02-26T04:30:00Z",
    messages: [
      { id: 5086, sender: { type: "customer", name: "Crypto Wallet Service" }, body_text: "Your wallet requires immediate verification. Click the link below to secure your assets before access is revoked.", created_datetime: "2026-02-26T04:30:00Z" },
    ],
  },
  {
    id: 255083063,
    subject: "Improper Use of Protected Audio in Media Content",
    status: "closed",
    channel: "email",
    assignee: null,
    tags: ["auto-close", "non-support-related"],
    created_datetime: "2026-02-27T02:00:00Z",
    messages: [
      { id: 5087, sender: { type: "customer", name: "Legal Notice Dept" }, body_text: "We have identified unauthorized use of copyrighted audio content on your website. Please review the attached cease and desist notice and respond within 48 hours.", created_datetime: "2026-02-27T02:00:00Z" },
    ],
  },
  {
    id: 255003357,
    subject: "E-mail Account Notification For customerservice@ironsidecomputers.com !!!",
    status: "closed",
    channel: "email",
    assignee: null,
    tags: ["auto-close", "non-support-related"],
    created_datetime: "2026-02-27T01:00:00Z",
    messages: [
      { id: 5088, sender: { type: "customer", name: "Mail System Administrator" }, body_text: "Your email account storage is almost full. Click here to upgrade your storage to avoid losing incoming messages.", created_datetime: "2026-02-27T01:00:00Z" },
    ],
  },
  {
    id: 254610241,
    subject: "2026 Annual Leave Compliance Report",
    status: "closed",
    channel: "email",
    assignee: null,
    tags: ["auto-close", "non-support-related"],
    created_datetime: "2026-02-26T05:00:00Z",
    messages: [
      { id: 5089, sender: { type: "customer", name: "HR Compliance Team" }, body_text: "Please review and acknowledge your 2026 Annual Leave Compliance Report. Failure to respond within 24 hours may result in payroll adjustments.", created_datetime: "2026-02-26T05:00:00Z" },
    ],
  },

  // ========================================
  // GIVEAWAY (1 ticket — reflects Mackenzie's bulk sends)
  // ========================================
  {
    id: 254493194,
    subject: "Battlefield Giveaway Secret Codes",
    status: "closed",
    channel: "email",
    assignee: "mackenzie@ironsidecomputers.com",
    tags: ["PROMOTION"],
    created_datetime: "2026-02-25T20:00:00Z",
    messages: [
      { id: 5090, sender: { type: "agent", name: "Mackenzie" }, body_text: "Congratulations! Here is your secret code for the Ironside x Battlefield giveaway: BF-IRON-X7K9M. Enter this code at ironsidecomputers.com/giveaway before March 15, 2026.", created_datetime: "2026-02-25T20:00:00Z" },
    ],
  },
];

export function getMockTickets(): GorgiasTicket[] {
  return MOCK_TICKETS;
}

export function getMockTicket(id: number): GorgiasTicket | undefined {
  return MOCK_TICKETS.find((t) => t.id === id);
}

export interface MockSearchFilters {
  status?: "open" | "closed";
  search?: string;
  limit?: number;
}

export function searchMockTickets(filters: MockSearchFilters = {}): GorgiasTicket[] {
  let results = [...MOCK_TICKETS];

  if (filters.status) {
    results = results.filter((t) => t.status === filters.status);
  }

  if (filters.search) {
    const term = filters.search.toLowerCase();
    results = results.filter(
      (t) =>
        t.subject.toLowerCase().includes(term) ||
        t.tags.some((tag) => tag.toLowerCase().includes(term)) ||
        t.messages.some((m) => m.body_text.toLowerCase().includes(term))
    );
  }

  if (filters.limit && filters.limit > 0) {
    results = results.slice(0, filters.limit);
  }

  return results;
}

// --- Mock write operations (SW2) ---
// These log what WOULD happen and mutate in-memory data for consistency.

let nextTicketId = 255100000;
let nextMessageId = 6000;

function findTicketOrThrow(id: number): GorgiasTicket {
  const ticket = MOCK_TICKETS.find((t) => t.id === id);
  if (!ticket) throw new Error(`Mock ticket ${id} not found`);
  return ticket;
}

export function mockCreateTicket(data: { customer_email: string; subject: string; message: string }): object {
  const id = nextTicketId++;
  const ticket: GorgiasTicket = {
    id,
    subject: data.subject,
    status: "open",
    channel: "email",
    assignee: null,
    tags: [],
    created_datetime: new Date().toISOString(),
    messages: [
      { id: nextMessageId++, sender: { type: "customer", name: data.customer_email }, body_text: data.message, created_datetime: new Date().toISOString() },
    ],
  };
  MOCK_TICKETS.push(ticket);
  console.log(`[MOCK] Created ticket #${id}: "${data.subject}"`);
  return { id, status: "created", ticket };
}

export function mockAssignTicket(ticketId: number, assigneeEmail: string): object {
  const ticket = findTicketOrThrow(ticketId);
  const previous = ticket.assignee;
  ticket.assignee = assigneeEmail;
  console.log(`[MOCK] Assigned ticket #${ticketId} to ${assigneeEmail} (was: ${previous ?? "unassigned"})`);
  return { id: ticketId, assignee: assigneeEmail, status: "updated" };
}

export function mockSetPriority(ticketId: number, priority: string): object {
  findTicketOrThrow(ticketId);
  console.log(`[MOCK] Set priority on ticket #${ticketId} to "${priority}"`);
  return { id: ticketId, priority, status: "updated" };
}

export function mockSetStatus(ticketId: number, status: "open" | "closed"): object {
  const ticket = findTicketOrThrow(ticketId);
  const previous = ticket.status;
  ticket.status = status;
  console.log(`[MOCK] Set status on ticket #${ticketId} to "${status}" (was: "${previous}")`);
  return { id: ticketId, status, previous_status: previous };
}

export function mockUpdateTags(ticketId: number, tags: string[]): object {
  const ticket = findTicketOrThrow(ticketId);
  const previous = ticket.tags;
  ticket.tags = tags;
  console.log(`[MOCK] Updated tags on ticket #${ticketId}: [${tags.join(", ")}] (was: [${previous.join(", ")}])`);
  return { id: ticketId, tags, previous_tags: previous };
}

export function mockReplyPublic(ticketId: number, body: string): object {
  const ticket = findTicketOrThrow(ticketId);
  const msg: GorgiasMessage = { id: nextMessageId++, sender: { type: "agent", name: "AI Agent" }, body_text: body, created_datetime: new Date().toISOString() };
  ticket.messages.push(msg);
  console.log(`[MOCK] Public reply on ticket #${ticketId}: "${body.slice(0, 80)}..."`);
  return { id: msg.id, ticket_id: ticketId, type: "public_reply", status: "sent" };
}

export function mockCommentInternal(ticketId: number, body: string): object {
  const ticket = findTicketOrThrow(ticketId);
  const msg: GorgiasMessage = { id: nextMessageId++, sender: { type: "agent", name: "AI Agent (internal)" }, body_text: body, created_datetime: new Date().toISOString() };
  ticket.messages.push(msg);
  console.log(`[MOCK] Internal note on ticket #${ticketId}: "${body.slice(0, 80)}..."`);
  return { id: msg.id, ticket_id: ticketId, type: "internal_note", status: "sent" };
}

// --- Mock Gorgias Macros ---
// Mirrors the real Gorgias Macros API: GET /api/macros

export interface GorgiasMacro {
  id: number;
  name: string;
  body_text: string;
  actions: { type: string; value?: string }[];
  tags: string[];
  created_datetime: string;
  updated_datetime: string;
}

const MOCK_MACROS: GorgiasMacro[] = [
  {
    id: 101,
    name: "Order Status — In Build Window",
    body_text:
      "Hi {{ticket.customer.first_name}},\n\n" +
      "Thank you for reaching out! Your custom build is currently in progress.\n\n" +
      "Our standard build time is 15-20 business days from the date your order is verified. Here are the stages your order goes through:\n\n" +
      "1. Order Received & Verification\n2. Build Queue\n3. Assembly\n4. Quality Control & Testing\n5. Shipping (via DHL)\n\n" +
      "You'll receive an email notification each time your order advances to the next stage. If you have any questions in the meantime, we're here to help!\n\n" +
      "Best regards,\n{{ticket.assignee_user.first_name}}",
    actions: [{ type: "set_tags", value: "ORDER-STATUS" }],
    tags: ["order-status", "standard"],
    created_datetime: "2025-06-15T10:00:00Z",
    updated_datetime: "2026-01-20T14:30:00Z",
  },
  {
    id: 102,
    name: "Order Status — Shipped",
    body_text:
      "Hi {{ticket.customer.first_name}},\n\n" +
      "Great news — your Ironside build has shipped! Your DHL tracking number is included in the shipping confirmation email we sent.\n\n" +
      "Track your package: https://www.dhl.com/us-en/home/tracking.html\n\n" +
      "Need to change delivery? Use DHL On Demand: https://www.dhl.com/us-en/home/our-divisions/parcel/private-customers/receiving/on-demand-delivery.html\n\n" +
      "Typical delivery is 3-5 business days. Enjoy your new build!\n\n" +
      "Best,\n{{ticket.assignee_user.first_name}}",
    actions: [{ type: "set_tags", value: "ORDER-STATUS" }],
    tags: ["order-status", "shipped"],
    created_datetime: "2025-06-15T10:00:00Z",
    updated_datetime: "2026-02-01T09:00:00Z",
  },
  {
    id: 103,
    name: "Order Status — Overdue / Delayed",
    body_text:
      "Hi {{ticket.customer.first_name}},\n\n" +
      "I sincerely apologize for the delay on your order. I understand this has exceeded our standard build window, and I know that's frustrating.\n\n" +
      "I've escalated your order to our build team for a priority status update. I'll personally follow up within 24 hours with specifics on where your build is and a revised timeline.\n\n" +
      "Thank you for your patience — we want to get your system to you as soon as possible.\n\n" +
      "Best,\n{{ticket.assignee_user.first_name}}",
    actions: [{ type: "set_tags", value: "ORDER-STATUS" }, { type: "set_tags", value: "urgent" }],
    tags: ["order-status", "overdue", "escalation"],
    created_datetime: "2025-08-01T10:00:00Z",
    updated_datetime: "2026-02-10T11:00:00Z",
  },
  {
    id: 104,
    name: "Verification — Documents Needed",
    body_text:
      "Hi {{ticket.customer.first_name}},\n\n" +
      "Thank you for your order! Before we can begin your build, we need to complete a quick verification step.\n\n" +
      "Please reply with:\n1. A photo of your government-issued ID (driver's license or passport)\n2. A document showing your billing address (utility bill, bank statement, etc.)\n\n" +
      "Once verified, your order enters the build queue and the 15-20 business day build window begins.\n\n" +
      "This is a standard security measure to protect our customers. We appreciate your understanding!\n\n" +
      "Best,\n{{ticket.assignee_user.first_name}}",
    actions: [{ type: "set_tags", value: "ORDER-STATUS" }],
    tags: ["verification", "standard"],
    created_datetime: "2025-07-01T10:00:00Z",
    updated_datetime: "2026-01-15T08:00:00Z",
  },
  {
    id: 105,
    name: "Verification — Confirmed",
    body_text:
      "Hi {{ticket.customer.first_name}},\n\n" +
      "Your order has been verified! It's now in the build queue.\n\n" +
      "Your 15-20 business day build window starts today. You'll receive email updates as your build progresses through each stage.\n\n" +
      "Thank you for getting those documents over — if you have any questions while you wait, we're here!\n\n" +
      "Best,\n{{ticket.assignee_user.first_name}}",
    actions: [{ type: "set_status", value: "closed" }],
    tags: ["verification", "confirmed"],
    created_datetime: "2025-07-01T10:00:00Z",
    updated_datetime: "2026-01-15T08:00:00Z",
  },
  {
    id: 106,
    name: "WIFI / LAN Driver Fix",
    body_text:
      "Hi {{ticket.customer.first_name}},\n\n" +
      "This is a common issue with fresh Windows installs — the WiFi/LAN drivers need to be installed manually.\n\n" +
      "Since you may not have internet on the PC yet:\n\n" +
      "Option A (fastest): Use your phone as a USB hotspot — plug your phone into the PC via USB, enable USB tethering in your phone's settings, then run Windows Update.\n\n" +
      "Option B: On another device, go to your motherboard manufacturer's website, download the WiFi/LAN drivers to a USB flash drive, and install them on your new build.\n\n" +
      "If you tell me your motherboard model (check System Information on the PC), I'll send you the direct download link!\n\n" +
      "Best,\n{{ticket.assignee_user.first_name}}",
    actions: [{ type: "set_tags", value: "urgent" }],
    tags: ["technical", "drivers", "wifi"],
    created_datetime: "2025-09-01T10:00:00Z",
    updated_datetime: "2026-02-15T16:00:00Z",
  },
  {
    id: 107,
    name: "Water Cooling Leak — CRITICAL RMA",
    body_text:
      "Hi {{ticket.customer.first_name}},\n\n" +
      "Thank you for contacting us immediately — powering off was absolutely the right call.\n\n" +
      "IMPORTANT: Please do NOT power the system back on. Liquid contact with components can cause damage that worsens with electricity.\n\n" +
      "Here's what happens next:\n1. We're initiating an RMA for your system\n2. You'll receive a prepaid DHL shipping label within 24 hours\n3. Ship the system back in its original packaging\n4. Our techs will inspect, repair, and fully test before returning it\n\n" +
      "Any damage caused by the leak is fully covered under warranty. We sincerely apologize for this experience.\n\n" +
      "I'll follow up shortly with your shipping label.\n\n" +
      "Best,\n{{ticket.assignee_user.first_name}}",
    actions: [{ type: "set_tags", value: "urgent" }, { type: "set_tags", value: "RETURN/EXCHANGE" }],
    tags: ["technical", "critical", "rma", "water-cooling"],
    created_datetime: "2025-10-01T10:00:00Z",
    updated_datetime: "2026-02-20T12:00:00Z",
  },
  {
    id: 108,
    name: "Return — Process & Policy",
    body_text:
      "Hi {{ticket.customer.first_name}},\n\n" +
      "We're sorry to hear the build isn't meeting your expectations. Here's our return process:\n\n" +
      "• Returns accepted within 30 days of delivery\n• System must be in original condition with all accessories\n• 15% restocking fee applies\n• Refund processed within 5-7 business days after inspection\n\n" +
      "To start:\n1. Reply confirming you'd like to proceed\n2. We'll send a prepaid return label\n3. Pack in the original box and ship back\n\n" +
      "Before returning — would you like to tell us what's not meeting expectations? We may be able to resolve the issue or suggest an upgrade.\n\n" +
      "Best,\n{{ticket.assignee_user.first_name}}",
    actions: [{ type: "set_tags", value: "RETURN/EXCHANGE" }],
    tags: ["returns", "standard"],
    created_datetime: "2025-06-20T10:00:00Z",
    updated_datetime: "2026-01-25T10:00:00Z",
  },
  {
    id: 109,
    name: "CSAT — 2 Week Check-In",
    body_text:
      "Hi {{ticket.customer.first_name}},\n\n" +
      "It's been about two weeks since you received your Ironside build — how's everything going?\n\n" +
      "We'd love to hear how it's performing! If you've run into any issues or have questions about getting the most out of your system, we're here to help.\n\n" +
      "Enjoy your build!\n\n" +
      "Best,\n{{ticket.assignee_user.first_name}}",
    actions: [{ type: "set_tags", value: "csat-2week" }],
    tags: ["csat", "follow-up"],
    created_datetime: "2025-11-01T10:00:00Z",
    updated_datetime: "2026-02-01T10:00:00Z",
  },
  {
    id: 110,
    name: "Spam / Non-Support Auto-Close",
    body_text: "",
    actions: [{ type: "set_tags", value: "auto-close" }, { type: "set_tags", value: "non-support-related" }, { type: "set_status", value: "closed" }],
    tags: ["spam", "auto-close"],
    created_datetime: "2025-06-01T10:00:00Z",
    updated_datetime: "2026-02-20T10:00:00Z",
  },
];

export function getMockMacros(): GorgiasMacro[] {
  return MOCK_MACROS;
}

export function getMockMacro(id: number): GorgiasMacro | undefined {
  return MOCK_MACROS.find((m) => m.id === id);
}

export function searchMockMacros(search?: string): GorgiasMacro[] {
  if (!search) return MOCK_MACROS;
  const term = search.toLowerCase();
  return MOCK_MACROS.filter(
    (m) =>
      m.name.toLowerCase().includes(term) ||
      m.tags.some((t) => t.toLowerCase().includes(term))
  );
}
