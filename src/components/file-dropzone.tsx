import { useRef, useState, type DragEvent } from "react";
import { Upload, Loader2 } from "lucide-react";

// A plain ref-triggered <input type="file"> + a real drag-and-drop zone.
// Deliberately NOT using shadcn's <Button asChild><label>...</label></Button>
// pattern — that relies on Radix Slot merging props onto a <label>, which
// has been unreliable triggering the native file picker in some browsers.
// A directly-clicked hidden input via a ref is the most bulletproof way to
// open the OS file dialog. The drop zone also has real dragover/drop
// handlers with preventDefault — without those, dropping a file on the
// page falls through to the browser's default behavior of just opening/
// navigating to the file instead of handing it to the app.

export function FileDropzone({
  accept,
  onFile,
  isLoading,
  loadingLabel,
  idleLabel,
}: {
  accept: string;
  onFile: (file: File) => void;
  isLoading: boolean;
  loadingLabel: string;
  idleLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      onDragOver={(e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
      }}
      onDragLeave={(e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
      }}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        if (!isLoading) handleFiles(e.dataTransfer.files);
      }}
      onClick={() => {
        if (!isLoading) inputRef.current?.click();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (!isLoading && (e.key === "Enter" || e.key === " ")) inputRef.current?.click();
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${
        isDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
      } ${isLoading ? "pointer-events-none opacity-60" : ""}`}
    >
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <Upload className="h-5 w-5 text-muted-foreground" />
      )}
      <p className="text-sm font-medium">{isLoading ? loadingLabel : idleLabel}</p>
      <p className="text-xs text-muted-foreground">Click to browse, or drag and drop</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
