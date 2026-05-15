import { useState, useRef, type DragEvent, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";

export type AttachedFile = {
  id: string;
  name: string;
  type: "image" | "pdf" | "document";
  size: number;
  url?: string;
  preview?: string;
  file?: File;
};

interface AttachmentUploadProps {
  files: AttachedFile[];
  onFilesChange: (files: AttachedFile[]) => void;
  maxFiles?: number;
  maxSize?: number; // in MB
  accept?: string;
}

export function AttachmentUpload({
  files,
  onFilesChange,
  maxFiles = 10,
  maxSize = 50,
  accept = "image/*,application/pdf,.doc,.docx",
}: AttachmentUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const getFileType = (file: File): "image" | "pdf" | "document" => {
    if (file.type.startsWith("image/")) return "image";
    if (file.type === "application/pdf") return "pdf";
    return "document";
  };

  const getFileIcon = (type: "image" | "pdf" | "document") => {
    switch (type) {
      case "image":
        return "image";
      case "pdf":
        return "picture_as_pdf";
      case "document":
        return "description";
    }
  };

  const processFile = async (file: File) => {
    // Validate file size
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxSize) {
      toast.error("Arquivo muito grande", {
        description: `Máximo ${maxSize}MB. O arquivo tem ${sizeMB.toFixed(1)}MB.`,
      });
      return;
    }

    const id = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const type = getFileType(file);

    // Create preview for images
    let preview: string | undefined;
    if (type === "image") {
      preview = URL.createObjectURL(file);
    }

    // Simulate upload progress
    setUploading(id);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setUploading(null);

    const newFile: AttachedFile = {
      id,
      name: file.name,
      type,
      size: file.size,
      preview,
      file,
      url: URL.createObjectURL(file), // For local preview
    };

    onFilesChange([...files, newFile]);
    toast.success("Arquivo enviado", { description: file.name });
  };

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (files.length >= maxFiles) {
      toast.error("Limite de arquivos atingido", {
        description: `Máximo ${maxFiles} arquivos.`,
      });
      return;
    }

    const droppedFiles = Array.from(e.dataTransfer.files);
    for (const file of droppedFiles) {
      if (files.length < maxFiles) {
        await processFile(file);
      }
    }
  };

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      for (const file of selectedFiles) {
        if (files.length < maxFiles) {
          await processFile(file);
        }
      }
    }
  };

  const removeFile = (id: string) => {
    const file = files.find((f) => f.id === id);
    if (file?.preview) {
      URL.revokeObjectURL(file.preview);
    }
    if (file?.url) {
      URL.revokeObjectURL(file.url);
    }
    onFilesChange(files.filter((f) => f.id !== id));
  };

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-lg p-8 transition-industrial cursor-pointer ${
          dragActive
            ? "border-primary bg-primary/5 shadow-lg scale-105"
            : "border-border-low hover:border-primary/50 bg-surface-highest/50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={handleChange}
          accept={accept}
          className="hidden"
          aria-label="Upload files"
        />

        <div className="flex flex-col items-center justify-center py-4">
          <div
            className={`p-4 rounded-lg mb-4 transition-colors ${
              dragActive ? "bg-primary/20" : "bg-surface-low"
            }`}
          >
            <Icon
              name="cloud_upload"
              className={`text-4xl transition-colors ${
                dragActive ? "text-primary" : "text-primary/60"
              }`}
            />
          </div>
          <p className="text-center text-on-surface font-bold">
            {dragActive ? "Solte os arquivos aqui" : "Arraste arquivos aqui ou clique para selecionar"}
          </p>
          <p className="text-xs text-on-surface-variant text-center mt-2">
            Máximo {maxFiles} arquivos, até {maxSize}MB cada
          </p>
          <p className="text-[10px] text-on-surface-variant/60 text-center mt-2 uppercase tracking-widest font-semibold">
            Suporta: imagens, PDFs, documentos
          </p>
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-2 bg-surface-highest/50 rounded-lg p-4 border border-border-low">
          <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-3">
            Arquivos anexados ({files.length})
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {files.map((file) => (
              <div
                key={file.id}
                className="group relative border border-border-low rounded-lg p-3 bg-surface-low hover:bg-surface-high transition-colors overflow-hidden"
              >
                {/* Upload Progress */}
                {uploading === file.id && (
                  <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin mb-2" />
                      <span className="text-[10px] text-on-surface font-bold">Enviando...</span>
                    </div>
                  </div>
                )}

                {/* Image Preview */}
                {file.type === "image" && file.preview && (
                  <div className="mb-3 h-20 w-full bg-surface-lowest rounded overflow-hidden">
                    <img
                      src={file.preview}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* File Info */}
                <div className="flex items-start gap-2">
                  <div className="p-2 bg-surface-lowest rounded flex-shrink-0">
                    <Icon
                      name={getFileIcon(file.type)}
                      className="text-primary text-lg"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-on-surface truncate">
                      {file.name}
                    </p>
                    <p className="text-[10px] text-on-surface-variant">
                      {(file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <button
                    onClick={() => removeFile(file.id)}
                    type="button"
                    className="p-1 text-on-surface-variant hover:text-status-error hover:bg-status-error/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                    aria-label={`Remove ${file.name}`}
                  >
                    <Icon name="close" className="text-lg" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Space indicator */}
      {files.length > 0 && (
        <div className="flex items-center justify-between text-xs text-on-surface-variant">
          <span>
            {files.length} de {maxFiles} arquivos
          </span>
          <span>
            {(files.reduce((a, f) => a + f.size, 0) / 1024 / 1024).toFixed(1)}MB /{" "}
            {maxFiles * maxSize}MB
          </span>
        </div>
      )}
    </div>
  );
}
