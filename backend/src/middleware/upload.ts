import multer from "multer";

import { env } from "../config/env";
import { ensureStorageDirectories, pdfTempPath } from "../config/storage";

ensureStorageDirectories();

const upload = multer({
  dest: pdfTempPath,
  limits: {
    fileSize: Math.floor(env.MAX_UPLOAD_MB * 1024 * 1024),
    files: 1,
  },
});

export const uploadPdf = upload.single("file");
