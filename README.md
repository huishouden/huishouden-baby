# Huishouden Baby

A wall-tablet app for a household expecting a baby. Before the birth it shows the due-date countdown,
upcoming appointments (with reminders the day before and 2 hours before), checklists (hospital bag, car seat, nursery, paperwork) and the care team's
contacts (pediatrician, midwife, hospital), each one tap from a call or a map. After the birth the
main screen becomes a one-tap log of feeds, sleep, diapers and pumping, readable from across the room:
when the baby last ate, how long they have been asleep or awake, and today's totals. Every entry shows
who logged it, and the whole household sees the same log.

Live at https://huishouden-piekstra.web.app/baby/, also linked from the [Huishouden portal](https://huishouden-piekstra.web.app). The old address, huishouden-baby.web.app, redirects there.
Installable on the tablet, phones and laptops, and works offline (entries sync when the connection is back).

## Screenshots

| Before the birth | After: the log |
|---|---|
| ![Countdown, next appointment and checklists](docs/screenshots/before.png) | ![Last fed, asleep for, last diaper, log buttons and today's timeline](docs/screenshots/log.png) |

| Checklists | Phone |
|---|---|
| ![Checklists grouped by list](docs/screenshots/checklists.png) | ![The log on a phone](docs/screenshots/phone-log.png) |

| Contacts | Import from calendar |
|---|---|
| ![The care team with tap-to-call numbers and map links](docs/screenshots/contacts.png) | ![Baby events found in the calendar, each with Add](docs/screenshots/calendar-import.png) |

_Screenshots of the live site signed out, which shows an invented sample family dated in 2031 (`?demo=after` for the log). Refreshed by CI after each deploy._

## Data

Signed-in members of a Huishouden household read and write under `households/{householdId}`:
`babyProfile/main` (name, due date, birth date), `babyEvents` (feed, sleep, diaper, pump),
`babyChecklists` and `babyAppointments` (an appointment may point at a contact and at the calendar
event it came from). Contacts live in the household-wide `contacts` collection shared by every app
(`@huishouden/pwa-kit/contacts`); Baby shows those whose `apps` include `baby`.
Once the household has set its home in the portal (`households/{id}.home`, kit `./home`), each
contact's card, a checklist item's contact and an appointment at a contact's place say how far it
is from home ("2.3 mi from home"), from the position the contact's map search found; the search
prefers places near home. The Firestore rules
live in the repo that owns the project's rules file. Signing in uses Google with no extra scopes; the
household comes from the shared `households` document, so one invite from the portal opens every
Huishouden app.

Baby publishes its dates to the household agenda (`households/{householdId}/agenda`,
`@huishouden/pwa-kit/agenda`) so the portal's calendar and Today view show them: each appointment
(timed, with its place and the baby's name) and, until the birth, the due date (all day). Saving or
deleting an appointment or the baby's details updates the agenda at once; opening the app reconciles
it (`src/lib/agenda.ts`). Links open the Appointments tab (`#appointments`) or the main screen.

Each appointment also schedules two push reminders (`households/{householdId}/reminders`,
`@huishouden/pwa-kit/reminders`, `src/lib/reminders.ts`): the day before and 2 hours before, in
every language so each device is notified in its own. "Remind me" in the appointment dialog is on
by default; turning it off stores `remind: false` on the appointment, and the reminders go. Each
reminder names the appointment as its `source`, so moving or deleting it cancels them unsent. A
private appointment's reminders are private. They are rescheduled the moment an appointment is
saved or deleted; a helper's or kid's device schedules them too, without the `source` (the kit
lets only admins and members attach it), and an admin's or member's device adds it on its next sync. Each person turns on notifications per device, once
for the whole suite, from the card under the appointments (`VITE_VAPID_PUBLIC_KEY`, the push key
shared by the suite); "Mute appointment reminders for me" silences Baby for them alone.

Checklist items still to do go on the household to-do list instead (`households/{householdId}/todos`,
`@huishouden/pwa-kit/todos`, `src/lib/todos.ts`), so the portal's To-do tab can tick them off (Done,
anyone) or skip them (Skip, admins and members or whoever added the item). Baby syncs the list on
open and a few seconds after a checklist changes. A skipped item stays in its checklist as Skipped,
counted neither as done nor as left to do, and Un-skip puts it back.

Find in my calendar and Import from calendar read Google Calendar (read-only) through
`@huishouden/pwa-kit/calendar`; Google asks once for permission the first time. Find a business looks
places up on OpenStreetMap (`@huishouden/pwa-kit/places`), only when Search is pressed.

## Privacy

Household data lives in the household's own Firestore documents, visible only to its members.
To catch problems early, the app sends reports to New Relic (free tier) through
`@huishouden/pwa-kit/observability`: errors (emails, ids, query strings and long numbers removed),
Core Web Vitals and page loads, the app version, device type, and the country and region New Relic
derives from the request; and anonymous usage counts per visit: `log entry` (with its kind: feed, sleep, diaper…), `save appointment`, `add checklist item`, `save baby profile`, and which tab is open. Households are counted by a
hash of the id. No names, emails, entries, free text or precise location, and no cookie or stored
id: nothing links one visit to the next. When the browser sends Global Privacy Control or Do Not
Track, usage counts are skipped; errors and speed still go. Local builds, staging and automated
browsers send nothing. The page people see is
[huishouden-piekstra.web.app/privacy](https://huishouden-piekstra.web.app/privacy); details in pwa-kit
[docs/observability.md](https://github.com/huishouden/pwa-kit/blob/main/docs/observability.md).

## Develop

```sh
bun install          # also enables the pre-commit leak scan
bun run env:pull     # writes .env.local from the repo's VITE_* variables
bun run dev          # http://localhost:3002
bun run lint && bun run test && bunx pwa-design-check && bun run build
bun run e2e          # Playwright smoke and sample-data feature tests against the live site (BASE_URL to override)
bun run screenshots  # README screenshots (SCREENSHOT_DIR to override)
bun run icons        # regenerate the logo and PNG icons
```

Built on [huishouden-pwa-kit](https://github.com/huishouden/pwa-kit) and follows its
[design language](https://github.com/huishouden/pwa-kit/blob/main/DESIGN.md) and
[standard](https://github.com/huishouden/pwa-kit/blob/main/STANDARD.md). Pushes to `main` upload the hashed build files to the suite's asset CDN (the
Cloudflare Worker `huishouden-assets`, with the repo secrets `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`; the variable `HH_ASSET_CDN=off` turns it off) and deploy the pages to
Firebase Hosting (project `huishouden-piekstra`, site `huishouden-baby`), then run the smoke tests and refresh the screenshots.

## License

Source available under [PolyForm Shield 1.0.0](LICENSE): you may use, study and modify this code
for any purpose except providing a product that competes with Huishouden.

Huishouden and its logo are the project's brand; please don't use them for other products.
