# BHS Inventory — GitHub-ready (Vite + Firebase)

This is the **Cloud Sync** version. It reads Firebase config from `.env.local` during build (Vite).

## Quick start
1) Create a Firebase project. Enable **Anonymous Auth**; create **Firestore** (Production) and **Storage**.
2) Copy `.env.example` → `.env.local` and paste your Web App keys.
3) Install & run:
```bash
npm install
npm run dev
```

## Deploy (Vercel)
- Import repo → set env vars `VITE_FIREBASE_*` (from `.env.local`) → build: `npm run build` → output: `dist`.

## CSV
Header: `barcode,plush,style,category,color,nameDrop,quantity,tieDye,notes,imageUrl`. Rows without `barcode` are skipped.
