export interface ScanProgress {
  files: number;
  dirs: number;
  bytes: number;
  skipped: number;
  currentDir: string;
  elapsedMs: number;
  root: string;
  topFiles: FileOut[];
  topFolders: FolderOut[];
}

export interface TypeStat {
  ext: string;
  count: number;
  bytes: number;
}

export interface FileOut {
  path: string;
  name: string;
  size: number;
  modifiedMs: number;
  createdMs: number;
}

export interface FolderOut {
  path: string;
  name: string;
  size: number;
}

export interface ScanSummary {
  cancelled: boolean;
  root: string;
  totalBytes: number;
  fileCount: number;
  dirCount: number;
  skippedCount: number;
  linkCount: number;
  cloudFileCount: number;
  hardlinkSkipped: number;
  elapsedMs: number;
  byType: TypeStat[];
  topFiles: FileOut[];
  topFolders: FolderOut[];
}

export interface DriveInfo {
  letter: string;
  root: string;
  driveType: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
}

/** Direct child of a folder from the last completed scan (treemap drill-in). */
export interface ChildOut {
  path: string;
  name: string;
  kind: "file" | "folder" | "link";
  size: number;
  isCloud: boolean | null;
}

export type ItemKind = "file" | "folder";

/** One row shared by the table and the chart. */
export interface HogItem {
  path: string;
  name: string;
  size: number;
  kind: ItemKind;
  /** 0 for folders (not tracked). */
  modifiedMs: number;
  createdMs: number;
}

export type Tab = "files" | "folders" | "both";
export type TopN = 10 | 25 | 50 | 100;
export type ChartType = "bar" | "donut";
