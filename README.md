# eRecipe 📖

> **All your favourite recipes — in one beautiful, shareable app.**

A Progressive Web App (PWA) for storing, organising, and sharing recipes. Built with vanilla HTML/CSS/JS and Firebase for real-time sync and Google authentication.

---

## Features

- 📚 **Chapters & Recipes** — Organise recipes into named chapters
- ☁️ **Cloud Sync** — Save and load from a shared Firestore database
- 💬 **Recipe Comments** — Real-time chat/comments on each recipe
- 🔔 **Notifications** — Get notified when someone comments on a recipe
- ⏱ **Timers** — Start countdown timers directly from recipe steps
- 📖 **EPUB Export** — Download your recipe book as an e-reader file
- 🖨 **Print Cards** — Print double-sided A6 recipe cards (4-up on A4)
- 📱 **Mobile-friendly** — Responsive design with a dedicated mobile nav
- 🔌 **PWA / Offline** — Installable with service worker support
- 🔒 **Google Sign-In** — Authentication via Firebase Auth

---

## Project Structure

```
erecipe/
├── index.html          # Main app shell & markup
├── manifest.json       # PWA manifest
├── sw.js               # Service worker (offline support)
├── favicon.ico / *.png # App icons
│
├── css/
│   └── styles.css      # All application styles
│
└── js/
    ├── data.js         # Local storage, data model, defaults
    ├── render.js       # Render helpers (sidebar, recipe view, lists)
    ├── desktop.js      # Desktop UI logic
    ├── mobile.js       # Mobile UI logic
    ├── timers.js       # Countdown timer logic
    ├── notifications.js# In-app notification bell logic
    ├── print.js        # Print cards & EPUB export
    ├── firebase.js     # Firebase init, Auth, Firestore, Comments
    └── utils.js        # Toast, name modal, misc helpers
```

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/your-username/erecipe.git
cd erecipe
```

### 2. Configure Firebase

Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com) and enable:
- **Authentication** → Google sign-in provider
- **Firestore Database** → in production mode

Then update the config object in `js/firebase.js`:

```js
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
```

### 3. Serve locally

Any static file server works:

```bash
# Python
python3 -m http.server 8080

# Node (npx)
npx serve .

# VS Code: use the Live Server extension
```

Then open `http://localhost:8080` in your browser.

---

## Firestore Data Model

```
shared_chapters/
  {chapterId}             ← { id, name }

shared_recipes/
  {recipeId}              ← { id, chapterId, title, desc,
                               ingredients[], steps[], tip,
                               savedBy, savedAt }

recipe_comments/
  {recipeId}/
    messages/
      {messageId}         ← { text, uid, displayName,
                               photoURL, createdAt }

users/
  {uid}                   ← { displayName, email, photoURL, updatedAt }
```

> **Sync is additive only** — saving never deletes remote recipes. Deletions are local only unless you manually remove documents in the Firebase console.

---

## Firestore Security Rules (recommended)

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{uid} {
      allow read, write: if request.auth.uid == uid;
    }

    match /shared_chapters/{id} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }

    match /shared_recipes/{id} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }

    match /recipe_comments/{recipeId}/messages/{msgId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow delete: if request.auth.uid == resource.data.uid;
    }
  }
}
```

---

## PWA Icons Required

Place these files in the project root:

| File | Size | Used for |
|------|------|----------|
| `favicon.ico` | 32×32 | Browser tab |
| `favicon-16.png` | 16×16 | Browser tab (PNG) |
| `favicon-32.png` | 32×32 | Browser tab (PNG) |
| `icon-64.png` | 64×64 | Header logo |
| `icon-192.png` | 192×192 | PWA install / Android |
| `icon-512.png` | 512×512 | PWA splash screen |

---

## Local Backup

Use **Settings → Download** to export your recipes as a `.json` file, and **Settings → Load File** to restore from one. The file format matches the internal data model:

```json
{
  "chapters": [{ "id": "breakfast", "name": "Breakfast Foods" }],
  "recipes":  [{ "id": "r1", "chapterId": "breakfast", "title": "...", ... }]
}
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML, CSS, JavaScript (ES Modules) |
| Auth | Firebase Authentication (Google) |
| Database | Cloud Firestore |
| Offline | Service Worker + `localStorage` cache |
| EPUB | [JSZip](https://stuk.github.io/jszip/) |
| Fonts | Google Fonts — Playfair Display + Lato |

---

## License

MIT — use freely, credit appreciated.
