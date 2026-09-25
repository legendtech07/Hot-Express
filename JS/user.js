// ============================================================
// HOT EXPRESS — /user pages
// Every function here is called from the matching user/*.html file.
// ============================================================
import { auth, db } from "./firebase.js";
import { requireAuth, toast, formatDate, statusBadge, wireMobileNav, initials, logout } from "./utils.js";
import { collection, query, where, getDocs, orderBy, limit, doc, updateDoc } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { createDeliveryRequest, listenMyRequests, watchRequest, cancelRequest } from "./deliveries.js";
import { renderTrackingRail } from "./tracking.js";
import { listenNotifications, markRead } from "./notifications.js";

/** Products currently for sale near the signed-in buyer (dashboard "Marketplace" section). */
async function loadNearbyProducts(user, profile) {
  const grid = document.getElementById("productGrid");
  if (!grid) return;
  const q = query(
    collection(db, "products"),
    where("location", "==", profile.location),
    where("status", "==", "available"),
    orderBy("createdAt", "desc"),
    limit(6)
  );
  const snap = await getDocs(q);
  if (snap.empty) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h3>No vendors listing items in ${profile.location} yet</h3></div>`;
    return;
  }
  grid.innerHTML = snap.docs.map((d) => {
    const p = d.data();
    return `<div class="product-card">
      <div class="thumb">📦</div>
      <div class="body">
        <strong>${p.title}</strong>
        <p style="font-size:13px;margin:4px 0">${p.description || ""}</p>
        <div class="flex-between">
          <span class="price">₦${Number(p.price).toLocaleString()}</span>
          <button class="btn btn-primary btn-sm" data-buy="${d.id}">Buy</button>
        </div>
      </div>
    </div>`;
  }).join("");

  grid.querySelectorAll("[data-buy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const productId = btn.dataset.buy;
      const prodSnap = snap.docs.find((d) => d.id === productId);
      const p = prodSnap.data();
      const dropoffAddress = window.prompt("Where should this be delivered?", "");
      if (!dropoffAddress) return;
      btn.disabled = true;
      btn.textContent = "Requesting…";
      try {
        const id = await createDeliveryRequest({
          requesterId: user.uid,
          requesterName: profile.name,
          requesterPhone: profile.phone,
          type: "vendor_order",
          location: profile.location,
          vendorId: p.vendorId,
          productId,
          pickupAddress: p.vendorName ? `${p.vendorName} (vendor)` : "Vendor location",
          dropoffAddress,
          itemDescription: p.title,
          notes: "",
        });
        toast("Order placed — nearby riders notified!", "success");
        window.location.href = `delivery-details.html?id=${id}`;
      } catch {
        toast("Couldn't place the order. Try again.", "error");
        btn.disabled = false;
        btn.textContent = "Buy";
      }
    });
  });
}

/** Fills in the shared sidebar user-chip + role pill + logout button that every dashboard page has. */
function paintShell(profile) {
  document.querySelectorAll("[data-user-name]").forEach((el) => (el.textContent = profile.name));
  document.querySelectorAll("[data-user-avatar]").forEach((el) => (el.textContent = initials(profile.name)));
  document.querySelectorAll("[data-user-location]").forEach((el) => (el.textContent = profile.location));
  const vendorLink = document.getElementById("vendorAreaLink");
  const riderLink = document.getElementById("riderAreaLink");
  if (vendorLink) vendorLink.style.display = (profile.roles || []).includes("vendor") ? "flex" : "none";
  if (riderLink) riderLink.style.display = (profile.roles || []).includes("rider") ? "flex" : "none";
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", () => logout("../"));
  wireMobileNav();
}

export async function initUserDashboard() {
  const { user, profile } = await requireAuth("../");
  paintShell(profile);

  const q = query(collection(db, "deliveryRequests"), where("requesterId", "==", user.uid), orderBy("createdAt", "desc"), limit(5));
  const snap = await getDocs(q);
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  document.getElementById("statActive").textContent = rows.filter((r) => !["delivered", "cancelled"].includes(r.status)).length;
  document.getElementById("statDelivered").textContent = rows.filter((r) => r.status === "delivered").length;

  const list = document.getElementById("recentList");
  list.innerHTML = !rows.length
    ? `<div class="empty-state"><h3>No deliveries yet</h3><p>Request a rider or browse vendors to get started.</p></div>`
    : rows.map((r) => `
      <a href="delivery-details.html?id=${r.id}" class="card" style="display:block;margin-bottom:12px;text-decoration:none">
        <div class="flex-between">
          <strong>${r.itemDescription || "Delivery request"}</strong>
          ${statusBadge(r.status)}
        </div>
        <div class="muted" style="font-size:13px;margin-top:6px">${formatDate(r.createdAt)} · ${r.location}</div>
      </a>`).join("");

  loadNearbyProducts(user, profile);
}

export async function initMyDeliveries() {
  const { user, profile } = await requireAuth("../");
  paintShell(profile);
  const list = document.getElementById("deliveryList");
  listenMyRequests(user.uid, (rows) => {
    if (!rows.length) {
      list.innerHTML = `<div class="empty-state"><h3>Nothing here yet</h3><p>Your delivery requests will show up here.</p></div>`;
      return;
    }
    list.innerHTML = rows.map((r) => `
      <a href="delivery-details.html?id=${r.id}" class="card" style="display:block;margin-bottom:12px;text-decoration:none">
        <div class="flex-between">
          <strong>${r.itemDescription || "Delivery request"}</strong>
          ${statusBadge(r.status)}
        </div>
        <div class="muted" style="font-size:13px;margin-top:6px">${formatDate(r.createdAt)} · ${r.location} · ${r.type === "pickup" ? "Pickup" : r.type === "send" ? "Send package" : "Vendor order"}</div>
      </a>`).join("");
  });
}

export async function initDeliveryDetails() {
  const { profile } = await requireAuth("../");
  paintShell(profile);
  const id = new URLSearchParams(location.search).get("id");
  if (!id) { document.getElementById("detailsBox").innerHTML = "<p>No delivery specified.</p>"; return; }

  watchRequest(id, (r) => {
    if (!r) { document.getElementById("detailsBox").innerHTML = "<p>Delivery not found.</p>"; return; }
    document.getElementById("itemTitle").textContent = r.itemDescription || "Delivery request";
    document.getElementById("statusBadge").innerHTML = statusBadge(r.status);
    document.getElementById("routeFrom").textContent = r.pickupAddress || "—";
    document.getElementById("routeTo").textContent = r.dropoffAddress || "—";
    document.getElementById("trackingRail").innerHTML = renderTrackingRail(r);
    const riderBox = document.getElementById("riderBox");
    riderBox.innerHTML = r.riderName
      ? `<div class="card"><div class="muted" style="font-size:12px;text-transform:uppercase">Your rider</div><strong>${r.riderName}</strong><div class="muted">${r.riderPhone || ""}</div></div>`
      : `<div class="card muted">No rider has accepted this request yet.</div>`;
    const cancelBtn = document.getElementById("cancelBtn");
    if (cancelBtn) {
      cancelBtn.style.display = r.status === "pending" ? "inline-flex" : "none";
      cancelBtn.onclick = async () => {
        if (!confirm("Cancel this request?")) return;
        await cancelRequest(id);
        toast("Request cancelled.", "info");
      };
    }
  });
}

export async function initRequestRider(type) {
  // type: "pickup" (get something from somewhere) or "send" (send a package)
  const { user, profile } = await requireAuth("../");
  paintShell(profile);
  document.getElementById("locationNote").textContent = `Riders currently operate in ${profile.location}.`;

  const form = document.getElementById("requestForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Sending request…";
    try {
      const id = await createDeliveryRequest({
        requesterId: user.uid,
        requesterName: profile.name,
        requesterPhone: profile.phone,
        type,
        location: profile.location,
        pickupAddress: fd.get("pickupAddress"),
        dropoffAddress: fd.get("dropoffAddress"),
        recipientName: fd.get("recipientName") || null,
        recipientPhone: fd.get("recipientPhone") || null,
        itemDescription: fd.get("itemDescription"),
        notes: fd.get("notes") || "",
      });
      toast("Request sent to nearby riders!", "success");
      window.location.href = `delivery-details.html?id=${id}`;
    } catch (err) {
      toast("Couldn't send the request. Try again.", "error");
      btn.disabled = false;
      btn.textContent = "Request a rider";
    }
  });
}

export async function initProfile() {
  const { user, profile } = await requireAuth("../");
  paintShell(profile);
  const form = document.getElementById("profileForm");
  form.name.value = profile.name || "";
  form.phone.value = profile.phone || "";
  document.getElementById("emailDisplay").textContent = profile.email;
  document.getElementById("locationDisplay").textContent = profile.location;
  document.getElementById("rolesDisplay").textContent = (profile.roles || []).join(" · ");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await updateDoc(doc(db, "users", user.uid), { name: form.name.value.trim(), phone: form.phone.value.trim() });
    toast("Profile updated.", "success");
  });
}

export async function initNotifications() {
  const { user, profile } = await requireAuth("../");
  paintShell(profile);
  const list = document.getElementById("notifList");
  listenNotifications(user.uid, (rows) => {
    if (!rows.length) {
      list.innerHTML = `<div class="empty-state"><h3>You're all caught up</h3></div>`;
      return;
    }
    list.innerHTML = rows.map((n) => `
      <div class="card" style="margin-bottom:10px;${n.read ? "opacity:.6" : ""}">
        <div class="flex-between">
          <strong>${n.title}</strong>
          <span class="muted" style="font-size:12px">${formatDate(n.createdAt)}</span>
        </div>
        <p style="margin:6px 0 8px">${n.body}</p>
        <div style="display:flex;gap:10px">
          ${n.requestId ? `<a class="btn btn-outline btn-sm" href="delivery-details.html?id=${n.requestId}">View</a>` : ""}
          ${!n.read ? `<button class="btn btn-outline btn-sm" data-id="${n.id}">Mark read</button>` : ""}
        </div>
      </div>`).join("");
    list.querySelectorAll("button[data-id]").forEach((b) => b.addEventListener("click", () => markRead(b.dataset.id)));
  });
}
