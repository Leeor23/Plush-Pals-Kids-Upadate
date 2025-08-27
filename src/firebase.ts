import { initializeApp, getApps } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { getStorage } from 'firebase/storage'

export type FirebaseParts = {
  auth: ReturnType<typeof getAuth>,
  db: ReturnType<typeof getFirestore>,
  storage: ReturnType<typeof getStorage>,
}

export function initFirebase(): FirebaseParts | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID
  const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET
  const appId = import.meta.env.VITE_FIREBASE_APP_ID

  if (!apiKey || !authDomain || !projectId || !storageBucket || !appId) return null

  const app = getApps()[0] ?? initializeApp({ apiKey, authDomain, projectId, storageBucket, appId })
  const auth = getAuth(app)
  const db = getFirestore(app)
  const storage = getStorage(app)
  signInAnonymously(auth).catch(()=>{})
  return { auth, db, storage }
}
