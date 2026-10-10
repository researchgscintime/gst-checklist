const { itemCountForMonth } = require("./checklistTemplate");

const ANSWER_FIELDS = ["reviewer", "director", "client"];

// Calendar month names, independent of server locale, so they always match
// the month tags used in the checklist template (see checklistTemplate.js).
const CALENDAR_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function completionStats(review) {
  const total = itemCountForMonth(review.month) * ANSWER_FIELDS.length;
  let filled = 0;
  for (const itemId of Object.keys(review.answers || {})) {
    for (const field of ANSWER_FIELDS) {
      if ((review.answers[itemId][field] || "").trim()) filled += 1;
    }
  }
  return { filled, total, percent: total ? Math.round((filled / total) * 100) : 0 };
}

// The current Month + Financial Year, used to find "this month's" checklist
// for an entity on the dashboard.
function currentPeriod() {
  const now = new Date();
  const month = CALENDAR_MONTHS[now.getMonth()];
  const y = now.getFullYear();
  const financialYearStart = now.getMonth() + 1 >= 4 ? y : y - 1; // FY runs April - March
  const financialYear = `${financialYearStart}-${String((financialYearStart + 1) % 100).padStart(2, "0")}`;
  return { month, financialYear };
}

module.exports = { completionStats, ANSWER_FIELDS, currentPeriod };
