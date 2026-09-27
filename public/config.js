// Supabase → Project Settings → API. The anon/publishable key is safe to ship
// in the browser: row-level security in supabase/schema.sql protects the data.
export const SUPABASE_URL = 'https://tmqyymrnvcmyzjhfxeqo.supabase.co';
// Staff sign in with their name; the app turns "Ana Paula" into
// "ana.paula@m6.local" behind the scenes. Create each login in Supabase with
// that address (Authentication → Users → Add user, tick Auto Confirm User).
export const LOGIN_DOMAIN = 'm6.local';

// Public half of the push-notification key pair (the private half is the
// VAPID_PRIVATE_KEY secret of the "swift-responder" Edge Function in Supabase).
export const VAPID_PUBLIC_KEY = 'BMFMe6gxKnHFwakeLJEnZIiHGazNLizHwKe2BUJxeYc6Tx-ZAaUnuj23TcrQ_HTxwczOl1Ny1Kj7h9rTGmRZ6E4';

export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtcXl5bXJudmNteXpqaGZ4ZXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MjUyMDYsImV4cCI6MjEwNjAwMTIwNn0.0ZT9U60jhhAkSeLTsiyo1WyPswpEi1nfnqy_bvQxhiU';
