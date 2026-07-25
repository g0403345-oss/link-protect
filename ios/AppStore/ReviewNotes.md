# App Store — Review Notes

Paste the **"Notes for Review"** block below into App Store Connect. The in-app
demo means the reviewer can reach the **full configuration panel with one tap —
no login required** — so the app can't be rejected under 4.2 for "only showing a
login screen."

---

## Notes for Review (paste this)

> **What this app is**
> Link Protect is a client for the "Link Protect" Discord moderation bot. A
> Discord server administrator uses it to configure the bot on the servers they
> manage (link blockers, warning thresholds, channel/role whitelists, a custom
> blacklist, statistics, and a live moderation activity log).
>
> **How to see the full app — no account needed (please use this)**
> On the login screen, tap **"Explore the demo"** (below the "Continue with
> Discord" button). This opens the entire app on sample data — the server list
> and every configuration section — with **no Discord login required**. Toggles,
> presets, the statistics charts and the activity log are all interactive.
>
> **Why Discord is the only real sign-in (Guideline 4.8)**
> Discord OAuth is required because the app manages a bot on servers the user
> administers; there is no separate primary account. Per Guideline 4.8, Sign in
> with Apple is not required for clients of a specific third-party service. We
> request only the `identify` and `guilds` scopes — no messages, no email, no
> personal data are stored. There is deliberately no email/password account
> system, which is exactly what would otherwise pull us back under the standard
> 4.8 rule.
>
> **Native functionality (Guideline 4.2)**
> Beyond configuration the app provides Home Screen widgets, Face ID app lock,
> and push notifications (bot offline, protection rule triggered, settings
> changed). The demo showcases the on-device UI; push requires a live server.
>
> **Optional: real Discord login**
> If you'd like to test the real flow, sign in with the demo Discord account
> below (it administers a server that already has the bot installed):
> Discord email: `__________________`
> Discord password: `__________________`
> 2FA is disabled on this account. (Tip: the "Explore the demo" path above is the
> most reliable, as third-party OAuth from a new device may trigger a Discord
> email verification.)

---

## What the reviewer sees via "Explore the demo"

- **Server list** — three sample servers (two with the bot, one offered for
  invite) + summary.
- **Configuration panel**, all sections: Overview, Link Blockers (+ Quick-setup
  presets), Warnings (thresholds + warned users), Access Control (channel / role
  / member whitelists), Blacklist, Statistics (Swift Charts), Activity Log.
- **Settings** — notification preferences, Face ID toggle, about/links.

Everything is interactive; nothing is sent to a server in demo mode.

## Why each point matters (internal)

1. **State the 4.8 exception explicitly** — reviewers apply it inconsistently;
   the paragraph pre-empts the "add Sign in with Apple" rejection.
2. **No second account system** — the exception holds because Discord is the only
   sign-in. (Enforced in code: there's no email/password UI.)
3. **Demo access is mandatory for 4.2** — without it the reviewer only sees the
   login screen. The in-app demo guarantees access without any Discord friction.

## Optional setup for the real-login path (not required)

- [ ] Create a dedicated Discord account for review (no 2FA).
- [ ] Create a server, invite the bot:
      `https://discord.com/oauth2/authorize?client_id=888390889892892684&permissions=1376805547126&scope=bot`
- [ ] Trigger a couple of moderation actions so Statistics / Activity aren't empty.
- [ ] Paste the credentials into the Notes-for-Review block above.
