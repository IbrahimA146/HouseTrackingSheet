# Maneviyat Competition

A live scoreboard for the monthly maneviyat competition across the five houses.
No emails and no accounts to create. You pick your house, pick your name, type
the house password, and you're in.

**Cost: $0.** Static site on GitHub Pages, data on Firebase's free tier.

---

## Live

https://ibrahima146.github.io/HouseTrackingSheet/

To run it locally, serve the folder over HTTP. ES modules do not work from
`file://`:

```bash
python -m http.server 8765
```

If `src/config.js` ever goes back to placeholder keys, the app falls into
**demo mode**: an orange notice appears, nothing is saved, and every house
password becomes `demo`. That is the signal Firebase is not connected.

---

## How it works for a housemate

1. **Pick your house** from five cards
2. **Pick your name** from your house's roster
3. **Type the house password**, which the Ev Abi sets and shares
4. You're in, and you stay in on that phone until you sign out

If you picked the **Ev Abi** (the first name in each house), you're asked for a
second password on the same screen. Get it wrong and you don't get in at all.

### The three tabs

- **Me**: your own three totals against your personal floor, and the box to log progress
- **House**: your house's totals against the thresholds, plus every housemate's
  numbers, their share of the house total, and a red bar on anyone below his floor
- **Standings**: your position out of 5, and past months' winners

---

## The rules, as built

| | Per house, per month |
|---|---|
| Religious book reading | **500** pages |
| Qur'an | **80** pages |
| Cevşen | **300** bab |

- Every member must personally reach **10% of each threshold**, which is
  **50 book pages, 8 Qur'an pages, 30 bab**.
- A house **qualifies** only if it clears all three thresholds **and** every
  member cleared his floor. One man short in one category and the whole house is
  out, however good the totals look.
- Every qualified house gets the automatic reward. The qualified house with the
  highest **score** takes the extra one.
- **Score** = the average of the three completion percentages. 625/500 book
  pages, 80/80 Qur'an, 300/300 bab → `(125 + 100 + 100) / 3 = 108.3`.

These are fixed in `src/config.js`. There is no admin screen for them, by design.

### What you can and can't see

You see **your own house in full detail**: every housemate's numbers, who's
carrying the house, who's behind. You see **your rank out of 5** and how many
houses have qualified.

You **cannot** see another house's numbers. On the ladder they show as "Hidden
house". This is enforced in the database rules, not just hidden in the page:
another house's entries are unreadable with your house's login.

### The calendar

Nothing to close by hand. The app reads the real date, so on the 1st every house
starts from zero and the finished month drops into **Past months** with its winner
worked out automatically.

---

## What an Ev Abi does

Exactly two things:

1. **Set the house password**, under Ev Abi > House password
2. **Delete a wrong entry**, anyone's, from the same screen

Everything else runs itself. There is no approving members, no setting
thresholds, no closing the month.

---

## Setup, about 20 minutes, once

### 1. Create the Firebase project

1. [console.firebase.google.com](https://console.firebase.google.com) → **Create a project**.
   Turn Google Analytics **off**.
2. **Build → Authentication → Get started → Email/Password → Enable → Save.**
3. **Build → Firestore Database → Create database → Start in production mode.**
   Pick the region closest to you.

### 2. Paste in the rules

**Firestore Database → Rules**, replace everything with
[`firestore.rules`](firestore.rules), **Publish**.

> Don't skip this. Until you publish these rules, either nothing works or
> everything is readable by everyone. There's no safe middle state.

### 3. Paste in your project config

**Gear icon → Project settings → Your apps → Web (`</>`)**. Register an app
(don't tick Hosting). Copy the `firebaseConfig` values into the top of
[`src/config.js`](src/config.js). Demo mode switches itself off the moment you do.

Those keys are public by design. The rules from step 2 are the protection.

### 4. Put it on GitHub Pages

Push the folder to a repo, then **Settings → Pages → Deploy from a branch →
`main` → `/ (root)` → Save**. A minute later it's live at
`https://YOURNAME.github.io/YOUR-REPO/`.

```bash
git init && git add . && git commit -m "Maneviyat competition tracker" && git branch -M main
```

### 5. Run the setup wizard

Open your live site. Under the five houses there's **"First time? Set up the
houses"**. Tap it.

1. It asks for the **Ev Abi password**, so a passer-by can't do this. The
   starting one is in `DEFAULT_EV_ABI_PASSWORD` in `src/config.js`
2. Type the password you agreed for each of the five houses
3. Set a **new Ev Abi password**. This is required, because the starting one is
   visible in the source and must not survive setup
4. Press **Create the five house logins**

That's it. The five accounts are created straight from the browser, so you
never touch the Firebase console for this. The wizard reports each house separately,
and a house that already exists is reported as such rather than failing.

### 6. Hand out the passwords

Give each Ev Abi their house password and the new Ev Abi password. They pass
the house password to their housemates and can change it any time from the
Ev Abi tab.

> **Never write the passwords into a file in this repository.** Everything here
> is downloaded by every visitor's browser, and GitHub Pages serves this README
> too. Send them by message instead.

### 7. Optional: close the door behind you

Setup needs Firebase's email sign-up to be open. Once the five houses exist you
can shut it: **Authentication → Settings → User actions → untick "Enable create
(sign-up)"**. Leaving it on isn't dangerous, because the security rules only
recognise the five house addresses, so any other account can read and write
nothing. Turning it off is just tidier. Turn it back on if you ever need to re-run setup.

---

## Files

```
index.html            the page shell
assets/css/styles.css the ice-blue theme, phone layout first
src/config.js         YOU EDIT: Firebase keys, houses, roster, passwords
src/scoring.js        the rules, as pure functions
src/store.js          the only file that talks to Firebase
src/crypto.js         password hashing for the Ev Abi gate
src/ui.js             turns state into HTML
src/app.js            screen flow and event wiring
firestore.rules       PASTE INTO FIREBASE: the security boundary
```

If the rules ever change, `src/scoring.js` is the only file to look at.
To fix the roster or rename a house, `src/config.js` is the only one.

---

## Honest notes on security

- **Between houses, the wall is real.** The house password is checked by Firebase
  on its servers, and the rules key off the signed-in account. Without a house's
  password you cannot read its entries, devtools or not.
- **Inside a house, it's trust.** Everyone in a house shares one password, so the
  app can't cryptographically prove you're Ahmet rather than Arif. Picking your
  name is a convenience, not an identity check. For six housemates in one flat,
  that's the right trade.
- **The Ev Abi password is a role gate, not a wall.** It stops a housemate
  wandering into the settings tab. A determined housemate who already has the
  house password could work around it. It's a shared secret among the five Ev
  Abis, not a defence against your own house.
- Entries are **append-only**. A wrong number is deleted and re-added, never
  silently rewritten.
- **The passwords are short on purpose.** Firebase refuses anything under 6
  characters, so `src/config.js` appends a fixed suffix (`PASSWORD_SUFFIX`)
  before handing a password to Firebase. Everyone types the short version; the
  stored one is longer. The suffix is not a secret, it only satisfies the length
  rule, so treat a short password as exactly as strong as it looks. Changing it
  after setup would lock every house out, so leave it alone.

## Notes

- **Cost.** Firestore's free tier is 50,000 reads and 20,000 writes per day.
  29 people generate a few hundred writes a *month*. Nothing sleeps, no card needed.
- **Roster changes.** Add or remove names in `src/config.js` and push. The first
  name in each house's list is always the Ev Abi.
- **Custom domain.** GitHub Student Pack includes a free `.me` domain for a year
  via Namecheap; point it at Pages under **Settings → Pages → Custom domain**.
