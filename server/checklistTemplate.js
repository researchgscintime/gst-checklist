const fs = require("fs");
const path = require("path");

const template = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "checklistTemplate.json"), "utf-8")
);

// Flat lookup of all valid itemIds, used to validate incoming answer writes.
const allItemIds = new Set();
for (const area of template.areas) {
  for (const item of area.items) {
    allItemIds.add(item.itemId);
  }
}

function isValidItemId(itemId) {
  return allItemIds.has(itemId);
}

function totalItemCount() {
  return allItemIds.size;
}

// Financial-year month order (April to March), used for the month picker
// and for filtering which areas apply to a given month.
const FY_MONTHS = [
  "April", "May", "June", "July", "August", "September",
  "October", "November", "December", "January", "February", "March",
];
const FY_MONTHS_SET = new Set(FY_MONTHS);
const EVERY_MONTH = "Every Month";

function isValidMonth(month) {
  return FY_MONTHS_SET.has(month);
}

// An area's `month` is usually a single FY month, but some areas apply to
// more than one (e.g. "March / September") - stored as a "/"-separated list.
function monthsForArea(area) {
  return area.month.split("/").map((m) => m.trim());
}

// Areas apply to a review's month if they're tagged for that specific
// month (single- or multi-month), or tagged "Every Month" (always included
// regardless of period). A review with no month (legacy / free-form
// checklists created before month filtering existed) shows every area,
// unfiltered.
function areasForMonth(month) {
  if (!month) return template.areas;
  return template.areas.filter((a) => a.month === EVERY_MONTH || monthsForArea(a).includes(month));
}

function itemCountForMonth(month) {
  return areasForMonth(month).reduce((sum, a) => sum + a.items.length, 0);
}

module.exports = {
  template,
  isValidItemId,
  totalItemCount,
  FY_MONTHS,
  isValidMonth,
  areasForMonth,
  itemCountForMonth,
};
