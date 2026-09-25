// ============================================================
// HOT EXPRESS — Notifications
// ============================================================
import { db } from "./firebase.js";
import {
  collection, query, where, orderBy, onSnapshot, doc, updateDoc,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

export function listenNotifications(userId, cb) {
  const q = query(collection(db, "notifications"), where("toUserId", "==", userId), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export async function markRead(notifId) {
  await updateDoc(doc(db, "notifications", notifId), { read: true });
}
