import { Router } from "express";

import {
  createDocument,
  getDocumentById,
  getDocuments,
  getDocumentStatusById,
  removeDocument,
  reprocessDocumentById,
  streamDocumentFile,
} from "../controllers/documents";
import { uploadPdf } from "../middleware/upload";

export const documentsRouter = Router();

documentsRouter.post("/", uploadPdf, createDocument);
documentsRouter.get("/", getDocuments);
documentsRouter.get("/:id/status", getDocumentStatusById);
documentsRouter.get("/:id/file", streamDocumentFile);
documentsRouter.post("/:id/reprocess", reprocessDocumentById);
documentsRouter.delete("/:id", removeDocument);
documentsRouter.get("/:id", getDocumentById);
