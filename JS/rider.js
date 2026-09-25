// ============================================================
// HOT EXPRESS — /rider pages
// Riders are never force-assigned. available-jobs.html shows every
// open request in the rider's own location, live, only while they
// have flipped themselves "Available" on the dashboard.
// ============================================================
import { db } from "./firebase.js";
import { requireRole, toast, formatDate, statusBadge, wireMobileNav, initials, logout } from "./utils.js";
import { doc, updateDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { listenOpenJobs, acceptJob, listenRiderJobs, updateJobStatus, watchRequest } from "./deliveries.js";
import { renderTrackingRail } from "./tracking.js";
import { recordPayment, splitFee } from "./payments.js";
import { listenNotifications, markRead } from "./notifications.js";

function paintShell(profile) {
  document.querySelectorAll("[data-user-name]").forEach((el) => (el.textContent = profile.name));
  document.querySelectorAll("[data-user-avatar]").forEach((el) => (el.textContent = initials(profile.name)));
  document.querySelectorAll("[data-user-location]").forEach((el) => (el.textContent = profile.location));
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", () => logout("../"));
  wireMobileNav();
}

export async function initRiderDashboard() {
  const { user, profile } = await requireRole("rider", "../");
  paintShell(profile);

  const toggle = document.getElementById("availableToggle");
  toggle.checked = !!profile.riderInfo?.available;
  toggle.addEventListener("change", async () => {
    await updateDoc(doc(db, "users", user.uid), { "riderInfo.available": toggle.checked });
    toast(toggle.checked ? "You're now visible to nearby requests." : "You're now hidden from new requests.", "info");
  });

  document.getElementById("statCompleted").textContent = profile.riderInfo?.completedJobs || 0;

  const q = query(collection(db, "deliveryRequests"), where("riderId", "==", user.uid), where("status", "in", ["accepted", "picked_up", "in_transit"]));
  const snap = await getDocs(q);
  document.getElementById("statActive").textContent = snap.size;
}

export async function initAvailableJobs() {
  const { user, profile } = await requireRole("rider", "../");
  paintShell(profile);
  const list = document.getElementById("jobList");

  if (!profile.riderInfo?.available) {
    list.innerHTML = `<div class="empty-state"><h3>You're marked unavailable</h3><p>Turn on availability from your dashboard to start seeing jobs.</p></div>`;
    return;
  }

  listenOpenJobs(profile.location, (jobs) => {
    list.innerHTML = !jobs.length
      ? `<div class="empty-state"><h3>No open requests right now</h3><p>New requests in ${profile.location} will appear here instantly.</p></div>`
      : jobs.map((j) => `
        <div class="job-card">
          <div class="flex-between"><strong>${j.itemDescription || "Delivery request"}</strong>${statusBadge(j.status)}</div>
          <div class="route">📍 ${j.pickupAddress || "—"} → 🏁 ${j.dropoffAddress || "—"}</div>
          <div class="muted" style="font-size:12px;margin-bottom:10px">${formatDate(j.createdAt)} · ${j.type === "pickup" ? "Pickup for requester" : j.type === "send" ? "Send package" : "Vendor order"}</div>
          <button class="btn btn-primary btn-sm" data-accept="${j.id}">Accept job</button>
        </div>`).join("");

    list.querySelectorAll("[data-accept]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true; btn.textContent = "Accepting…";
        try {
          await acceptJob(btn.dataset.accept, { uid: user.uid, name: profile.name, phone: profile.phone });
          toast("Job accepted — head to Active Delivery.", "success");
          window.location.href = "active-delivery.html";
        } catch (err) {
          toast(err.message, "error");
        }
      });
    });
  });
}

export async function initActiveDelivery() {
  const { user, profile } = await requireRole("rider", "../");
  paintShell(profile);
  const box = document.getElementById("activeBox");

  listenRiderJobs(user.uid, (jobs) => {
    const active = jobs.find((j) => ["accepted", "picked_up", "in_transit"].includes(j.status));
    if (!active) {
      box.innerHTML = `<div class="empty-state"><h3>No active delivery</h3><p>Accept a job from Available Jobs to get started.</p></div>`;
      return;
    }
    const nextStep = { accepted: ["picked_up", "Mark as picked up"], picked_up: ["in_transit", "Mark as in transit"], in_transit: ["delivered", "Mark as delivered"] }[active.status];

    box.innerHTML = `
      <div class="card">
        <div class="flex-between"><strong>${active.itemDescription || "Delivery"}</strong>${statusBadge(active.status)}</div>
        <p style="margin:10px 0 0">📍 Pickup: ${active.pickupAddress || "—"}</p>
        <p style="margin:4px 0 0">🏁 Drop-off: ${active.dropoffAddress || "—"}</p>
        <p class="muted" style="margin:4px 0 16px">${active.requesterName || active.recipientName || ""} · ${active.requesterPhone || active.recipientPhone || ""}</p>
        ${renderTrackingRail(active)}
        <div style="display:flex;gap:10px;margin-top:16px">
          ${nextStep ? `<button class="btn btn-primary" id="advanceBtn">${nextStep[1]}</button>` : ""}
        </div>
        ${active.status === "in_transit" ? `
          <div class="field" style="margin-top:16px">
            <label>Delivery fee collected (₦) — POD</label>
            <input type="number" id="feeInput" placeholder="e.g. 1500">
          </div>` : ""}
      </div>`;

    const advanceBtn = document.getElementById("advanceBtn");
    if (advanceBtn) {
      advanceBtn.addEventListener("click", async () => {
        const [next] = nextStep;
        advanceBtn.disabled = true;
        if (next === "delivered") {
          const feeInput = document.getElementById("feeInput");
          const fee = Number(feeInput?.value || 0);
          if (fee > 0) {
            await recordPayment(active.id, fee);
            const { riderTakeHome } = splitFee(fee);
            toast(`Delivered! You keep ₦${riderTakeHome.toLocaleString()} after commission.`, "success");
          }
          await updateDoc(doc(db, "users", user.uid), { "riderInfo.completedJobs": (profile.riderInfo?.completedJobs || 0) + 1 });
        }
        await updateJobStatus(active.id, next);
      });
    }
  });
}

export async function initDeliveryHistory() {
  const { user, profile } = await requireRole("rider", "../");
  paintShell(profile);
  const list = document.getElementById("historyList");
  listenRiderJobs(user.uid, (jobs) => {
    const done = jobs.filter((j) => ["delivered", "cancelled"].includes(j.status));
    list.innerHTML = !done.length
      ? `<div class="empty-state"><h3>No completed deliveries yet</h3></div>`
      : done.map((j) => `
        <div class="card" style="margin-bottom:10px">
          <div class="flex-between"><strong>${j.itemDescription || "Delivery"}</strong>${statusBadge(j.status)}</div>
          <div class="muted" style="font-size:13px;margin-top:6px">${formatDate(j.createdAt)} ${j.fee ? `· ₦${Number(j.fee).toLocaleString()} collected` : ""}</div>
        </div>`).join("");
  });
}

export async function initEarnings() {
  const { user, profile } = await requireRole("rider", "../");
  paintShell(profile);
  listenRiderJobs(user.uid, (jobs) => {
    const paid = jobs.filter((j) => j.status === "delivered" && j.fee);
    const total = paid.reduce((sum, j) => sum + Number(j.fee), 0);
    const { riderTakeHome } = splitFee(total);
    document.getElementById("statTotalFees").textContent = `₦${total.toLocaleString()}`;
    document.getElementById("statTakeHome").textContent = `₦${riderTakeHome.toLocaleString()}`;
    document.getElementById("statJobsPaid").textContent = paid.length;

    const list = document.getElementById("earningsList");
    list.innerHTML = !paid.length
      ? `<div class="empty-state"><h3>No paid deliveries yet</h3></div>`
      : paid.map((j) => {
        const s = splitFee(Number(j.fee));
        return `<tr><td>${j.itemDescription || "Delivery"}</td><td>${formatDate(j.createdAt)}</td><td>₦${Number(j.fee).toLocaleString()}</td><td>₦${s.riderTakeHome.toLocaleString()}</td></tr>`;
      }).join("");
  });
}

export async function initRiderNotifications() {
  const { user, profile } = await requireRole("rider", "../");
  paintShell(profile);
  const list = document.getElementById("notifList");
  listenNotifications(user.uid, (rows) => {
    list.innerHTML = !rows.length
      ? `<div class="empty-state"><h3>You're all caught up</h3></div>`
      : rows.map((n) => `
        <div class="card" style="margin-bottom:10px;${n.read ? "opacity:.6" : ""}">
          <div class="flex-between"><strong>${n.title}</strong><span class="muted" style="font-size:12px">${formatDate(n.createdAt)}</span></div>
          <p style="margin:6px 0 8px">${n.body}</p>
          <div style="display:flex;gap:10px">
            ${n.requestId ? `<a class="btn btn-outline btn-sm" href="active-delivery.html">View</a>` : ""}
            ${!n.read ? `<button class="btn btn-outline btn-sm" data-id="${n.id}">Mark read</button>` : ""}
          </div>
        </div>`).join("");
    list.querySelectorAll("button[data-id]").forEach((b) => b.addEventListener("click", () => markRead(b.dataset.id)));
  });
}

export async function initRiderProfile() {
  const { user, profile } = await requireRole("rider", "../");
  paintShell(profile);
  const form = document.getElementById("profileForm");
  form.phone.value = profile.phone || "";
  form.vehicleType.value = profile.riderInfo?.vehicleType || "bike";
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await updateDoc(doc(db, "users", user.uid), {
      phone: form.phone.value.trim(),
      "riderInfo.vehicleType": form.vehicleType.value,
    });
    toast("Rider profile updated.", "success");
  });
}
