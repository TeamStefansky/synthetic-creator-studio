# Meta App Review - Instagram Business Discovery (copy-paste pack)

Operator guide for getting **Advanced Access** to the Instagram permissions that the
lawful Instagram adapter (`lib/social/instagram.ts`, Business Discovery) needs in
production. Nothing here is code; it is the text to paste into Meta's App Review forms.

> Why this is needed: Business Discovery of accounts you do NOT own requires Advanced
> Access, which Meta grants only through App Review. In Development mode the app can only
> reach accounts that have a role on it, which is why arbitrary lookups (natgeo, cnn, any
> analyzed handle) return "source not connected" until review is approved.

Everything below is TRUE about TruthLens - do not embellish. Our own product rules
(public data only, account-level not person-level, no scraping, no messaging) are exactly
what reviewers want to see, so we lean on them.

---

## 0. Prerequisites (do these first, in the app dashboard)

- [ ] App = **Truth lens** (App ID `1566011568209587`), business **Team Stefansky - content agency** (verification already complete).
- [ ] Configure the Instagram product via **"API setup with Facebook login"** (NOT the Instagram-login path). Business Discovery lives on the Facebook-login path and uses `instagram_basic`.
- [ ] Add a **Privacy Policy URL** (App Settings -> Basic). Required. Use: `https://synthetic-creator-studio.vercel.app/about` (or a dedicated privacy page).
- [ ] Add **Data Deletion** instructions URL (App Settings -> Basic). TruthLens stores no personal Instagram data; state that (text in section 3).
- [ ] Upload a 1024x1024 **App Icon** and set **Category** = "Business and pages" (or "Utility and productivity").
- [ ] Keep the app in **Development** mode while filling the review; submit when ready.

Request Advanced Access at: **App dashboard -> App Review -> Permissions and Features**.
Find each permission below, click **Request Advanced Access**, and paste its text.

---

## 1. Permission: `instagram_basic`  (the important one)

**How your app uses this permission**

> TruthLens is a defensive OSINT and brand-safety decision-support tool. Using the
> Instagram Graph API Business Discovery endpoint (the `business_discovery` edge on our
> own connected Instagram Business account), we read PUBLIC profile fields (username,
> name, biography, website, profile picture URL, followers_count, follows_count,
> media_count) and recent PUBLIC media (caption, like_count, comments_count, timestamp,
> permalink) of Instagram Business and Creator accounts that an analyst enters. We compute
> transparent, explainable account-authenticity indicators from these public metrics
> (follower-to-following ratio, posting cadence, engagement distribution) to help analysts
> and brands assess whether a public account shows signs of coordinated inauthentic
> behavior. We assess ACCOUNTS, never private individuals; we access only PUBLIC data; we
> never read private content or messages; and we never post, message, or modify anything.
> `instagram_basic` is required because Business Discovery is only available to apps that
> hold this permission.

**Step-by-step for the reviewer to test**

> 1. Open https://synthetic-creator-studio.vercel.app/check (public, no login required).
> 2. Paste a public Instagram Business account URL, e.g. `https://www.instagram.com/natgeo/`.
> 3. The app auto-detects it as "Social Analyze" and calls the Business Discovery endpoint
>    through our own connected Instagram Business account.
> 4. The public profile and recent-media metrics render, followed by the authenticity
>    indicators (each with its evidence and an alternative explanation).

---

## 2. Permission: `pages_read_engagement`

**How your app uses this permission**

> This is a required companion permission for the Instagram Graph API Business Discovery
> endpoint. Our Instagram Business account is linked to a Facebook Page; the
> `business_discovery` edge requires a Page-linked access token. We use
> `pages_read_engagement` only to obtain and use that token for Business Discovery calls.
> We do not read, publish, or moderate Page content.

**Step-by-step for the reviewer to test**

> Same flow as `instagram_basic` above (steps 1-4). The Business Discovery call that
> returns the public metrics is authorized by the Page-linked token this permission provides.

---

## 3. Permission: `pages_show_list`

**How your app uses this permission**

> Required companion permission for Business Discovery. We use `pages_show_list` only to
> identify the Facebook Page that is linked to our own Instagram Business account, so we
> can obtain the Page-linked token that authorizes Business Discovery. We do not manage or
> list the user's Pages for any other purpose.

**Step-by-step for the reviewer to test**

> Same flow as above (steps 1-4).

---

## 4. Data handling answers (for the review questionnaire)

- **What data do you collect?** Only PUBLIC business/creator account metrics returned by
  Business Discovery (public counts and recent public media metadata). No private data, no
  messages, no personal data of private individuals.
- **Do you store it?** Public results are cached briefly (24h) for reproducibility and
  rate-limit compliance; no personal data is retained. Cache holds only public account
  metrics keyed by public username.
- **Do you share it with third parties?** No.
- **Data deletion:** We store no personal user data. Any cached public metric expires
  automatically within 24 hours; on request we purge the cache immediately.

---

## 5. Screencast (App Review usually requires a short screen recording)

Record ~60-90s showing:
1. The app at `/check`.
2. Pasting `https://www.instagram.com/natgeo/`.
3. The Business Discovery result rendering (public follower/media counts + authenticity band).
4. Narrate: "TruthLens uses Instagram Business Discovery to read public business-account
   metrics and compute account-authenticity indicators; public data only; no private data,
   no messaging, no posting."

---

## 6. Honest expectations

- Business verification is done (the hard part). Advanced Access reviews typically take a
  few business days.
- There is a real chance Meta asks follow-up questions about the use case. If they push
  back, emphasize the truthful, reviewer-friendly facts: PUBLIC data only, ACCOUNT-level
  (never identifying private individuals), no scraping, no messaging, no content changes -
  a read-only analytics use of the official Business Discovery endpoint.
- Until approval, the code already behaves correctly: Instagram renders a visible
  "source not connected" state, never faked.

Once Advanced Access is granted, generate a long-lived Page token for the connected IG
Business account and set in Vercel: `PLATFORM_PROVIDER=official`, `IG_USER_ID`,
`META_GRAPH_TOKEN` (see `.env.example`), then Redeploy.
