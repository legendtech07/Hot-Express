// ============================================================
// HOT EXPRESS — /admin pages
// A lighter-weight area: real reads from Firestore throughout,
// with the handful of write actions an operator actually needs
// day to day. Deeper moderation tooling is a natural next step —
// see README "What's stubbed".
// ============================================================
import { db } from "./firebase.js";
import { requireRole, toast, formatDate, statusBadge, wireMobileNav, initials, logout } from "./utils.js";
import {
  collection, getDocs, query, where, orderBy, doc, updateDoc, setDoc, getDoc,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { splitFee } from "./payments.js";

function paintShell(profile) {
  document.querySelectorAll("[data-user-name]").forEach((el) => (el.textContent = profile.name));
  document.querySelectorAll("[data-user-avatar]").forEach((el) => (el.textContent = initials(profile.name)));
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", () => logout("../"));
  wireMobileNav();
}

async function allUsers() {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function allRequests() {
  const snap = await getDocs(query(collection(db, "deliveryRequests"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function initAdminDashboard() {
  const { profile } = await requireRole("admin", "../");
  paintShell(profile);
  const [users, requests] = await Promise.all([allUsers(), allRequests()]);

  document.getElementById("statUsers").textContent = users.length;
  document.getElementById("statVendors").textContent = users.filter((u) => (u.roles || []).includes("vendor")).length;
  document.getElementById("statRiders").textContent = users.filter((u) => (u.roles || []).includes("rider")).length;
  document.getElementById("statDeliveries").textContent = requests.length;

  const delivered = requests.filter((r) => r.status === "delivered" && r.fee);
  const commission = delivered.reduce((sum, r) => sum + splitFee(Number(r.fee)).commission, 0);
  document.getElementById("statCommission").textContent = `₦${commission.toLocaleString()}`;

  const byLocation = { Ondo: 0, Enugu: 0 };
  requests.forEach((r) => { if (byLocation[r.location] !== undefined) byLocation[r.location]++; });
  document.getElementById("locBreakdown").textContent = `Ondo: ${byLocation.Ondo} · Enugu: ${byLocation.Enugu}`;

  const list = document.getElementById("recentList");
  list.innerHTML = requests.slice(0, 8).map((r) => `
    <tr>
      <td>${r.itemDescription || "—"}</td>
      <td>${r.location}</td>
      <td>${statusBadge(r.status)}</td>
      <td>${formatDate(r.createdAt)}</td>
    </tr>`).join("");
}

export async function initAdminUsers() {
  const { profile } = await requireRole("admin", "../");
  paintShell(profile);
  const users = await allUsers();
  const tbody = document.getElementById("usersBody");
  tbody.innerHTML = users.map((u) => `
    <tr>
      <td>${u.name || "—"}</td>
      <td>${u.email || "—"}</td>
      <td>${u.location || "—"}</td>
      <td>${(u.roles || []).join(", ")}</td>
      <td>${formatDate(u.createdAt)}</td>
    </tr>`).join("");
}

export async function initAdminVendors() {
  const { profile } = await requireRole("admin", "../");
  paintShell(profile);
  const users = (await allUsers()).filter((u) => (u.roles || []).includes("vendor"));
  const productsSnap = await getDocs(collection(db, "products"));
  const products = productsSnap.docs.map((d) => d.data());

  const tbody = document.getElementById("vendorsBody");
  tbody.innerHTML = users.map((u) => {
    const count = products.filter((p) => p.vendorId === u.id).length;
    return `<tr>
      <td>${u.vendorInfo?.businessName || u.name}</td>
      <td>${u.phone || "—"}</td>
      <td>${u.location}</td>
      <td>${count}</td>
      <td>${u.vendorInfo?.verified ? '<span class="badge badge-delivered">Verified</span>' : '<span class="badge badge-pending">Unverified</span>'}</td>
    </tr>`;
  }).join("");
}

export async function initAdminRiders() {
  const { profile } = await requireRole("admin", "../");
  paintShell(profile);
  const users = (await allUsers()).filter((u) => (u.roles || []).includes("rider"));
  const tbody = document.getElementById("ridersBody");
  tbody.innerHTML = users.map((u) => `
    <tr>
      <td>${u.name}</td>
      <td>${u.phone || "—"}</td>
      <td>${u.location}</td>
      <td>${u.riderInfo?.vehicleType || "—"}</td>
      <td>${u.riderInfo?.completedJobs || 0}</td>
      <td>${u.riderInfo?.available ? '<span class="badge badge-delivered">Available</span>' : '<span class="badge badge-cancelled">Offline</span>'}</td>
    </tr>`).join("");
}

export async function initAdminDeliveries() {
  const { profile } = await requireRole("admin", "../");
  paintShell(profile);
  const requests = await allRequests();
  const tbody = document.getElementById("deliveriesBody");
  const pills = document.querySelectorAll("#statusFilter button");

  function draw(filter) {
    const rows = filter === "all" ? requests : requests.filter((r) => r.status === filter);
    tbody.innerHTML = !rows.length
      ? `<tr><td colspan="6" class="muted" style="padding:20px">No requests in this state.</td></tr>`
      : rows.map((r) => `
        <tr>
          <td>${r.itemDescription || "—"}</td>
          <td>${r.requesterName || "—"}</td>
          <td>${r.riderName || "—"}</td>
          <td>${r.location}</td>
          <td>${statusBadge(r.status)}</td>
          <td>${formatDate(r.createdAt)}</td>
        </tr>`).join("");
  }
  draw("all");
  pills.forEach((btn) => btn.addEventListener("click", () => {
    pills.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    draw(btn.dataset.status);
  }));
}

export async function initAdminPayments() {
  const { profile } = await requireRole("admin", "../");
  paintShell(profile);
  const requests = (await allRequests()).filter((r) => r.status === "delivered" && r.fee);
  const totalFees = requests.reduce((s, r) => s + Number(r.fee), 0);
  const totalCommission = requests.reduce((s, r) => s + splitFee(Number(r.fee)).commission, 0);

  document.getElementById("statTotalFees").textContent = `₦${totalFees.toLocaleString()}`;
  document.getElementById("statCommission").textContent = `₦${totalCommission.toLocaleString()}`;
  document.getElementById("statPaidJobs").textContent = requests.length;

  const tbody = document.getElementById("paymentsBody");
  tbody.innerHTML = requests.map((r) => {
    const s = splitFee(Number(r.fee));
    return `<tr>
      <td>${r.itemDescription || "—"}</td>
      <td>${r.riderName || "—"}</td>
      <td>₦${Number(r.fee).toLocaleString()}</td>
      <td>₦${s.commission.toLocaleString()}</td>
      <td>${formatDate(r.createdAt)}</td>
    </tr>`;
  }).join("");
}

export async function initAdminDisputes() {
  const { profile } = await requireRole("admin", "../");
  paintShell(profile);
  const snap = await getDocs(collection(db, "disputes")).catch(() => null);
  const list = document.getElementById("disputesList");
  const rows = snap ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
  list.innerHTML = !rows.length
    ? `<div class="empty-state"><h3>No disputes filed</h3><p>There's no in-app "report an issue" flow yet — this table is ready for one.</p></div>`
    : rows.map((d) => `<div class="card" style="margin-bottom:10px">${d.summary || "Dispute"}</div>`).join("");
}

export async function initAdminSettings() {
  const { profile } = await requireRole("admin", "../");
  paintShell(profile);
  const form = document.getElementById("settingsForm");
  const ref = doc(db, "settings", "global");
  const snap = await getDoc(ref);
  const current = snap.exists() ? snap.data() : { commissionRate: 10 };
  form.commissionRate.value = current.commissionRate ?? 10;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await setDoc(ref, { commissionRate: Number(form.commissionRate.value) }, { merge: true });
    toast("Saved. Note: js/payments.js still uses a fixed COMMISSION_RATE constant — wire it to this value when you're ready.", "info");
  });
}
