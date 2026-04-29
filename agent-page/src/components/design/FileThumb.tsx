/**
 * FileThumb — unified 26×30 file-type badge with a folded corner.
 *
 * Replaces ad-hoc emoji/icon usage in file lists. Color-coded by file
 * family (spreadsheets green, PDFs red, docs blue, etc.) per v3 design.
 *
 * Falls back to a neutral "FILE"/extension label for unknown types so
 * we never show a broken or empty thumbnail.
 */
import React from 'react';

type Palette = { fg: string; bg: string; label: string };

const PALETTE: Record<string, Palette> = {
  // Spreadsheets — green
  xlsx: { fg: '#0a7c43', bg: '#e6f5ec', label: 'XLS' },
  xls:  { fg: '#0a7c43', bg: '#e6f5ec', label: 'XLS' },
  csv:  { fg: '#0a7c43', bg: '#e6f5ec', label: 'CSV' },
  tsv:  { fg: '#0a7c43', bg: '#e6f5ec', label: 'TSV' },

  // PDF — red
  pdf:  { fg: '#b3261e', bg: '#fce8e6', label: 'PDF' },

  // Slide decks — orange
  pptx: { fg: '#c25a1f', bg: '#fdece0', label: 'PPT' },
  ppt:  { fg: '#c25a1f', bg: '#fdece0', label: 'PPT' },

  // Word / docs — blue
  doc:  { fg: '#1a56db', bg: '#e1ecfb', label: 'DOC' },
  docx: { fg: '#1a56db', bg: '#e1ecfb', label: 'DOC' },
  rtf:  { fg: '#1a56db', bg: '#e1ecfb', label: 'RTF' },

  // Structured / markup — purple
  json: { fg: '#5b21b6', bg: '#ede9fe', label: 'JSON' },
  yaml: { fg: '#5b21b6', bg: '#ede9fe', label: 'YAML' },
  yml:  { fg: '#5b21b6', bg: '#ede9fe', label: 'YAML' },
  xml:  { fg: '#5b21b6', bg: '#ede9fe', label: 'XML' },
  md:   { fg: '#5b21b6', bg: '#ede9fe', label: 'MD' },

  // Plain text — slate
  txt:  { fg: '#475569', bg: '#eef2f6', label: 'TXT' },
  log:  { fg: '#475569', bg: '#eef2f6', label: 'LOG' },

  // Images — fuchsia
  png:  { fg: '#8a4cb1', bg: '#f3e8fa', label: 'PNG' },
  jpg:  { fg: '#8a4cb1', bg: '#f3e8fa', label: 'JPG' },
  jpeg: { fg: '#8a4cb1', bg: '#f3e8fa', label: 'JPG' },
  gif:  { fg: '#8a4cb1', bg: '#f3e8fa', label: 'GIF' },
  webp: { fg: '#8a4cb1', bg: '#f3e8fa', label: 'WEB' },
  svg:  { fg: '#8a4cb1', bg: '#f3e8fa', label: 'SVG' },
  bmp:  { fg: '#8a4cb1', bg: '#f3e8fa', label: 'BMP' },

  // Code — teal
  py:   { fg: '#0d6e6e', bg: '#dff5f3', label: 'PY' },
  ts:   { fg: '#0d6e6e', bg: '#dff5f3', label: 'TS' },
  tsx:  { fg: '#0d6e6e', bg: '#dff5f3', label: 'TSX' },
  js:   { fg: '#0d6e6e', bg: '#dff5f3', label: 'JS' },
  jsx:  { fg: '#0d6e6e', bg: '#dff5f3', label: 'JSX' },
  go:   { fg: '#0d6e6e', bg: '#dff5f3', label: 'GO' },

  // Archives — amber
  zip:  { fg: '#92400e', bg: '#fef0c7', label: 'ZIP' },
  tar:  { fg: '#92400e', bg: '#fef0c7', label: 'TAR' },
  gz:   { fg: '#92400e', bg: '#fef0c7', label: 'GZ' },

  // Audio / video — rose
  mp3:  { fg: '#9d1747', bg: '#fde2ec', label: 'MP3' },
  wav:  { fg: '#9d1747', bg: '#fde2ec', label: 'WAV' },
  mp4:  { fg: '#9d1747', bg: '#fde2ec', label: 'MP4' },
  mov:  { fg: '#9d1747', bg: '#fde2ec', label: 'MOV' },
  webm: { fg: '#9d1747', bg: '#fde2ec', label: 'WEB' },
};

interface FileThumbProps {
  /** A filename, an extension, or a MIME-style hint. */
  type?: string;
  size?: 'sm' | 'md';
  className?: string;
}

const SIZES = {
  sm: { w: 22, h: 26, fold: 6, fs: 7.5 },
  md: { w: 26, h: 30, fold: 7, fs: 8 },
};

function extOf(input?: string): string {
  if (!input) return '';
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return '';
  // Strip a leading dot, strip everything before the last dot if it looks
  // like a filename, and lowercase.
  if (trimmed.startsWith('.')) return trimmed.slice(1);
  const dot = trimmed.lastIndexOf('.');
  return dot >= 0 ? trimmed.slice(dot + 1) : trimmed;
}

export const FileThumb: React.FC<FileThumbProps> = ({
  type,
  size = 'md',
  className,
}) => {
  const ext = extOf(type);
  const palette =
    PALETTE[ext] || {
      fg: 'hsl(var(--muted-foreground))',
      bg: 'hsl(var(--muted))',
      label: (ext || 'file').slice(0, 4).toUpperCase(),
    };
  const dim = SIZES[size];

  return (
    <div
      className={className}
      style={{
        width: dim.w,
        height: dim.h,
        position: 'relative',
        flexShrink: 0,
        background: palette.bg,
        borderRadius: 3,
        // Folded top-right corner via clip-path.
        clipPath: `polygon(0 0, calc(100% - ${dim.fold}px) 0, 100% ${dim.fold}px, 100% 100%, 0 100%)`,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingBottom: 3,
      }}
      aria-label={`${palette.label} file`}
    >
      {/* Fold shadow — subtle dark triangle to read as a folded corner. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: dim.fold,
          height: dim.fold,
          background: 'rgba(0,0,0,0.08)',
          clipPath: 'polygon(0 0, 100% 100%, 0 100%)',
        }}
      />
      <span
        className="font-mono"
        style={{
          fontSize: dim.fs,
          fontWeight: 700,
          letterSpacing: '0.04em',
          color: palette.fg,
          lineHeight: 1,
        }}
      >
        {palette.label}
      </span>
    </div>
  );
};
