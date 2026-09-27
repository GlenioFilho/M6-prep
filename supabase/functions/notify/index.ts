// Supabase Edge Function (deployed as "swift-responder"): sends a push notification to every
// subscribed phone when a car is added to stock.
//
// Called by the vehicles_notify_new_stock trigger with { vehicle_id, event }.
// It trusts nothing in the request except the vehicle id: it reloads the
// vehicle, only announces recently-added stock, and announces each vehicle at
// most once (push_sent), so calling it by hand can't spam anyone.
//
// Secret required (Edge Functions → Secrets): VAPID_PRIVATE_KEY
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY =
  "BMFMe6gxKnHFwakeLJEnZIiHGazNLizHwKe2BUJxeYc6Tx-ZAaUnuj23TcrQ_HTxwczOl1Ny1Kj7h9rTGmRZ6E4";
const RECENT_MS = 10 * 60 * 1000;

webpush.setVapidDetails(
  "https://m6motors.netlify.app",
  VAPID_PUBLIC_KEY,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const { vehicle_id, event = "new_stock" } = await req.json().catch(() => ({}));
  if (!vehicle_id || event !== "new_stock") return json({ error: "bad request" }, 400);

  const { data: v } = await db.from("vehicles").select("*").eq("id", vehicle_id).maybeSingle();
  if (!v || v.status !== "stock" || Date.now() - new Date(v.created_at).getTime() > RECENT_MS) {
    return json({ skipped: "not a new stock vehicle" });
  }

  // Claim the announcement; a duplicate insert means it was already sent.
  const { error: claimError } = await db.from("push_sent").insert({ vehicle_id, event });
  if (claimError) return json({ skipped: "already sent" });

  const plate = [v.reg_ie, v.reg_imp].filter(Boolean).join(" / ");
  const car = [v.make, v.model].filter(Boolean).join(" ") || "Vehicle";
  const payload = JSON.stringify({
    title: "🚗 New stock",
    body: [car, v.color, plate].filter(Boolean).join(" · "),
    url: "./?tab=stock",
    tag: `stock-${v.id}`,
  });

  let query = db.from("push_subscriptions").select("endpoint, p256dh, auth");
  if (v.created_by) query = query.neq("user_id", v.created_by);
  const { data: subs = [] } = await query;

  let sent = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 60 * 60 * 12 },
      );
      sent++;
    } catch (err) {
      // Phone unsubscribed or app removed: forget it
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      else console.error("push failed", code, (err as Error).message);
    }
  }));

  return json({ sent, subscribers: subs?.length ?? 0 });
});
