// ============================================================
// HOT EXPRESS — Registration & login
// Every account is a buyer by default. At sign-up a person can
// additionally switch on ONE extra role: Vendor or Rider.
// (Buyer+Vendor and Buyer+Rider — not both at once, matching
// how the two dashboards and permissions are kept separate.)
// ============================================================
import { auth, db, SERVICE_LOCATIONS } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  doc, setDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { toast } from "./utils.js";

function showError(form, message) {
  const box = form.querySelector(".auth-error");
  box.textContent = message;
  box.style.display = "block";
}

function friendlyAuthError(err) {
  const code = err.code || "";
  if (code.includes("email-already-in-use")) return "That email is already registered — try logging in instead.";
  if (code.includes("weak-password")) return "Choose a password with at least 6 characters.";
  if (code.includes("invalid-email")) return "That email address doesn't look right.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Email or password is incorrect.";
  return "Something went wrong. Please try again.";
}

const registerForm = document.getElementById("registerForm");
if (registerForm) {
  // Populate the location select from the single source of truth.
  const locSelect = registerForm.querySelector("#location");
  if (locSelect) {
    SERVICE_LOCATIONS.forEach((loc) => {
      const opt = document.createElement("option");
      opt.value = loc;
      opt.textContent = loc;
      locSelect.appendChild(opt);
    });
  }

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(registerForm);
    const name = fd.get("name").trim();
    const phone = fd.get("phone").trim();
    const email = fd.get("email").trim();
    const password = fd.get("password");
    const location = fd.get("location");
    const extraRole = fd.get("extraRole"); // "none" | "vendor" | "rider"

    const submitBtn = registerForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating account…";

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const roles = ["buyer"];
      if (extraRole === "vendor") roles.push("vendor");
      if (extraRole === "rider") roles.push("rider");

      const profile = {
        name, phone, email, location,
        roles,
        isAdmin: false,
        createdAt: serverTimestamp(),
      };
      if (extraRole === "vendor") {
        profile.vendorInfo = { businessName: name, verified: false };
      }
      if (extraRole === "rider") {
        profile.riderInfo = { vehicleType: fd.get("vehicleType") || "bike", available: false, completedJobs: 0, rating: null };
      }

      await setDoc(doc(db, "users", cred.user.uid), profile);
      toast("Account created — welcome to Hot Express!", "success");
      window.location.href = "user/dashboard.html";
    } catch (err) {
      showError(registerForm, friendlyAuthError(err));
      submitBtn.disabled = false;
      submitBtn.textContent = "Create account";
    }
  });

  // Show/hide the vehicle type field only when "rider" is chosen.
  registerForm.querySelectorAll('input[name="extraRole"]').forEach((r) => {
    r.addEventListener("change", () => {
      const vf = registerForm.querySelector("#vehicleField");
      if (vf) vf.style.display = r.value === "rider" && r.checked ? "block" : "none";
    });
  });
}

const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(loginForm);
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in…";
    try {
      await signInWithEmailAndPassword(auth, fd.get("email").trim(), fd.get("password"));
      window.location.href = "user/dashboard.html";
    } catch (err) {
      showError(loginForm, friendlyAuthError(err));
      submitBtn.disabled = false;
      submitBtn.textContent = "Log in";
    }
  });
}
