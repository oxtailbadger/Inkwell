# Inkwell — Release Notes

What's new in Inkwell, in plain language. A new entry is added with each release announcement; newest first.

---

## October 18, 2026 *(pending — draft for review)*

*Announcement email (HTML + plain text, for sending through Resend): [`announcements/2026-10-18-whats-new.html`](announcements/2026-10-18-whats-new.html).*

### 🔢 Sign in with a code

Sign-in and sign-up emails now include a short **code** as well as the link. The link only works in the browser you asked for it from — so if you asked on your laptop and opened the email on your phone, or tapped it inside Instagram or Gmail, it failed. The code works from anywhere: type it into the page you started on. Lost that page? Tap **Already have a code? Enter it here** and type your email and the code — no need to ask for a new one (which would replace it). New to Inkwell and tried to sign in? You'll now get a one-tap **Create my account** instead of an error, and clearer messages (plus a *check your spam folder* tip and a **Resend** button) if an email doesn't show up.

### 🎧 A Podcasts section

Inkwell now has an **All** view (the default, articles and podcasts together, podcasts marked 🎧) and a **Podcasts** tab beside Articles. **Authors** is now its own tab too, instead of sitting under the feed. Share a link from Apple Podcasts, Spotify (episodes and shows), Overcast, Pocket Casts and the like and it goes there automatically — nothing to pick. It works just like Articles: Nods, Save / Read / Dismiss, tags. Podcast links that were already shared have moved over. Spotify songs and playlists still count as articles. If you share a podcast while looking at Articles, you'll see "Added to Podcasts" with a link to it.

### ✍️ More authors

The **Authors** tab (now its own tab, not tucked under the feed) has five new writers: **Casey Newton** (*Platformer*, tech), **Matthew Yglesias** (*Slow Boring*, politics), **Heather Cox Richardson** (*Letters from an American*, politics and history), **Anne Helen Petersen** (*Culture Study*, culture) and **Jonathan Haidt** (*After Babel*, social media and kids). Paywalled posts are left out, so you may see fewer from some of them. That includes Platformer's paid posts, which were slipping through and are now hidden too.

### 🔗 Shared links survive signing in

If you shared an article to Inkwell from your phone while signed out, the link used to be lost once you signed in. Now you land on the Share form with it filled in.

### 🛑 No more double-shares

Inkwell now notices when a link has already been shared — even if the address looks a little different (a trailing slash, `www.`, or tracking bits like `?utm_source=…`) — and tells you who shared it and suggests a Nod instead.

### ✋ Remove asks first

Removing an article you shared takes everyone's Nods and saved marks with it, so **Remove** now asks you to confirm.

### ✨ Polish

Switching topic filters quickly no longer shows the wrong list; the dates on cards show your own local day.

---

## October 10, 2026 *(pending — draft for review)*

### 🔑 Sign-in links explain themselves

Sign-in links only work in the browser you asked for them from — so if you requested one on your laptop and tapped it on your phone, you used to land on a blank sign-in form with no hint why. Now you'll see a short note saying exactly that and what to do. If your session ends while you're using Inkwell (say you signed out in another tab), you'll be taken to sign in again with a note, instead of Nods and Saves quietly not sticking.

### ⚡ A feed that holds up

The feed no longer slows down — or stops loading — as your list of dismissed, saved, and read articles grows. Filtering now happens in the database instead of being sent back and forth with every request.

### 🛡️ Behind the scenes

Tighter limits on what can be stored (link types, text lengths), updated framework security patches, and stricter browser security settings. Nothing to do on your end.

---

## July 10, 2026

### 🖋️ Broadsheet: a new editorial look

Inkwell's amber-and-ivory look has been retired in favor of "Broadsheet" — a newsroom-inspired palette of deep green, paper, and ink, with a new typeface pairing and a quieter, flatter card style (no drop shadows, just clean hairline borders). It's applied everywhere: article cards, the Authors section, the Share form, the whole app shell, and the sign-in, error, and "page not found" screens too.

### 🌙 Real dark mode

There's a new sun/moon switch in the header — a small pill with a sliding knob, so it's obviously a toggle at a glance. Flip it once and every page, including sign-in, remembers your choice on that device (in this browser) until you change it. You can also set it from your Profile page.

### 🔖 Save, Read, and Dismiss

Every article card now has a **⋮** menu: **Save** it for later, **mark it read**, or **dismiss** it if it's not for you. Three buttons above the topic filters — **Saved**, **Read**, **Dismissed** — let you browse just those articles, and they combine with topic filters too ("saved articles about tech" is one click away). Dismissed something by mistake? It slides out with an "Undo" option for a few seconds — and now you can also bring back anything you've dismissed at any time from the Dismissed view's ⋮ menu, not just in that first moment. Saved articles get a small tag; read ones get a quiet dot next to your name, so the feed doesn't get cluttered with badges.

### 👤 A Profile page

Click the new circular avatar next to your email to get to your **Profile** page: set your display name, pick light or dark mode (remembered per device), and check the new FAQ — including how to share articles from your phone's share sheet on Android, or a one-tap Shortcut on iPhone.

### 💬 Send feedback

There's a new **Send feedback** box at the bottom of your Profile page — found a bug, want an author added, have an idea? Type it in and hit send. It comes straight to me.

### ⚡ Faster loading

The feed now loads in smaller batches with a **Load more** button, instead of fetching every article ever shared at once. Nod counts load faster behind the scenes too.

### ✨ Polish

Section headings ("Articles from your friends," "From the Authors") are bigger and underlined so sections are easier to tell apart; the topic filter bar now shows every topic ever used, not just ones from recently loaded articles; error messages and the Remove button read correctly in dark mode; a failed dismiss now shows an error instead of silently reappearing later; and the ⋮ menu is fully keyboard-navigable.

---

## July 7, 2026

### ✨ A fresh coat of ink

Inkwell has a new look. Article cards and the Authors section were redesigned around a warm amber-and-ivory style: publication badges next to every article, elegant serif headlines, and buttons that finally feel like they belong in a reading room rather than a spreadsheet. The sidebar, topic pills, and Share button all match now — one consistent theme from top to bottom, on desktop and mobile.

### 🗞️ Real publication logos

Every article card now shows the publication's actual logo next to its name — The Atlantic's "A", Stratechery's mark, and so on — instead of a plain letter. This works on articles you've already shared too, not just new ones. The same touch now shows up in the Authors section too, so Ben, Derek, and Phil each get their site's real icon next to their name. And check your browser tab: Inkwell's quill now lives there as well, replacing the generic placeholder icon.

### 📖 "Read free" — clearer paywall help

The little link that jumps you past a paywall used to say "Archive," which honestly sounded like a filing cabinet. It now says **Read free ↗** — because that's what it does. Look for it on any article card where a friend attached a free-to-read link.

### 🚴 New author: Phil Gaimon

The "From the Authors" section has a new voice: **Phil Gaimon** — retired pro cyclist, author, and one of the funniest writers in sports. His latest free posts now appear alongside Ben Thompson (Stratechery) and Derek Thompson.

---

*Questions, bugs, or an author you'd like added? Reply to this announcement and tell us.*
