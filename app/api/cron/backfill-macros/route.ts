import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadMacroTemplates, matchMacro } from "@/lib/gorgias/macro-matcher";
import { logCronError } from "@/lib/services/logging.service";

export const maxDuration = 30;

// Macro CSV data — exported from Gorgias Settings → Macros
// These are the actual Ironside team macro templates
const IRONSIDE_MACROS = [
  { id: 187020, name: "Verification Completed", usage: 718, bodyText: "Thank you for verifying with us. We have put your order in the received status, and you should start seeing some updates to your order shortly. If you have any questions during this process, please feel free to send us a message. Have a great day!" },
  { id: 229050, name: "RMA standard", usage: 504, bodyText: "Please confirm the following information for our technicians to complete your repair Warranty: Shipping Address: Contact Info: Password/PIN: Windows Reinstall Permission: Symptoms: Troubleshooting: Special note: Packaging Instructions Please place your computer in the full original packaging whenever possible. Clearly write your RMA Number on the outside of the box." },
  { id: 289159, name: "WhEre'S My cOmpUter", usage: 375, bodyText: "Thanks for reaching out! Your computer could take up to 10-15 business days to be built in our facility before it would be shipped out to you. Please note that our current business days are Monday Thursday. Once the shipping label has been printed for your order, you will receive an automated email with your tracking information that will provide more of an exact date the delivery is expected." },
  { id: 288633, name: "Bundle RE", usage: 321, bodyText: "REDEEM YOUR COUPON THROUGH THE NVIDIA APP To redeem your promotional code for Resident Evil Requiem Standard Edition you must have a NVIDIA app and a Steam account." },
  { id: 187036, name: "review (free)", usage: 192, bodyText: "Good afternoon, and thank you for gaming with Ironside Computers! If you're happy with your system, or with our team, we would appreciate it more than we can tell you if you would leave us a positive review on our Reseller Ratings Page" },
  { id: 276656, name: "review- incentive", usage: 188, bodyText: "Thank you for leaving a review with us! To show our appreciation for your feedback, I wanted to gift you a Steam code!" },
  { id: 305709, name: "Checking in on your order", usage: 154, bodyText: "Thanks for reaching out! Checking in on your order, I can see it's in the queue, as Order Confirmed is where our queue starts. Our current projected build time is 10-15 business days, which includes the days spent in the queue." },
  { id: 302353, name: "WhEre'S My cAsE", usage: 146, bodyText: "Thanks for reaching out! Your case could take up to 15 business days to be detailed in our facility before it would be shipped out to you. Please note that our current business days are Monday Thursday." },
  { id: 308881, name: "CODE", usage: 129, bodyText: "Thanks for filling out the newsletter troubleshooting form. All the issues should be resolved by now, but since the giveaway is coming to an end, I want to make sure you get all the codes: GAMECHANGER FIRSTHIT RESPAWN RAYTRACING CHECKPOINT" },
  { id: 229056, name: "RMA single component", usage: 78, bodyText: "Please confirm the following information for our technicians to complete your repair Warranty: Shipping Address: Contact Info: Component: Symptoms: Troubleshooting: Special note: Please place your component in the recommended packaging" },
  { id: 299171, name: "Active Giveaways", usage: 57, bodyText: "You can get help with secret codes and view all of our active giveaways by joining the Discord server" },
  { id: 188170, name: "Verification", usage: 48, bodyText: "We are contacting you today in regard to our verification process. This process is to cut down on potential fraud and your correspondence is much appreciated. Before we can begin working on your order we will need verify your billing address with a state-issued ID" },
  { id: 187053, name: "Reinstall Windows", usage: 43, bodyText: "For the next step, I would recommend reinstalling Windows on your PC so we can get to the root of any software issues. Please be aware that this will delete all locally saved data on the device." },
  { id: 250339, name: "Revew- Yelp", usage: 39, bodyText: "Good afternoon, and thank you for gaming with Ironside Computers! I hope you're enjoying your system! If you're happy with your system, or with our team, we would appreciate it more than we can tell you if you would leave us a positive review on Yelp" },
  { id: 187025, name: "International Shipping", usage: 37, bodyText: "Thank you for taking an interest in Ironside Computers We ship our computers worldwide! You can check if we ship to your location at checkout once you enter the country and address." },
  { id: 250047, name: "BAV billing needed", usage: 32, bodyText: "Thank you for providing these documents! I will still need something with the billing address on file but then you'll be all set. This can be a piece of mail or any other official document." },
  { id: 281248, name: "Thank you review", usage: 30, bodyText: "You're the best! Let me know if you have any questions and I hope you enjoy your new system." },
  { id: 204150, name: "windows- deactivated", usage: 27, bodyText: "There has been a recent Windows update which is known to deactivate your OS. All you need to do to reactivate the system is enter your activation code in the activation settings. The activation code is on the back of your PC on a sticker with the Microsoft logo on it." },
  { id: 229051, name: "RMA custom loop", usage: 21, bodyText: "Please confirm the following information for our technicians to complete your repair Warranty: Shipping Address: Contact Info: PIN: Windows Reset Authorization: Symptoms: Troubleshooting: Special note: Ensure that you fully drain the system" },
  { id: 289161, name: "Details- Box", usage: 20, bodyText: "Our Juicebox Milkbox cases are built in the Corsair 3500X. If you're curious about the case dimensions, you can see the full details here" },
  { id: 187034, name: "Sponsorship Inquiry", usage: 19, bodyText: "Thank you for taking an interest in Ironside Computers! In order to be considered for a sponsorship deal, you will need to meet the following requirements: a minimum of 75,000 subscribers" },
  { id: 301052, name: "giveaway FAQ", usage: 17, bodyText: "Ironside Computers Giveaway FAQ My entry wasn't counted for discord, X, instagram. Gleam should open a popup to accept follow or join to complete the action." },
  { id: 300635, name: "case end date", usage: 14, bodyText: "We don't have a set end date for this case. When one is decided on, it will be announced through our newsletter" },
  { id: 289162, name: "Details- Edens Veil", usage: 11, bodyText: "Our Eden's Veil cases are built in the Fractal North. If you're curious about the case dimensions, you can see the full details here" },
];

/**
 * Backfills macroIdUsed and macroName on agent behavior logs by comparing
 * response text against known Ironside macro templates using text similarity.
 *
 * Processes 50 un-matched rows per invocation.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Load macro templates
    loadMacroTemplates(IRONSIDE_MACROS);

    // Find agent messages with response text but no macro match
    const rows = await prisma.agentBehaviorLog.findMany({
      where: {
        macroIdUsed: null,
        responseText: { not: null },
        action: "message",
        agent: { not: "system" },
      },
      select: {
        id: true,
        responseText: true,
        ticketId: true,
      },
      take: 50,
      orderBy: { occurredAt: "desc" },
    });

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, matched: 0, message: "No unmatched messages remaining" });
    }

    let matched = 0;
    let noMatch = 0;

    for (const row of rows) {
      if (!row.responseText) { noMatch++; continue; }

      const match = matchMacro(row.responseText);
      if (match) {
        await prisma.agentBehaviorLog.update({
          where: { id: row.id },
          data: {
            macroIdUsed: match.macroId,
            macroName: match.macroName,
          },
        });
        matched++;
      } else {
        noMatch++;
      }
    }

    const remaining = await prisma.agentBehaviorLog.count({
      where: {
        macroIdUsed: null,
        responseText: { not: null },
        action: "message",
        agent: { not: "system" },
      },
    });

    console.log(`[backfill-macros] Matched ${matched}/${rows.length}, ${noMatch} no match, ${remaining} remaining`);
    return NextResponse.json({ ok: true, matched, noMatch, processed: rows.length, remaining });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[cron/backfill-macros] Error:", errorMessage);
    await logCronError({ metric: "cron_backfill_macros_error", error: errorMessage });
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}
