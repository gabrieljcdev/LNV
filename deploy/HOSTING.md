# Putting LNV on a server (UpCloud, London) — step by step

Written 9 Oct 2026; switched from Hetzner to UpCloud the same day (Hetzner's cheap plans were sold out and the 4 GB one was €19.99). Every command is meant to be pasted as it is; replace `waxopathy.com` if the domain changes.
**You** do the steps marked 👤 in the UpCloud/Cloudflare/names.co.uk/GitHub sites; the rest are commands typed on the server (or on your PC where it says so).

## What ends up where

| Thing | On the server |
|---|---|
| The code | `/opt/lnv` (this repo, `git pull` to update) |
| The built site | `/opt/lnv/frontend/dist` (Caddy serves it) |
| The backend | `systemd` service `lnv`, listens on `127.0.0.1:3001` (only Caddy talks to it) |
| The database | `/var/lib/lnv/vinyl_crate.db` (outside the code folder, so updates never touch it) |
| Secrets | `/opt/lnv/backend/.env` (never in git) |
| Backups | `/var/backups/lnv/` daily, 14 kept, plus a copy off the server |

The backend also runs all the background jobs (catalogue crawls, comber, link checks), so it must stay one always-on process. Never run two copies against the same database.

---

## 1. 👤 Buy the server (UpCloud)
1. hub.upcloud.com → **Verify & start trial** (needs a card; no charge during the trial). The trial gives credit for 30 days; to keep the server afterwards you add at least €10 to your balance (prepaid; 30-day money-back on the first payment). UpCloud bills in **euros** (your bank may add a currency fee) and prices exclude VAT.
2. **Servers → Deploy**. Settings:
   - **Location: London, UK** (`uk-lon1`).
   - **Plan: Starter, 4 GB RAM / 2 CPU / 30 GB, €12 a month** (if the trial limits the size, start on the largest it allows and resize after upgrading; the 8 GB / 4 CPU / 40 GB plan is €20).
   - **Storage:** the plan's own disk (30 GB) is enough to start: the database is ~640 MB and backups are compressed. Check with `df -h` now and then; more disk is an add-on.
   - **Operating system: Ubuntu 24.04** (the LTS one).
   - **Networking:** public IPv4 (included); leave the private network off.
   - **Login method: SSH key.** On your PC, in PowerShell: `ssh-keygen -t ed25519` (Enter at each prompt), then `Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub` and paste that whole line into UpCloud's SSH keys box. Never share the file without `.pub`.
   - **Hostname:** `lnv`.
   - **Backups:** UpCloud offers a paid daily backup add-on for the whole server — worth turning on once the site is live, as a second safety net beside our own database backups (step 9). Check the price on the deploy page.
3. Deploy. Note the **public IPv4 address** shown in the server's page.
4. **Firewall (UpCloud's own, in the panel):** Servers → your server → Firewall → allow inbound **TCP 22, 80 and 443** only, then enable it. (Step 3 also sets a firewall on the server itself; both is fine.)
5. Trial note: while on the trial, UpCloud limits network speed and ports to the standard web ones. 22, 80 and 443 are included, so this guide works; the speed limit lifts when you upgrade.

## 2. 👤 Point the domain at it (Cloudflare)
1. Cloudflare → add `waxopathy.com`; it gives you two nameservers → set those at names.co.uk for the domain (and wait until Cloudflare says active).
2. DNS records: `A  @  <server IP>` and `A  www  <server IP>`, both **DNS only (grey cloud)** for now. (Turn the orange proxy on later if you want; leave it grey until the site works, so the certificate step is simple.)
3. The other domains (.co.uk, .uk, .org) can later redirect to .com — not needed now.

## 3. First login and basics (on the server)
From your PC:
```
ssh root@<server IP>
```
Then:
```
apt update && apt -y upgrade
apt -y install ufw git sqlite3 unattended-upgrades build-essential python3 curl rclone unzip
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
adduser --disabled-password --gecos "" lnv
mkdir -p /opt/lnv /var/lib/lnv /var/backups/lnv
chown lnv:lnv /opt/lnv /var/lib/lnv /var/backups/lnv
```
(`unattended-upgrades` installs security updates by itself. `build-essential`/`python3` are only a fallback in case the database library has to compile.)

## 4. Node 20 and Caddy
```
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt -y install nodejs
apt -y install debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt -y install caddy
node -v    # should say v20.x
```

## 5. Get the code
The repo is private, so the server needs permission to read it. Easiest: a **read-only deploy key**.
```
ssh-keygen -t ed25519 -f /root/lnv_deploy -N ""
cat /root/lnv_deploy.pub
```
👤 GitHub → the LNV repo → Settings → Deploy keys → Add → paste that line, leave "write access" **off**. Then:
```
GIT_SSH_COMMAND="ssh -i /root/lnv_deploy -p 443 -o StrictHostKeyChecking=accept-new" git clone -b dedupe ssh://git@ssh.github.com:443/gabrieljcdev/LNV.git /opt/lnv-src
rm -rf /opt/lnv && mv /opt/lnv-src /opt/lnv
chown -R lnv:lnv /opt/lnv
```
> (UpCloud's trial blocks outbound port 22, so we reach GitHub over port 443 — `ssh.github.com:443` — which GitHub supports. Later `git pull` needs the same: run it as `GIT_SSH_COMMAND="ssh -i /root/lnv_deploy -p 443" git pull`, or set it once with `git config core.sshCommand "ssh -i /root/lnv_deploy -p 443"` and `git remote set-url origin ssh://git@ssh.github.com:443/gabrieljcdev/LNV.git`.)

The hosting changes (this folder, `server.js`, `purge-posts.mjs`) live on `dedupe`/PR #9 until it is merged. Either merge PR #9 first, or check out `dedupe` here.

## 6. Install and build
```
cd /opt/lnv/backend && sudo -u lnv npm ci --omit=dev
cd /opt/lnv/frontend && sudo -u lnv npm ci && sudo -u lnv npm run build
ls /opt/lnv/frontend/dist/index.html    # must exist
```

## 7. The `.env` (secrets)
From your PC (PowerShell) copy your current keys over, then edit on the server:
```
scp C:\Users\gabriel\Desktop\LNV\backend\.env root@<server IP>:/opt/lnv/backend/.env
```
On the server: `nano /opt/lnv/backend/.env` and make it match `backend/.env.production.example` — in particular add `NODE_ENV=production`, `LNV_DB_PATH=/var/lib/lnv/vinyl_crate.db`, `FRONTEND_URL=https://waxopathy.com`, `API_URL=https://waxopathy.com/api`, and **delete the `DEV_ADMIN_*` lines**. Then:
```
chown lnv:lnv /opt/lnv/backend/.env && chmod 600 /opt/lnv/backend/.env
```
⚠️ Email: with no `SMTP_*` set, nobody can confirm a sign-up in production (the dev shortcut is off). That is fine for a private first launch — see step 11 — but pick a mail provider before opening sign-ups.

## 8. Move the database (your PC → the server)
Do this when you are ready for the server to take over, because **from this point your PC must stop running the backend** (two copies would both crawl Discogs on the same token, and the two databases would drift apart).

On your PC, in PowerShell: 1) stop the local backend (close its terminal), then 2) make a clean copy and compress it:
```
cd C:\Users\gabriel\Desktop\LNV\backend
node -e "import('better-sqlite3').then(async ({default:D})=>{const d=new D('db/vinyl_crate.db');await d.backup('C:/Users/gabriel/Desktop/lnv-copy.db');console.log('copied')})"
Compress-Archive C:\Users\gabriel\Desktop\lnv-copy.db C:\Users\gabriel\Desktop\lnv-copy.zip
scp C:\Users\gabriel\Desktop\lnv-copy.zip root@<server IP>:/root/
```
On the server:
```
apt -y install unzip
cd /root && unzip lnv-copy.zip
mv lnv-copy.db /var/lib/lnv/vinyl_crate.db
chown lnv:lnv /var/lib/lnv/vinyl_crate.db
sqlite3 /var/lib/lnv/vinyl_crate.db "PRAGMA integrity_check;"     # must print: ok
```

## 9. Run it, serve it, back it up
```
cp /opt/lnv/deploy/lnv.service /etc/systemd/system/lnv.service
systemctl daemon-reload && systemctl enable --now lnv
journalctl -u lnv -n 30 --no-pager        # should say the backend is running
curl -s http://127.0.0.1:3001/api/health  # {"status":"ok",...}

cp /opt/lnv/deploy/Caddyfile /etc/caddy/Caddyfile
systemctl reload caddy
```
Open `https://waxopathy.com` — the site loads over HTTPS. (Caddy gets the certificate the first time; if it doesn't, `journalctl -u caddy -n 30` says why — nearly always DNS not finished.)

Daily backup at 03:10:
```
cp /opt/lnv/deploy/backup.sh /usr/local/bin/lnv-backup && chmod +x /usr/local/bin/lnv-backup
echo '10 3 * * * root /usr/local/bin/lnv-backup >> /var/log/lnv-backup.log 2>&1' > /etc/cron.d/lnv-backup
/usr/local/bin/lnv-backup      # run it once now; it prints "backup ok"
```
**Off-server copy** (do this, a backup on the same disk is not a backup): 👤 UpCloud Object Storage (S3-compatible, billed by use — check its price) or Backblaze B2 or any S3 bucket, then `rclone config` on the server to add it, and put `OFFSITE=remote:lnv-backups` in `/etc/cron.d/lnv-backup` before the command, e.g. `10 3 * * * root OFFSITE=remote:lnv-backups /usr/local/bin/lnv-backup ...`.

**Test the restore once** (this is the part people skip):
```
ls /var/backups/lnv/
/opt/lnv/deploy/restore.sh /var/backups/lnv/<newest file>.db.gz
curl -s http://127.0.0.1:3001/api/health
```
It keeps the database it replaced as `vinyl_crate.db.before-restore`, so this test is safe.

## 10. Purge the posts, keep everything collected
First **save the links that live only on the posts**, so reposting those records reads the database instead of searching the web:
```
cd /opt/lnv/backend
export LNV_DB_PATH=/var/lib/lnv/vinyl_crate.db
sudo -E -u lnv node bank-post-links.mjs          # dry run: counts
/usr/local/bin/lnv-backup                        # backup first
systemctl stop lnv
sudo -E -u lnv node bank-post-links.mjs --yes    # copies post-track links into release_track_links
sudo -E -u lnv node purge-posts.mjs              # dry run
sudo -E -u lnv node purge-posts.mjs --yes        # posts and what hangs off them
sudo -E -u lnv node purge-posts.mjs --reset-numbers   # optional: post numbers restart at #1
systemctl start lnv
```
Kept: the Discogs catalogue and caches, YouTube/Spotify/Last.fm caches, saved track links, crawled channels, profile links, names, users and their Discogs lists. (Done 9 Oct 2026: 57 posts removed, 198 links banked, 415 saved links now.)

**Accounts:** `node purge-users.mjs lnv_admin` (dry run; add `--yes`) deletes every other account and what they own, keeping the named ones. `node create-user.mjs <username> [email]` makes a confirmed account with a random password printed once; `node reset-password.mjs <username>` gives an existing account a new random password.

## 11. Your own account and admin
Dev accounts exist in the copied database. For your own login on the live site:
```
cd /opt/lnv/backend
sudo -u lnv LNV_DB_PATH=/var/lib/lnv/vinyl_crate.db node set-password.mjs <your username> <your email> <a new strong password>
sudo -u lnv LNV_DB_PATH=/var/lib/lnv/vinyl_crate.db node admin.mjs list
```
(`set-password.mjs` marks the email confirmed, so you can sign in without mail. The password goes in your shell history — clear it with `history -c` afterwards, or change it in the site once signed in.)

## 12. Updating the site later
```
cd /opt/lnv && sudo -u lnv git pull
cd backend && sudo -u lnv npm ci --omit=dev && systemctl restart lnv
cd ../frontend && sudo -u lnv npm ci && sudo -u lnv npm run build      # Caddy picks up the new files by itself
```
Watch the log: `journalctl -u lnv -f`.

## 13. Checklist before telling anyone
- [ ] `https://waxopathy.com` loads; padlock shown; `http://` redirects to `https://`.
- [ ] Sign in with your own account; Admin opens; Admin → Status shows crawls running.
- [ ] A test post can be composed and saved, then deleted.
- [ ] Backup ran once and the **restore test passed**; the off-server copy exists.
- [ ] Your PC's backend is **not** running.
- [ ] Email provider chosen before sign-ups open (and `SMTP_*` filled in).
- [ ] Legal pages merged (`legal` branch) and the [blanks] filled.
- [ ] Check what the server's firewall shows: `ufw status` → only 22, 80, 443.

## Costs (rough)
Server €12/month (UpCloud Starter 4 GB / 2 CPU, excl. VAT) · server backup add-on (check price) · off-server storage (pennies per GB) · domains already bought (renewals £22.99 / £38.99 a year, noted 6 Oct) · email provider: free tiers cover a small launch.

## If something breaks
- Site down, API fine? `systemctl status caddy`, `journalctl -u caddy -n 50`.
- API errors? `journalctl -u lnv -n 100 --no-pager` and Admin → Logs.
- Bad deploy? `cd /opt/lnv && git log --oneline -5`, `git checkout <older commit>`, rebuild, restart.
- Database damaged? Step 9's restore script.
