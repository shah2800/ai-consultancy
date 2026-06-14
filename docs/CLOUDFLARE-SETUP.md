# Cloudflare setup — website (Pages) + media (R2) + API (Render)

This guide moves your **public website** and **images/videos** to Cloudflare (never sleeps).  
Your **CRM, apply form, WhatsApp, and AI** stay on **Render**.

---

## Architecture

| Service | Hosts |
|---------|--------|
| **Cloudflare Pages** | `index.html`, `apply.html`, CSS, JS |
| **Cloudflare R2** | Hero images, promo videos (from CRM upload) |
| **Render** | API, CRM `/admin`, MongoDB connections, R2 upload keys |
| **MongoDB Atlas** | Database (unchanged) |

**Recommended URLs**

| URL | Points to |
|-----|-----------|
| `https://www.nextstepinternationals.com` | Cloudflare Pages (website) |
| `https://api.nextstepinternationals.com` | Render (API + CRM) |
| `https://media.nextstepinternationals.com` | Cloudflare R2 (optional custom domain) |

---

## Part 1 — Cloudflare R2 (images & videos from CRM)

### 1. Create R2 bucket

1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com)
2. **R2** → **Create bucket**
3. Name: `nextstep-media` (or any name)
4. Location: automatic

### 2. Enable public access (so website can play videos)

**Option A — R2.dev subdomain (quick)**

1. Open your bucket → **Settings**
2. **Public access** → **Allow Access** → copy the public URL  
   Example: `https://pub-xxxxxxxx.r2.dev`

Use this as `R2_PUBLIC_BASE_URL` below.

**Option B — Custom domain (recommended)**

1. Bucket → **Settings** → **Custom Domains**
2. Add `media.nextstepinternationals.com`
3. Cloudflare adds DNS automatically if the domain is on Cloudflare

Use `https://media.nextstepinternationals.com` as `R2_PUBLIC_BASE_URL`.

### 3. CORS (required for CRM direct upload)

Bucket → **Settings** → **CORS policy** → Add:

```json
[
  {
    "AllowedOrigins": [
      "https://api.nextstepinternationals.com",
      "https://www.nextstepinternationals.com",
      "http://localhost:5173",
      "http://localhost:5000"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Adjust origins if your CRM URL is different.

### 4. Create R2 API token

1. **R2** → **Manage R2 API Tokens** → **Create API token**
2. Permissions: **Object Read & Write** on your bucket
3. Copy **Access Key ID** and **Secret Access Key** (shown once)
4. Copy your **Account ID** from the R2 overview page

### 5. Add env vars on Render

Render → **ai-consultancy-api** → **Environment** → add:

| Variable | Example |
|----------|---------|
| `R2_ACCOUNT_ID` | `a1b2c3d4e5...` |
| `R2_ACCESS_KEY_ID` | from API token |
| `R2_SECRET_ACCESS_KEY` | from API token |
| `R2_BUCKET_NAME` | `nextstep-media` |
| `R2_PUBLIC_BASE_URL` | `https://media.nextstepinternationals.com` or `https://pub-xxx.r2.dev` |

Click **Save** → **Manual Deploy**.

### 6. Test in CRM

1. Open **CRM → Website CMS → Media library**
2. Banner should say **Storage: Cloudflare R2**
3. Upload an image or short video
4. Click **Use as hero video** → **Save website**
5. Open homepage — media loads from R2 URL (not `/uploads/...`)

---

## Part 2 — Cloudflare Pages (website, no sleep)

### 1. Connect GitHub

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Select repo: `shah2800/ai-consultancy`
3. **Production branch:** `main`

### 2. Build settings

| Setting | Value |
|---------|--------|
| **Framework preset** | None |
| **Build command** | (leave empty) |
| **Build output directory** | `website` |

No build step — static HTML only.

### 3. Custom domain

1. Pages project → **Custom domains** → add `www.nextstepinternationals.com`
2. Also add `nextstepinternationals.com` (redirect to www if you prefer)

### 4. Point API to Render subdomain

1. In Cloudflare **DNS**:
   - `www` → Pages (automatic when you add custom domain)
   - `api` → CNAME → your Render host  
     Example: `ai-consultancy-api.onrender.com`

2. On **Render** → service → **Settings** → add custom domain:  
   `api.nextstepinternationals.com`

### 5. Tell the website where the API lives

Edit `website/js/ns-config.js` — set the API base when the site is on Pages:

```javascript
window.NSI_CONFIG = {
  apiBase: "https://api.nextstepinternationals.com",
  formToken: "NSI-WEB-FORM-SECURE-KEY-7k3m9p2qx", // must match WEBSITE_FORM_SECRET on Render
};
```

`formToken` must **exactly match** `WEBSITE_FORM_SECRET` in Render Environment.

Redeploy Pages (push to GitHub or **Retry deployment** in Cloudflare).

### 6. CORS on Render

The API already allows `https://www.nextstepinternationals.com`.  
If apply form fails with CORS, add to Render env:

```
CORS_ORIGINS=https://www.nextstepinternationals.com,https://nextstepinternationals.com
```

---

## Part 3 — What Render still does

After migration, Render runs:

- CRM at `https://api.nextstepinternationals.com/admin`
- Apply form API
- WhatsApp webhooks + AI (Groq)
- Email alerts (Resend)
- R2 presigned uploads (CRM → R2, URL saved in MongoDB)

Render **does not** serve your homepage or large media files anymore.

**Optional:** Upgrade Render to **Starter ($7/mo)** so API/WhatsApp never sleep.

---

## Part 4 — Checklist

- [ ] R2 bucket created + public URL or custom domain
- [ ] R2 CORS policy added
- [ ] R2 API token created
- [ ] All `R2_*` vars on Render + redeploy
- [ ] CRM Media library shows **Cloudflare R2**
- [ ] Cloudflare Pages connected to `website/` folder
- [ ] `www` domain on Pages
- [ ] `api` subdomain on Render
- [ ] `ns-config.js` → `apiBase` = `https://api.nextstepinternationals.com`
- [ ] `formToken` matches `WEBSITE_FORM_SECRET`
- [ ] Test apply form from live website
- [ ] Test WhatsApp message + AI reply

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| CRM shows **Render disk (temporary)** | Add all `R2_*` env vars and redeploy Render |
| Upload fails with CORS error | Fix R2 CORS policy (Part 1 step 3) |
| Video URL 403 on website | Enable R2 public access or custom domain |
| Apply form “Invalid form token” | Match `ns-config.js` `formToken` and Render `WEBSITE_FORM_SECRET` |
| Apply form CORS error | Add website origin to `CORS_ORIGINS` on Render |
| CRM slow after idle | Render Starter plan or UptimeRobot ping `/ping` |

---

## Local development

Copy `.env.example` to `.env` and add R2 vars for local CRM upload testing.

Website locally: `http://localhost:10000/site/index.html` (API same origin — no `apiBase` change needed).
