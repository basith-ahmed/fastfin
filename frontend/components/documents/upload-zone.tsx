"use client";

import { FileUp, LoaderCircle, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useUploadDocument } from "@/hooks/use-upload-document";
import { cn } from "@/lib/utils";

const maxBytes = 50 * 1024 * 1024;

function validatePdf(file: File): string | null {
  if (!file.name.toLocaleLowerCase("en").endsWith(".pdf")) return "Choose a file with a .pdf extension.";
  if (file.type && file.type !== "application/pdf") return "The selected file is not a PDF.";
  if (file.size > maxBytes) return "The PDF must be 50 MB or smaller.";
  if (file.size === 0) return "The selected PDF is empty.";
  return null;
}

export function UploadZone({ compact = false }: { compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const mutation = useUploadDocument();

  function upload(file: File) {
    mutation.mutate(file, {
      onSuccess: ({ data, duplicate }) => {
        toast.success(duplicate ? "This PDF was already uploaded." : "PDF uploaded and queued.");
        router.push(`/documents/${data.id}`);
      },
    });
  }

  function choose(file: File | undefined) {
    if (!file) return;
    const error = validatePdf(file);
    setValidationError(error);
    if (!error) upload(file);
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length > 1) {
      setValidationError("Upload one PDF at a time.");
      return;
    }
    choose(event.dataTransfer.files[0]);
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={(event) => choose(event.target.files?.[0])}
      />
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        className={cn(
          "flex cursor-pointer items-center rounded-xl border border-dashed transition-colors",
          compact ? "gap-4 p-5" : "min-h-52 flex-col justify-center px-6 py-10 text-center",
          dragging ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50 hover:bg-slate-100",
        )}
      >
        <span className={cn("rounded-xl bg-white p-3 text-slate-700 shadow-sm", !compact && "mb-4")}>
          {mutation.isPending ? <LoaderCircle className="size-6 animate-spin" /> : <UploadCloud className="size-6" />}
        </span>
        <div className={cn(compact && "flex-1")}>
          <p className="font-medium">{mutation.isPending ? "Uploading PDF…" : "Drop a PDF here"}</p>
          <p className="mt-1 text-sm text-muted-foreground">or click to browse · one file · up to 50 MB</p>
        </div>
        {compact ? (
          <Button
            size="sm"
            disabled={mutation.isPending}
            onClick={(event) => {
              event.stopPropagation();
              inputRef.current?.click();
            }}
          >
            <FileUp /> Select PDF
          </Button>
        ) : null}
      </div>
      {validationError ? <p className="text-sm text-red-600">{validationError}</p> : null}
      {mutation.error ? <p className="text-sm text-red-600">{mutation.error.message}</p> : null}
    </div>
  );
}
