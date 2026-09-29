// Supabase Edge Function (deployed as "swift-responder"): push notifications.
//
// Events (sent by database triggers / pg_cron — see 002_*.sql and 011_*.sql):
//   new_stock   { vehicle_id }  a car was added to stock        → everyone except who added it
//   ready_doing { vehicle_id }  prep of a sold car has started   → "sold alerts" people except who started it
//   ready_done  { vehicle_id }  a sold car is ready to go        → "sold alerts" people except who finished it
//   morning     {}              8am Dublin: today's deliveries    → "sold alerts" people
//
// It trusts nothing in the request except the vehicle id: it reloads the data,
// checks the event really just happened, and sends each announcement at most
// once, so calling it by hand can't spam anyone.
//
// Secret required (Edge Functions → Secrets): VAPID_PRIVATE_KEY
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY =
  "BMFMe6gxKnHFwakeLJEnZIiHGazNLizHwKe2BUJxeYc6Tx-ZAaUnuj23TcrQ_HTxwczOl1Ny1Kj7h9rTGmRZ6E4";
const RECENT_MS = 10 * 60 * 1000;
const TZ = "Europe/Dublin";

webpush.setVapidDetails("https://m6motorsie.github.io", VAPID_PUBLIC_KEY, Deno.env.get("VAPID_PRIVATE_KEY")!);

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Vehicle = Record<string, any>;
const plateOf = (v: Vehicle) => [v.reg_ie, v.reg_imp].filter(Boolean).join(" / ");
const carOf = (v: Vehicle) => [v.make, v.model].filter(Boolean).join(" ") || "Vehicle";
const recent = (ts?: string) => !!ts && Date.now() - new Date(ts).getTime() < RECENT_MS;

// Claim an announcement; false if it was already sent.
async function claim(key: string) {
  const { error } = await db.from("push_log").insert({ key });
  return !error;
}

async function nameOf(id?: string) {
  if (!id) return "Someone";
  const { data } = await db.from("profiles").select("display_name").eq("id", id).maybeSingle();
  return data?.display_name || "Someone";
}

// Dublin wall-clock parts for "now"
function dublinNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

async function send(payload: object, { onlyUsers, exceptUser }: { onlyUsers?: string[]; exceptUser?: string } = {}) {
  if (onlyUsers && !onlyUsers.length) return { sent: 0, subscribers: 0 };
  let query = db.from("push_subscriptions").select("endpoint, p256dh, auth, user_id");
  if (onlyUsers) query = query.in("user_id", onlyUsers);
  if (exceptUser) query = query.neq("user_id", exceptUser);
  const { data: subs } = await query;
  const body = JSON.stringify(payload);
  let sent = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 12 });
      sent++;
    } catch (err) {
      // Phone unsubscribed or app removed: forget it
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      else console.error("push failed", code, (err as Error).message);
    }
  }));
  return { sent, subscribers: subs?.length ?? 0 };
}

async function soldAlertUsers() {
  const { data } = await db.from("profiles").select("id").eq("sold_alerts", true);
  return (data ?? []).map((p) => p.id as string);
}

async function newStock(vehicle_id: string) {
  const { data: v } = await db.from("vehicles").select("*").eq("id", vehicle_id).maybeSingle();
  if (!v || v.status !== "stock" || !recent(v.created_at)) return json({ skipped: "not a new stock vehicle" });
  const { error } = await db.from("push_sent").insert({ vehicle_id, event: "new_stock" });
  if (error) return json({ skipped: "already sent" });
  return json(await send({
    title: "🚗 New stock",
    body: [carOf(v), v.color, plateOf(v)].filter(Boolean).join(" · "),
    url: "./?tab=stock",
    tag: `stock-${v.id}`,
  }, { exceptUser: v.created_by ?? undefined }));
}

async function ready(vehicle_id: string, event: "ready_doing" | "ready_done") {
  const { data: v } = await db.from("vehicles").select("*").eq("id", vehicle_id).maybeSingle();
  const doing = event === "ready_doing";
  const ts = doing ? v?.ready_started_at : v?.ready_at;
  if (!v || v.ready_state !== (doing ? "doing" : "done") || !recent(ts)) return json({ skipped: "no such change" });
  if (!(await claim(`${event}:${vehicle_id}:${ts}`))) return json({ skipped: "already sent" });
  const who = await nameOf(v.ready_by);
  const when = [v.delivery_date, v.delivery_time].filter(Boolean).join(" ");
  return json(await send({
    title: doing ? `🔧 ${who} started prep: ${carOf(v)}` : `✅ Ready to go: ${carOf(v)}`,
    body: [plateOf(v), when && `delivery ${when}`, !doing && `by ${who}`].filter(Boolean).join(" · "),
    url: "./?tab=sold",
    tag: `ready-${v.id}`,
  }, { onlyUsers: await soldAlertUsers(), exceptUser: v.ready_by ?? undefined }));
}

async function morning() {
  const { date, hour } = dublinNow();
  if (hour !== 8) return json({ skipped: `it's ${hour}:00 in Dublin` });
  if (!(await claim(`morning:${date}`))) return json({ skipped: "already sent today" });
  const { data: cars } = await db.from("vehicles").select("*").eq("status", "in_prep");
  const sold = cars ?? [];
  const today = sold.filter((v) => v.delivery_date === date)
    .sort((a, b) => String(a.delivery_time).localeCompare(String(b.delivery_time)));
  const overdue = sold.filter((v) => v.delivery_date && v.delivery_date < date);
  const line = (v: Vehicle) => [v.delivery_time, carOf(v), plateOf(v), v.ready_state === "done" ? "✓ ready" : ""]
    .filter(Boolean).join(" ");
  const lines = today.slice(0, 6).map(line);
  if (today.length > 6) lines.push(`+${today.length - 6} more`);
  if (overdue.length) lines.push(`⚠ ${overdue.length} overdue`);
  return json(await send({
    title: today.length ? `🚗 Today: ${today.length} car${today.length === 1 ? "" : "s"} to deliver` : "🚗 No deliveries today",
    body: lines.join("\n") || `${sold.length} sold car${sold.length === 1 ? "" : "s"} waiting`,
    url: "./?tab=sold",
    tag: `morning-${date}`,
  }, { onlyUsers: await soldAlertUsers() }));
}

Deno.serve(async (req) => {
  const { vehicle_id, event = "new_stock" } = await req.json().catch(() => ({}));
  if (event === "morning") return morning();
  if (!vehicle_id) return json({ error: "bad request" }, 400);
  if (event === "new_stock") return newStock(vehicle_id);
  if (event === "ready_doing" || event === "ready_done") return ready(vehicle_id, event);
  return json({ error: "unknown event" }, 400);
});
