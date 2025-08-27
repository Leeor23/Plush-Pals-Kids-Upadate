# Inventory — Firestore (Vite + React + TS)

Full checklist implemented:
- Add/Edit/Delete items (modal)
- Search + filters (Name Drop, Category, Plush, Color, Tie‑Dye All|Yes|No)
- Numbered rows that follow filter/sort
- Totals/stat cards: Total SKUs, Total Units, Filtered SKUs, Units in Name Drop
- Import CSV (merge by barcode, normalize text + boolean)
- Export CSV (proper quoting)
- Image upload to Firebase Storage
- Realtime sync across devices (Firestore + Anonymous Auth)

## Firebase Setup
Enable Anonymous Auth, Firestore, and (optional) Storage.
Set env vars (Vercel → Project Settings → Environment Variables):

- VITE_FIREBASE_API_KEY
- VITE_FIREBASE_AUTH_DOMAIN
- VITE_FIREBASE_PROJECT_ID
- VITE_FIREBASE_STORAGE_BUCKET
- VITE_FIREBASE_APP_ID
- VITE_FIRESTORE_COLLECTION (e.g. items)

## Local Dev
```bash
npm install
npm run dev
```

## Deploy (Vercel)
- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`
