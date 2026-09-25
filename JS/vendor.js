// ============================================================
// HOT EXPRESS — /vendor pages
// ============================================================
import { db } from "./firebase.js";
import { requireRole, toast, formatDate, statusBadge, wireMobileNav, initials, logout } from "./utils.js";
import {
  collection, addDoc, query, where, getDocs, orderBy, doc, updateDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { createDeliveryRequest, watchRequest } from "./deliveries.js";
import { renderTrackingRail } from "./tracking.js";
import { listenNotifications, markRead } from "./notifications.js";

function paintShell(profile) {
  document.querySelectorAll("[data-user-name]").forEach((el) => (el.textContent = profile.name));
  document.querySelectorAll("[data-user-avatar]").forEach((el) => (el.textContent = initials(profile.name)));
  document.querySelectorAll("[data-user-location]").forEach((el) => (el.textContent = profile.location));
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", () => logout("../"));
  wireMobileNav();
}

export async function initVendorDashboard() {
  const { user, profile } = await requireRole("vendor", "../");
  paintShell(profile);

  const q = query(collection(db, "products"), where("vendorId", "==", user.uid), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  const products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  document.getElementById("statListed").textContent = products.filter((p) => p.status === "available").length;
  document.getElementById("statSold").textContent = products.filter((p) => p.status === "sold").length;

  const grid = document.getElementById("productGrid");
  function draw() {
    grid.innerHTML = !products.length
      ? `<div class="empty-state" style="grid-column:1/-1"><h3>Nothing posted yet</h3><p>Post your first item to start selling.</p></div>`
      : products.map((p) => `
        <div class="product-card">
          <div class="thumb">📦</div>
          <div class="body">
            <strong>${p.title}</strong>
            <p style="font-size:13px;margin:4px 0">${p.description || ""}</p>
            <div class="flex-between">
              <span class="price">₦${Number(p.price).toLocaleString()}</span>
              <span class="badge ${p.status === "available" ? "badge-accepted" : "badge-delivered"}">${p.status}</span>
            </div>
          </div>
        </div>`).join("");
  }
  draw();

  // Post-new-item modal
  const modal = document.getElementById("newProductModal");
  document.getElementById("openNewProduct").addEventListener("click", () => modal.classList.add("open"));
  document.getElementById("closeNewProduct").addEventListener("click", () => modal.classList.remove("open"));

  document.getElementById("newProductForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "Posting…";
    try {
      const docRef = await addDoc(collection(db, "products"), {
        vendorId: user.uid,
        vendorName: profile.vendorInfo?.businessName || profile.name,
        title: fd.get("title"),
        description: fd.get("description"),
        price: Number(fd.get("price")),
        location: profile.location,
        status: "available",
        createdAt: serverTimestamp(),
      });
      products.unshift({ id: docRef.id, title: fd.get("title"), description: fd.get("description"), price: Number(fd.get("price")), status: "available" });
      draw();
      document.getElementById("statListed").textContent = products.filter((p) => p.status === "available").length;
      modal.classList.remove("open");
      e.target.reset();
      toast("Item posted!", "success");
    } catch {
      toast("Couldn't post the item.", "error");
    }
    btn.disabled = false; btn.textContent = "Post item";
  });
}

export async function initVendorDeliveries() {
  const { user, profile } = await requireRole("vendor", "../");
  paintShell(profile);
  const list = document.getElementById("deliveryList");
  // Vendor fulfilments are keyed by vendorId (not requesterId, which belongs to the buyer).
  const q = query(collection(db, "deliveryRequests"), where("vendorId", "==", user.uid), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  list.innerHTML = !rows.length
    ? `<div class="empty-state"><h3>No fulfilments yet</h3><p>Orders placed against your products will show up here.</p></div>`
    : rows.map((r) => `
      <a href="delivery-details.html?id=${r.id}" class="card" style="display:block;margin-bottom:12px;text-decoration:none">
        <div class="flex-between"><strong>${r.itemDescription}</strong>${statusBadge(r.status)}</div>
        <div class="muted" style="font-size:13px;margin-top:6px">${formatDate(r.createdAt)} → ${r.dropoffAddress}</div>
      </a>`).join("");
}

export async function initVendorCreateDelivery() {
  // A vendor manually requesting a rider for an order (e.g. an offline sale).
  const { user, profile } = await requireRole("vendor", "../");
  paintShell(profile);
  const form = document.getElementById("requestForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "Sending request…";
    try {
      const id = await createDeliveryRequest({
        requesterId: user.uid,
        requesterName: profile.vendorInfo?.businessName || profile.name,
        requesterPhone: profile.phone,
        type: "vendor_order",
        location: profile.location,
        vendorId: user.uid,
        pickupAddress: fd.get("pickupAddress"),
        dropoffAddress: fd.get("dropoffAddress"),
        recipientName: fd.get("recipientName"),
        recipientPhone: fd.get("recipientPhone"),
        itemDescription: fd.get("itemDescription"),
        notes: fd.get("notes") || "",
      });
      toast("Request sent to nearby riders!", "success");
      window.location.href = `delivery-details.html?id=${id}`;
    } catch {
      toast("Couldn't send the request.", "error");
      btn.disabled = false; btn.textContent = "Request a rider";
    }
  });
}

export async function initVendorDeliveryDetails() {
  const { profile } = await requireRole("vendor", "../");
  paintShell(profile);
  const id = new URLSearchParams(location.search).get("id");
  watchRequest(id, (r) => {
    if (!r) return;
    document.getElementById("itemTitle").textContent = r.itemDescription;
    document.getElementById("statusBadge").innerHTML = statusBadge(r.status);
    document.getElementById("routeFrom").textContent = r.pickupAddress || "—";
    document.getElementById("routeTo").textContent = r.dropoffAddress || "—";
    document.getElementById("trackingRail").innerHTML = renderTrackingRail(r);
    document.getElementById("riderBox").innerHTML = r.riderName
      ? `<div class="card"><div class="muted" style="font-size:12px;text-transform:uppercase">Rider</div><strong>${r.riderName}</strong><div class="muted">${r.riderPhone || ""}</div></div>`
      : `<div class="card muted">No rider has accepted this yet.</div>`;
  });
}

export async function initVendorNotifications() {
  const { user, profile } = await requireRole("vendor", "../");
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
            ${n.requestId ? `<a class="btn btn-outline btn-sm" href="delivery-details.html?id=${n.requestId}">View</a>` : ""}
            ${!n.read ? `<button class="btn btn-outline btn-sm" data-id="${n.id}">Mark read</button>` : ""}
          </div>
        </div>`).join("");
    list.querySelectorAll("button[data-id]").forEach((b) => b.addEventListener("click", () => markRead(b.dataset.id)));
  });
}

export async function initVendorProfile() {
  const { user, profile } = await requireRole("vendor", "../");
  paintShell(profile);
  const form = document.getElementById("profileForm");
  form.businessName.value = profile.vendorInfo?.businessName || "";
  form.phone.value = profile.phone || "";
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await updateDoc(doc(db, "users", user.uid), {
      phone: form.phone.value.trim(),
      "vendorInfo.businessName": form.businessName.value.trim(),
    });
    toast("Vendor profile updated.", "success");
  });
}
