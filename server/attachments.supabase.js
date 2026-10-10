// Supabase Storage backed attachment storage, used automatically when
// Supabase is configured (see attachments.js and supabaseClient.js).
// Vercel functions have no persistent local disk, so uploaded files are
// buffered in memory by multer and then pushed to a Storage bucket.
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { getSupabaseClient } = require("./supabaseClient");

const BUCKET = process.env.SUPABASE_ATTACHMENTS_BUCKET || "attachments";

// Same allowlist as attachments.local.js - keep these in sync.
const ALLOWED_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp",
  ".pdf",
  ".doc", ".docx",
  ".xls", ".xlsx", ".csv",
  ".ppt", ".pptx",
  ".msg", ".eml",
  ".txt",
  ".zip",
]);

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

function extFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXT.has(ext)) return cb(null, true);
  cb(new Error(`Unsupported file type "${ext || "unknown"}". Allowed: images, PDF, Office documents, email files, text, zip.`));
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: extFilter,
});

// Nothing is uploaded to Supabase until finalizeUpload() runs (after our
// own itemId/field validation), so a request that fails validation before
// that point never touched Storage in the first place - unlike disk mode.
async function finalizeUpload(file) {
  const supabase = getSupabaseClient();
  const id = crypto.randomUUID();
  const { error } = await supabase.storage.from(BUCKET).upload(id, file.buffer, {
    contentType: file.mimetype || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(`Could not store the uploaded file: ${error.message}`);
  return { id };
}

// memoryStorage never touches disk, so there's nothing to undo for a
// request that fails validation before finalizeUpload() runs.
function discardUpload(_file) {}

function deleteAttachmentFile(attachmentId) {
  const supabase = getSupabaseClient();
  supabase.storage.from(BUCKET).remove([attachmentId]).then(({ error }) => {
    if (error) console.error("Failed to delete attachment from Supabase Storage:", error);
  });
}

function deleteAttachmentsForReview(review) {
  const ids = (review.attachments || []).map((a) => a.id);
  if (!ids.length) return;
  const supabase = getSupabaseClient();
  supabase.storage.from(BUCKET).remove(ids).then(({ error }) => {
    if (error) console.error("Failed to delete attachments from Supabase Storage:", error);
  });
}

async function serveAttachment(req, res, attachment) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(attachment.id, 60);
  if (error || !data) {
    return res.status(404).json({ error: "Attachment not found in storage." });
  }
  res.redirect(302, data.signedUrl);
}

module.exports = {
  upload,
  finalizeUpload,
  discardUpload,
  deleteAttachmentFile,
  deleteAttachmentsForReview,
  serveAttachment,
  MAX_FILE_SIZE,
};
