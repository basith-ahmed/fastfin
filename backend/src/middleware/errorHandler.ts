import type { ErrorRequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";

import { serverLogger } from "../utils/logger";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    serverLogger.warn(
      { method: req.method, path: req.path, statusCode: error.statusCode, code: error.code },
      `Request error [${error.code}]: ${error.message}`,
    );
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  if (error instanceof multer.MulterError) {
    const fileTooLarge = error.code === "LIMIT_FILE_SIZE";
    const code = fileTooLarge ? "PDF_TOO_LARGE" : "INVALID_UPLOAD";
    const message = fileTooLarge
      ? "The uploaded PDF exceeds the configured size limit."
      : "The upload request is invalid.";
    serverLogger.warn(
      { method: req.method, path: req.path, multerCode: error.code, code },
      `Upload error [${code}]: ${message}`,
    );
    res.status(fileTooLarge ? 413 : 400).json({
      error: {
        code,
        message,
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    serverLogger.warn(
      { method: req.method, path: req.path, issues: error.issues },
      "Request validation error: invalid request parameters",
    );
    res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: "The request parameters are invalid.",
      },
    });
    return;
  }

  serverLogger.error(
    {
      err: error,
      method: req.method,
      path: req.path,
    },
    "Unhandled request error (500)",
  );

  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
    },
  });
};
