// Local-disk backed attachment storage (see attachments.js for backend
// selection, and attachments.supabase.js for the Supabase Storage variant).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const ATTACH_DIR = path.join(__dirname, "data", "attachments");
fs.mkdirSync(ATTACH_DIR, { recursive: true });

// Extension allowlist matches the kinds of evidence this checklist asks
// for throughout (screenshots, notifications, invoices, emails, workings).
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
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, ATTACH_DIR),
    filename: (req, file, cb) => cb(null, crypto.randomUUID()),
  }),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: extFilter,
});

function attachmentFilePath(attachmentId) {
  return path.join(ATTACH_DIR, attachmentId);
}

// multer's diskStorage already wrote the file during upload parsing, so
// there's nothing left to do - the filename it chose *is* the attachment id.
async function finalizeUpload(file) {
  return { id: file.filename };
}

// Undo a diskStorage write for an upload that failed validation after
// multer already wrote it to disk (e.g. bad itemId/field in the request).
function discardUpload(file) {
  if (file) deleteAttachmentFile(file.filename);
}

function deleteAttachmentFile(attachmentId) {
  fs.unlink(attachmentFilePath(attachmentId), (err) => {
    if (err && err.code !== "ENOENT") console.error("Failed to delete attachment file:", err);
  });
}

function deleteAttachmentsForReview(review) {
  for (const a of review.attachments || []) {
    deleteAttachmentFile(a.id);
  }
}

async function serveAttachment(req, res, attachment) {
  const filePath = attachmentFilePath(attachment.id);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Attachment file is missing on disk." });
  }
  const previewable = /^image\//.test(attachment.mimetype) || attachment.mimetype === "application/pdf";
  res.setHeader("Content-Type", attachment.mimetype || "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `${previewable ? "inline" : "attachment"}; filename="${attachment.originalName.replace(/[^\x20-\x7E]/g, "_")}"`
  );
  res.sendFile(filePath);
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
