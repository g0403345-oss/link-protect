# App Store Review — Readiness Checklist

## ✅ Done in the app / backend (no further action)

- **Reviewer can see everything (Guideline 4.2):** "Explore the demo" on the
  login screen opens the full configuration panel on sample data — no Discord
  login, no network. Can't be rejected for "only a login screen."
- **Discord-only sign-in + 4.8 statement:** explained in `ReviewNotes.md`. No
  email/password account, no other social login, so Sign in with Apple is not
  required.
- **Privacy Policy + Terms (live):** https://link-protect.com/privacy and
  https://link-protect.com/terms (linked in-app under Settings → About).
- **Privacy manifest** (`PrivacyInfo.xcprivacy`) in both the app and the widget:
  declares no tracking, User ID collected for app functionality, and the
  UserDefaults required-reason API (CA92.1).
- **In-app data deletion (Guideline 5.1.1(v)):** Settings → "Delete my data"
  removes the user's push registrations server-side and signs out.
- **Permissions:** only `NSFaceIDUsageDescription` (Face ID lock) and push
  (opt-in). No camera/contacts/location/tracking; no ATT prompt.
- **Networking:** HTTPS only (no ATS exceptions). `ITSAppUsesNonExemptEncryption`
  = false (no export-compliance prompt).
- **App icon** 1024×1024, no alpha. Launch screen configured. Working links and
  bot-invite throughout (no placeholders).

## 📋 To do in App Store Connect (dashboard — can't be set from code)

- [ ] **Screenshots** — required. At least 6.7" iPhone (e.g. 1290×2796). Capture:
      login (with demo button), server list, a config section, statistics chart,
      activity log. (Use the in-app demo for clean, data-rich shots.)
- [ ] **App Privacy labels** — set to match the manifest:
      *Identifiers → User ID* — Linked to user, **not** used for tracking,
      purpose **App Functionality**. Everything else: Not Collected.
- [ ] **Age rating** → 4+.
- [ ] **Category** → Utilities (secondary: Social Networking).
- [ ] **URLs** → Support: https://link-protect.com · Privacy:
      https://link-protect.com/privacy
- [ ] **Notes for Review** → paste the block from `ReviewNotes.md`.
- [ ] *(Optional)* Real Discord demo credentials in the notes — not required
      thanks to the in-app demo, but nice to have.

## Signing / build

- Team `9X2RZ57R5L` is set in `project.yml`; App Group + Push auto-provision on
  device builds. Archive with the **LinkProtect** scheme.
- **Push delivery** needs an APNs key (`.p8`) + the `APNS_*` env vars on the
  server. This is **not required for review** (push is a documented feature; the
  demo shows the notification UI). Add it whenever you're ready to ship live pushes.

## Not applicable

- No in-app purchases / subscriptions. No third-party login besides Discord
  (so no Sign in with Apple requirement). No user-generated public content.
