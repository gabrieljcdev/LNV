# Moving to chewingtheceiling.com and setting up email (23 Oct 2026)

Bought by gabriel on names.co.uk: **chewingtheceiling.com** and **chewingtheceiling.co.uk**. The server is `94.237.56.224` (UpCloud London).
Decisions (23 Oct): the **.com is the site**; the .co.uk, the www names and the old waxopathy.com names all redirect to it. **Resend** sends the site's email
(account confirmation, password reset). A **real mailbox on the domain** receives mail (Zoho Mail free plan, web only; see the caveat in step 4).

Order matters: the web server can only get its HTTPS certificates once the DNS points at it, so DNS first, then the server, then email.

## Step 1: DNS for the website (gabriel, at names.co.uk)
In names.co.uk: My Account → the domain → DNS / Manage DNS records. Do both domains the same way. Delete any parking-page records on `@` and `www` first.

| Type | Host / name | Value | TTL |
|---|---|---|---|
| A | `@` (or blank) | `94.237.56.224` | 300 or the lowest offered |
| A | `www` | `94.237.56.224` | same |

Then tell Claude. DNS can take minutes to hours; Claude checks it from here before touching the server. Do not change the DNS of waxopathy.com.

## Step 2: the server: DONE 23 Oct (DNS answered; Caddy, .env and the frontend/backend switched over; all names checked: .com serves, the rest redirect with valid certificates)
1. Back up `/etc/caddy/Caddyfile`, install `deploy/Caddyfile` from the repo (it serves chewingtheceiling.com and redirects the other names to it), `systemctl reload caddy`, and check
   `https://chewingtheceiling.com` loads with a padlock and `https://waxopathy.com` redirects.
2. In `/opt/lnv/backend/.env`: `FRONTEND_URL=https://chewingtheceiling.com` and `API_URL=https://chewingtheceiling.com/api` (these are the links inside emails, and the only website
   the API accepts requests from), then `systemctl restart lnv`.
3. Git pull and rebuild the frontend so the emails say "Chewing the Ceiling" (code already changed in the repo; see below).
Existing sign-ins: browsers keep a separate login per website name, so people (gabriel included) sign in again once on the new name.

## Step 3: sending email with Resend (gabriel, then Claude)
1. Make a free account at resend.com. Domains → Add Domain → `chewingtheceiling.com` (region: Ireland/EU if offered).
2. Resend shows three DNS records for the domain (an MX and a TXT on the host `send`, and a TXT on `resend._domainkey`). Add them at names.co.uk exactly as shown (copy the
   values from Resend; the host is just `send`, not `send.chewingtheceiling.com`, in names.co.uk's form). Click Verify in Resend. They live beside the website records and do not affect them.
3. API Keys → create a key with "Sending access" for that domain. **Never paste it in chat.** On the server, edit the settings file yourself:
   `ssh root@94.237.56.224` then `nano /opt/lnv/backend/.env` and add these lines (put the key where it says):
   ```
   SMTP_HOST=smtp.resend.com
   SMTP_PORT=587
   SMTP_USER=resend
   SMTP_PASS=<the Resend API key>
   MAIL_FROM="Chewing the Ceiling <no-reply@chewingtheceiling.com>"
   ```
   then `systemctl restart lnv`. (The SMTP host/user are Resend's documented SMTP settings; the port 587 uses STARTTLS, which the site's mail code handles.)
4. Admin → Status → send the test email to yourself. It should arrive, from "Chewing the Ceiling", and not in spam. If it is in spam, wait for DNS to settle and check Resend's domain page.

## Step 4: receiving mail at the domain (gabriel)
Zoho Mail free plan (zoho.com/mail, "Forever Free"): one custom domain, up to 5 mailboxes, about 5 GB each, **webmail only (no IMAP/POP, so no Outlook or phone mail app; its own mobile
app may or may not be included) and it is offered only in some data centres**. If it is not offered for you, the fallback is names.co.uk's own email forwarding (hello@ to your live.com
inbox) or a paid mailbox (Zoho Mail Lite about US$1 a month, or similar).
1. Sign up with the domain chewingtheceiling.com; choose the EU data centre if given the choice. Verify the domain with the TXT record Zoho shows (at names.co.uk).
2. Add the MX records Zoho shows on `@` (for the EU centre these are `mx.zoho.eu` priority 10, `mx2.zoho.eu` 20, `mx3.zoho.eu` 50; copy what Zoho shows), and its SPF and DKIM TXT records.
   The root SPF should be Zoho's only (`v=spf1 include:zoho.eu ~all` for the EU centre): Resend's SPF sits on the `send` host, so they do not clash.
3. Make the mailbox `hello@chewingtheceiling.com`, and aliases `privacy@`, `support@` and `abuse@` pointing at it (the legal pages need real addresses).
4. Do this AFTER the website records (step 1), and do not remove the Resend records.

## What changed in the code (committed, goes live with the next deploy)
- `deploy/Caddyfile`: the .com is the site; .co.uk, www and waxopathy.com redirect to it.
- `backend/.env.production.example`: FRONTEND_URL and API_URL on the new domain.
- `backend/services/authService.js`: email subjects, text and the default sender say "Chewing the Ceiling" (sender default `no-reply@chewingtheceiling.com`).
- Not done: other places that still say "Late Night Vibes" in the site (About text, page title). Those are brand-copy decisions for gabriel.

## Later
- The legal pages need an operator name, address and contact email: `privacy@chewingtheceiling.com` once step 4 is done.
- The server's SSH, firewall and backups are unchanged by all this.
- Trademark search for Chewing the Ceiling is still undone.
