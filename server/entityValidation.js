const GST_REGEX = /^[0-9]{2}[A-Z0-9]{13}$/;

function normalizeGst(value) {
  return String(value || "").trim().toUpperCase();
}

function validateEntityInput(name, gstNumber) {
  const cleanName = String(name || "").trim();
  const cleanGst = normalizeGst(gstNumber);
  if (!cleanName) return { error: "Entity name is required." };
  if (!cleanGst) return { error: "GST number is required." };
  if (!GST_REGEX.test(cleanGst)) {
    return { error: "GST number looks invalid. It should be 15 characters (e.g. 27AAAAA0000A1Z5)." };
  }
  return { cleanName, cleanGst };
}

module.exports = { GST_REGEX, normalizeGst, validateEntityInput };
