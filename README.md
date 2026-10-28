# Celestial Compass: astrology readings site (Google Apps Script)

A complete website that runs free on Google. A visitor enters their name, email, birth date, time and place, instantly sees a personal birth chart reading with a real chart wheel, and gets a copy by email. They can then pay (PayPal) for daily, weekly, monthly or year-ahead guidance, or a spoken video reading.

**Cost to start: 0.** Hosting, database (a Google Sheet) and email are all Google. You only pay PayPal's transaction fee when someone buys.

## What is in the box

| File | What it does |
|---|---|
| `Astro.gs` | The chart engine: planet positions, Rising sign, houses, aspects, moon phases. No libraries, no network. |
| `Reading.gs` | Turns a chart into the free reading and the daily / weekly / monthly / yearly guidance. **All wording lives in tables at the top; rewrite it to change the voice of the site.** |
| `Code.gs` | The web app: form handling, Google Sheet storage, email, scheduled deliveries, unsubscribe, admin menu. **Prices are in `PLANS` at the top.** |
| `Payments.gs` | PayPal checkout (server-side, price enforced on the server). |
| `Index.html` | The page. |
| `appsscript.json` | Settings (V8 runtime, public web app). |
| `test/` | Automated tests (optional; for developers). |

## Set it up (about 15 minutes)

1. **Make the database.** Go to [sheets.google.com](https://sheets.google.com), create a blank sheet, name it "Celestial Compass database".
2. In that sheet: **Extensions > Apps Script**. This opens the script editor attached to your sheet.
3. **Add the files.** Delete the default `Code.gs` content. Then create files with *exactly* these names and paste the content of each: `Code.gs`, `Astro.gs`, `Reading.gs`, `Payments.gs` (use **+ > Script**), and `Index.html` (**+ > HTML**; name it `Index`). In **Project Settings** tick *Show "appsscript.json" manifest file* and paste in the contents of `appsscript.json`.
4. **Run setup once.** Select the function `setup` in the toolbar and click **Run**. Approve the permissions (Google will warn the app is unverified: click *Advanced > Go to project*; it is your own script). This creates the sheets and the two scheduled jobs (hourly email queue, daily 07:00 deliveries).
5. **Settings.** Project Settings > **Script properties**. Set:
   - `SITE_NAME`: your brand name.
   - `ADMIN_EMAIL`: where video-order alerts and replies go.
   - `CURRENCY`: `EUR`, `USD`, `GBP`...
   - `PAYPAL_MODE`: `sandbox` while testing, `live` when ready.
   - `PAYPAL_CLIENT_ID` and `PAYPAL_SECRET`: from [developer.paypal.com](https://developer.paypal.com) > Apps & Credentials > create an app (use the Sandbox tab first). **Never paste these into code files.**
6. **Publish.** **Deploy > New deployment > Web app**. Execute as: **Me**. Who has access: **Anyone**. Copy the web app URL (ends in `/exec`). Paste it into the script property `SITE_URL` as well (this makes PayPal's return link rock solid).
7. **Test in sandbox.** Open the URL, request a reading, then buy a plan using a PayPal *sandbox buyer* account (created in the PayPal developer dashboard). Check the Orders sheet shows `ACTIVE` and that the email arrives.
8. **Go live.** Switch `PAYPAL_MODE` to `live`, put in the *Live* client ID and secret, then **Deploy > Manage deployments > edit > New version**. (Any code change needs a new version; changing a script property does not.)

### Put it on a Google Site or your own domain
- **Google Sites** (free, Google hosted): in Sites choose **Embed > By URL** and paste the `/exec` URL. Set the embed to full width. A custom domain can be attached to the Site in Sites settings.
- Or simply link to the `/exec` URL.

## How the pieces work

- **Free reading:** validated, geocoded (Google Maps service, no key needed), chart calculated, reading shown on the page and emailed. One email per address per week.
- **Birth place and time zone:** the place gives latitude/longitude for the Rising sign and houses. The *time zone at birth* is a field on the form (defaults to the visitor's current zone, which is wrong for people born elsewhere). To fill it automatically, create a free account at geonames.org, enable its web services, and put the username in the script property `GEONAMES_USER`. Check GeoNames' current terms for commercial use first.
- **Plans** (`PLANS` in `Code.gs`): daily 30 readings, weekly 12, monthly 6, year-ahead report, spoken video. These are one-off prepaid packages; the first reading is sent the moment the payment completes and the rest follow on schedule.
- **Spoken video:** after payment you get an email alert. Record the video (for example with an AI avatar tool or your phone), upload it anywhere (YouTube unlisted, Drive), paste the link in the `videoUrl` cell of that order row, select the row, and use the menu **Astro admin > Send video link for selected order**.
- **Returning buyers:** emails carry a personal link so buyers don't re-enter details.
- **Unsubscribe:** every email has a link; it stops all further emails for that person.

## Honest limits and how to grow past them

1. **Gmail sending limit.** A normal Google account can email **100 recipients per day** (Google Workspace: 1,500). The script queues overflow and sends it the next day, but at roughly 100 sign-ups a day you need to move email to a service like Brevo or Mailgun (about 15 lines to swap in `sendMail_`) or upgrade to Workspace.
2. **Accuracy.** The engine is accurate to about 1-2 arcminutes for planets, a few for the Moon: right for signs, houses and aspects. For observatory-grade precision later, swap in Swiss Ephemeris (check its licence: AGPL or paid).
3. **Houses** are Whole Sign. Placidus and other systems are a possible paid-tier upgrade.
4. **Readings are template-written**, composed from your tables for each placement and aspect. They are good and personal, and cost nothing per reading, but they are not written by an astrologer or an AI. When revenue allows, you can add an AI-written section.
5. **Time zones:** historical daylight-saving changes are handled correctly (the Netherlands, for example, had none before 1977).
6. **Payments:** PayPal only, one-off. Stripe can be added as a second provider alongside `Payments.gs`. Recurring subscriptions need PayPal Subscriptions or Stripe Billing.
7. **Not tested against live Google or PayPal.** The code is thoroughly tested against simulations of Google Sheets, Mail, Maps and PayPal. Step 7 (sandbox test) is therefore not optional.

## Legal basics (you are in the EU)
- Birth details and emails are personal data. The form has a consent box, every email has an unsubscribe, and the Privacy link explains what is stored. Add a proper privacy policy page and set its URL in `PRIVACY_URL`.
- Consumer sales in the EU usually carry a 14-day withdrawal right, with an exception for digital content once delivery has started with the customer's agreement. Add that wording to your terms and get it checked.
- Describe readings as entertainment and self-reflection (the page already does). No health, legal or financial claims.

## Keeping it safe
- Only functions without a trailing underscore can be called from a visitor's browser. Keep helper functions private by ending their names in `_`.
- Prices come from `PLANS` on the server. Payments are verified (amount, currency, status) before anything is delivered.
- Do not share the Google Sheet publicly; it holds your customers' data.

## Running the tests (optional)
```
node test/astro.test.js      # planet positions vs published values
node test/reading.test.js    # readings for several chart types
node test/backend.test.js    # whole backend with simulated Google + PayPal
node test/ui.test.js         # real browser (needs playwright)
```
