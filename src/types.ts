export interface ScanProgress {
  files: number;
  dirs: number;
  bytes: number;
  skipped: number;
  currentDir: string;
  elapsedMs: number;
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
}

export interface FolderOut {
  path: string;
  name: string;
  size: number;
}

export interface ScanSummary {
  cancelled: boolean;
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
