const params = new URLSearchParams(window.location.search);
const entityId = params.get("id");

const reviewList = document.getElementById("reviewList");
const emptyState = document.getElementById("emptyState");
const reviewDialog = document.getElementById("reviewDialog");
const reviewForm = document.getElementById("reviewForm");
const reviewFormError = document.getElementById("reviewFormError");
const monthSelect = document.getElementById("monthSelect");
const fySelect = document.getElementById("fySelect");
const periodForm = document.getElementById("periodForm");
const periodFormError = document.getElementById("periodFormError");

let editingReviewId = null;

if (!entityId) {
  document.body.innerHTML = "<main><p>No entity specified. <a href='/index.html'>Go back</a>.</p></main>";
  throw new Error("Missing entity id");
}

function currentFYStart() {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() + 1 >= 4 ? y : y - 1; // FY runs April - March
}

function fyLabel(startYear) {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function populateFYOptions() {
  const start = currentFYStart();
  fySelect.innerHTML = "";
  // Most recent first: a few years back through one year ahead.
  for (let y = start + 1; y >= start - 6; y--) {
    const opt = document.createElement("option");
    opt.value = fyLabel(y);
    opt.textContent = `FY ${fyLabel(y)}`;
    fySelect.appendChild(opt);
  }
  fySelect.value = fyLabel(start);
}

function populateMonthOptions(fyMonths) {
  monthSelect.innerHTML = "";
  for (const m of fyMonths) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    monthSelect.appendChild(opt);
  }
  const now = new Date();
  const currentMonthName = now.toLocaleString(undefined, { month: "long" });
  if (fyMonths.includes(currentMonthName)) monthSelect.value = currentMonthName;
}

async function load() {
  const { entity, reviews, fyMonths } = await api.getReviews(entityId);
  document.getElementById("entityTitle").textContent = entity.name;
  document.getElementById("entityGst").textContent = entity.gstNumber;
  document.title = `${entity.name} — GST Review Checklist`;
  populateMonthOptions(fyMonths);
  populateFYOptions();
  renderReviews(reviews);
}

function renderReviews(reviews) {
  reviewList.innerHTML = "";
  emptyState.classList.toggle("hidden", reviews.length > 0);

  for (const r of reviews) {
    const periodBadge = r.month && r.financialYear
      ? `<span class="period-badge">${escapeHtml(r.month)} · FY ${escapeHtml(r.financialYear)}</span>`
      : "";
    const row = document.createElement("div");
    row.className = "card review-row";
    row.innerHTML = `
      <div class="title">${escapeHtml(r.title)}</div>
      ${periodBadge}
      <div class="progress-wrap">
        <div class="progress-bar"><div style="width:${r.percent}%"></div></div>
        <div class="progress-label">${r.percent}% complete (${r.filled}/${r.total})</div>
      </div>
      <div class="dates">Updated ${formatDate(r.updatedAt)}</div>
      <div class="actions" style="display:flex;gap:4px;">
        <button class="ghost" data-action="rename" title="Rename">Rename</button>
        <a class="ghost btn" style="background:transparent;color:var(--text-muted)" href="/api/reviews/${r.id}/export" title="Export to Excel">Export</a>
        <button class="ghost" data-action="delete" title="Delete">Delete</button>
      </div>
    `;
    row.addEventListener("click", (e) => {
      if (e.target.closest("[data-action]") || e.target.closest("a")) return;
      window.location.href = `/review.html?id=${r.id}`;
    });
    row.querySelector('[data-action="rename"]').addEventListener("click", (e) => {
      e.stopPropagation();
      openRenameDialog(r);
    });
    row.querySelector('[data-action="delete"]').addEventListener("click", (e) => {
      e.stopPropagation();
      deleteReview(r);
    });
    reviewList.appendChild(row);
  }
}

function openRenameDialog(review) {
  editingReviewId = review.id;
  document.getElementById("reviewTitle").value = review.title;
  reviewFormError.classList.add("hidden");
  reviewDialog.showModal();
  const input = document.getElementById("reviewTitle");
  input.focus();
  input.select();
}

document.getElementById("reviewCancelBtn").addEventListener("click", () => reviewDialog.close());

async function deleteReview(review) {
  if (!confirm(`Delete checklist "${review.title}"? This cannot be undone.`)) return;
  try {
    await api.deleteReview(review.id);
    await load();
  } catch (err) {
    alert(err.message);
  }
}

reviewForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("reviewTitle").value.trim();
  reviewFormError.classList.add("hidden");
  try {
    await api.renameReview(editingReviewId, title);
    reviewDialog.close();
    await load();
  } catch (err) {
    reviewFormError.textContent = err.message;
    reviewFormError.classList.remove("hidden");
  }
});

periodForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  periodFormError.classList.add("hidden");
  const openBtn = document.getElementById("openPeriodBtn");
  openBtn.disabled = true;
  try {
    const review = await api.openReviewPeriod(entityId, monthSelect.value, fySelect.value);
    window.location.href = `/review.html?id=${review.id}`;
  } catch (err) {
    periodFormError.textContent = err.message;
    periodFormError.classList.remove("hidden");
    openBtn.disabled = false;
  }
});

load().catch((err) => {
  reviewList.innerHTML = `<div class="empty-state" style="color:var(--danger)">Failed to load: ${escapeHtml(err.message)}</div>`;
});
