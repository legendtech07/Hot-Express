// ============================================================
// HOT EXPRESS — Tracking rail renderer
// Turns a delivery's status into the dashed "route" progress
// list used on every delivery-details.html page.
// ============================================================
const STEPS = [
  { key: "pending", label: "Request sent", note: "Waiting for a rider nearby to accept." },
  { key: "accepted", label: "Rider assigned", note: "" },
  { key: "picked_up", label: "Item picked up", note: "" },
  { key: "in_transit", label: "On the way", note: "" },
  { key: "delivered", label: "Delivered", note: "" },
];

export function renderTrackingRail(request) {
  if (request.status === "cancelled") {
    return `<div class="route-rail"><div class="route-stop is-active"><strong>Cancelled</strong>
      <div class="muted">This request was cancelled.</div></div></div>`;
  }
  const currentIndex = STEPS.findIndex((s) => s.key === request.status);
  return `<div class="route-rail">${STEPS.map((step, i) => {
    let cls = "";
    if (i < currentIndex) cls = "is-done";
    if (i === currentIndex) cls = "is-active";
    const note = i === 1 && request.riderName ? `${request.riderName} · ${request.riderPhone || ""}` : step.note;
    return `<div class="route-stop ${cls}">
      <strong>${step.label}</strong>
      ${note ? `<div class="muted" style="font-size:13px">${note}</div>` : ""}
    </div>`;
  }).join("")}</div>`;
}
