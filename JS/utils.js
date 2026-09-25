// ============================================================
// HOT EXPRESS — Shared utilities
// ============================================================
import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

/** Show a small toast in the bottom-right corner. type: "info" | "success" | "error" */
export function toast(message, type = "info") {
  let region = document.querySelector(".toast-region");
  if (!region) {
    region = document.createElement("div");
    region.className = "toast-region";
    document.body.appendChild(region);
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  region.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/** Format a Firestore Timestamp (or Date) into a readable string. */
export function formatDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Guard a page: redirect to /login.html if nobody is signed in.
 *  Resolves with { user, profile } once ready. depth = "" for root pages,
 *  "../" for pages inside /user, /vendor, /rider, /admin. */
export function requireAuth(depth = "../") {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = `${depth}login.html`;
        return;
      }
      const snap = await getDoc(doc(db, "users", user.uid));
      if (!snap.exists()) {
        window.location.href = `${depth}login.html`;
        return;
      }
      resolve({ user, profile: snap.data() });
    });
  });
}

/** Guard a page to a specific role ("vendor" | "rider" | "admin").
 *  Buyer access is implicit for every account. */
export async function requireRole(role, depth = "../") {
  const { user, profile } = await requireAuth(depth);
  const roles = profile.roles || [];
  if (role === "admin" && profile.isAdmin !== true) {
    toast("You don't have access to that area.", "error");
    window.location.href = `${depth}user/dashboard.html`;
    throw new Error("not-admin");
  }
  if (role !== "admin" && !roles.includes(role)) {
    toast(`Your account isn't registered as a ${role}.`, "error");
    window.location.href = `${depth}user/dashboard.html`;
    throw new Error("wrong-role");
  }
  return { user, profile };
}

export async function logout(depth = "") {
  await signOut(auth);
  window.location.href = `${depth}login.html`;
}

export function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join("") || "H";
}

/** Wires up the hamburger button (id="menuToggle") to open/close the sidebar on mobile. */
export function wireMobileNav() {
  const btn = document.getElementById("menuToggle");
  const sidebar = document.querySelector(".sidebar");
  if (btn && sidebar) {
    btn.addEventListener("click", () => sidebar.classList.toggle("open"));
  }
}

export function statusBadge(status) {
  const map = {
    pending: ["badge-pending", "Pending"],
    accepted: ["badge-accepted", "Rider assigned"],
    picked_up: ["badge-transit", "Picked up"],
    in_transit: ["badge-transit", "In transit"],
    delivered: ["badge-delivered", "Delivered"],
    cancelled: ["badge-cancelled", "Cancelled"],
  };
  const [cls, label] = map[status] || ["badge-pending", status];
  return `<span class="badge ${cls}">${label}</span>`;
}
