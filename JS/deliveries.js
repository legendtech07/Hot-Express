// ============================================================
// HOT EXPRESS — Delivery request logic
//
// A single "deliveryRequests" collection covers every flow:
//   type "pickup"       — go collect something already sitting
//                          somewhere (e.g. a Jumia office) and
//                          bring it to the requester.
//   type "send"         — collect from the requester and take it
//                          to someone else (send a package).
//   type "vendor_order" — a buyer bought from a vendor; the
//                          vendor requests a rider to fulfil it.
//
// Riders are never assigned automatically — a request simply
// becomes visible, via notifyAvailableRiders(), to every rider
// who is (a) in the same location and (b) currently marked
// available. Any one of them may accept it first.
// ============================================================
import { db } from "./firebase.js";
import {
  collection, addDoc, doc, updateDoc, getDocs, getDoc, query, where,
  orderBy, onSnapshot, serverTimestamp, writeBatch,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

/** Create a new delivery request and notify nearby available riders. */
export async function createDeliveryRequest(data) {
  const ref = await addDoc(collection(db, "deliveryRequests"), {
    ...data,
    status: "pending",
    riderId: null,
    riderName: null,
    riderPhone: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await notifyAvailableRiders(data.location, ref.id, data.itemDescription);
  return ref.id;
}

/** Push a notification doc to every rider currently available in this location. */
export async function notifyAvailableRiders(location, requestId, itemDescription) {
  const q = query(
    collection(db, "users"),
    where("roles", "array-contains", "rider"),
    where("location", "==", location),
    where("riderInfo.available", "==", true)
  );
  const snap = await getDocs(q);
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.forEach((riderDoc) => {
    const notifRef = doc(collection(db, "notifications"));
    batch.set(notifRef, {
      toUserId: riderDoc.id,
      title: "New delivery request near you",
      body: itemDescription ? `Pickup: ${itemDescription}` : "A new request is available in your area.",
      requestId,
      read: false,
      createdAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

async function notifyUser(userId, title, body, requestId) {
  await addDoc(collection(db, "notifications"), {
    toUserId: userId, title, body, requestId, read: false, createdAt: serverTimestamp(),
  });
}

/** All open (pending) requests a rider can see in their own location. */
export function listenOpenJobs(location, cb) {
  const q = query(
    collection(db, "deliveryRequests"),
    where("location", "==", location),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

/** A rider accepts an open job — first to accept wins. */
export async function acceptJob(requestId, rider) {
  const ref = doc(db, "deliveryRequests", requestId);
  const current = await getDoc(ref);
  if (!current.exists() || current.data().status !== "pending") {
    throw new Error("This job was already taken by another rider.");
  }
  await updateDoc(ref, {
    status: "accepted",
    riderId: rider.uid,
    riderName: rider.name,
    riderPhone: rider.phone,
    updatedAt: serverTimestamp(),
  });
  await notifyUser(current.data().requesterId, "A rider accepted your request", `${rider.name} is on the way.`, requestId);
}

/** Rider moves a job forward: accepted -> picked_up -> in_transit -> delivered. */
export async function updateJobStatus(requestId, status) {
  const ref = doc(db, "deliveryRequests", requestId);
  const snap = await getDoc(ref);
  await updateDoc(ref, { status, updatedAt: serverTimestamp() });
  if (snap.exists()) {
    const label = { picked_up: "picked up your item", in_transit: "is on the way to you", delivered: "marked your delivery complete" }[status];
    if (label) await notifyUser(snap.data().requesterId, "Delivery update", `Your rider ${label}.`, requestId);
  }
}

export async function cancelRequest(requestId) {
  await updateDoc(doc(db, "deliveryRequests", requestId), { status: "cancelled", updatedAt: serverTimestamp() });
}

/** Live list of requests belonging to one requester (for deliveries.html pages). */
export function listenMyRequests(requesterId, cb) {
  const q = query(collection(db, "deliveryRequests"), where("requesterId", "==", requesterId), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

/** Live list of jobs a rider currently holds / has completed. */
export function listenRiderJobs(riderId, cb) {
  const q = query(collection(db, "deliveryRequests"), where("riderId", "==", riderId), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export function watchRequest(requestId, cb) {
  return onSnapshot(doc(db, "deliveryRequests", requestId), (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null));
}
