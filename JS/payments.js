// ============================================================
// HOT EXPRESS — Payments & commission
//
// No payment gateway is wired up yet. For now, "POD" (Payment on
// Delivery) means the buyer/requester pays the rider in person and
// the rider logs the fee here so it counts toward earnings and the
// platform commission. Swapping in Paystack/Flutterwave later only
// means changing recordPayment() below — every page that reads
// earnings already goes through this file.
// ============================================================
import { db } from "./firebase.js";
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

export const COMMISSION_RATE = 0.1; // Hot Express keeps 10% of the delivery fee.

export function splitFee(fee) {
  const commission = Math.round(fee * COMMISSION_RATE);
  return { commission, riderTakeHome: fee - commission };
}

/** Record the fee a rider collected for a completed delivery (POD). */
export async function recordPayment(requestId, fee) {
  await updateDoc(doc(db, "deliveryRequests", requestId), {
    fee,
    paidAt: serverTimestamp(),
  });
}
