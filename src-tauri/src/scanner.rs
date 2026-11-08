//! DiskLens scanner: a parallel directory walk (jwalk) that produces a compact
//! in-memory tree, bounded top-N lists, progress callbacks, fast cancellation
//! and Windows-specific handling (junctions/symlinks, hard links, cloud files,
//! long paths, permission errors).
//!
//! The tree never stores a full path per entry: each node stores only its own
//! name slice in a shared string arena, and full paths are rebuilt on demand
//! (top-N output only), so the frontend never receives the full file list.

use std::cmp::{Ordering, Reverse};
use std::collections::{BinaryHeap, HashMap, HashSet};
use std::fs;
use std::io;
use std::os::windows::ffi::OsStrExt;
use std::os::windows::fs::MetadataExt as WinMetadataExt;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering as AtomicOrdering};
use std::time::{Duration, Instant, UNIX_EPOCH};

use jwalk::{DirEntry, WalkDirGeneric};
use serde::Serialize;

use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
use windows_sys::Win32::Storage::FileSystem::{
    BY_HANDLE_FILE_INFORMATION, CreateFileW, FILE_FLAG_BACKUP_SEMANTICS,
    FILE_FLAG_OPEN_REPARSE_POINT, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE,
    GetFileInformationByHandle, OPEN_EXISTING,
};

/// How many items the largest-files / largest-folders lists keep.
pub const TOP_N: usize = 100;
/// Progress events are throttled to this interval.
const PROGRESS_INTERVAL: Duration = Duration::from_millis(200);

const FILE_ATTRIBUTE_OFFLINE: u32 = 0x1000;
const FILE_ATTRIBUTE_RECALL_ON_OPEN: u32 = 0x40000;
const FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS: u32 = 0x400000;
/// OneDrive-style placeholders never need their content downloaded to be
/// detected; these attributes are readable from metadata only.
const CLOUD_ATTRS: u32 =
    FILE_ATTRIBUTE_OFFLINE | FILE_ATTRIBUTE_RECALL_ON_OPEN | FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS;

const NO_INDEX: u32 = u32::MAX;
const KIND_FILE: u8 = 0;
const KIND_DIR: u8 = 1;
const KIND_LINK: u8 = 2;
const FLAG_CLOUD: u8 = 1;

/// Progress snapshot emitted a few times per second while scanning.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub files: u64,
    pub dirs: u64,
    pub bytes: u64,
    pub skipped: u64,
    pub current_dir: String,
    pub elapsed_ms: u64,
    /// Canonical path being scanned (verbatim prefix stripped).
    pub root: String,
    /// Best-so-far top-N previews so the UI can update live while scanning.
    pub top_files: Vec<FileOut>,
    pub top_folders: Vec<FolderOut>,
}

/// One file extension bucket of the size-per-type summary.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeStat {
    pub ext: String,
    pub count: u64,
    pub bytes: u64,
}

/// A file in the top-N largest-files list.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileOut {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified_ms: i64,
    pub created_ms: i64,
}

/// A folder in the top-N largest-folders list (ranked by total subtree size).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderOut {
    pub path: String,
    pub name: String,
    pub size: u64,
}

/// Final result of a scan. Paths are only materialized for the bounded top-N
/// lists; nothing here grows with the full file count.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSummary {
    pub cancelled: bool,
    /// Canonical path that was scanned (verbatim prefix stripped).
    pub root: String,
    pub total_bytes: u64,
    pub file_count: u64,
    pub dir_count: u64,
    pub skipped_count: u64,
    pub link_count: u64,
    pub cloud_file_count: u64,
    pub hardlink_skipped: u64,
    pub elapsed_ms: u64,
    pub by_type: Vec<TypeStat>,
    pub top_files: Vec<FileOut>,
    pub top_folders: Vec<FolderOut>,
}

/// Per-entry data captured inside the parallel walkers (never stores paths).
#[derive(Debug, Default, Clone)]
struct EntryInfo {
    ok: bool,
    size: u64,
    attrs: u32,
    links: u32,
    vol: u32,
    idx: u64,
    modified_ms: i64,
    created_ms: i64,
}

/// Client state type for jwalk: (read-dir state, per-entry state).
type WalkClientState = ((), Option<EntryInfo>);

/// Compact tree node. The name lives in the shared arena; links are indices.
struct Node {
    name_off: u32,
    name_len: u32,
    kind: u8,
    /// Bit 0: cloud (OneDrive placeholder) file. Read by upcoming views.
    #[allow(dead_code)]
    flags: u8,
    first_child: u32,
    /// Child linked list, walked by upcoming views (treemap/detail).
    #[allow(dead_code)]
    next_sibling: u32,
    parent: u32,
    size: u64,
}

struct Tree {
    nodes: Vec<Node>,
    names: String,
}

impl Tree {
    fn new() -> Self {
        Tree {
            nodes: Vec::new(),
            names: String::new(),
        }
    }

    /// Appends a node as (prepended) child of `parent` and returns its index.
    fn add(&mut self, parent: u32, name: &str, kind: u8, flags: u8, size: u64) -> u32 {
        let idx = self.nodes.len() as u32;
        let name_off = self.names.len() as u32;
        self.names.push_str(name);
        let next_sibling = if parent == NO_INDEX {
            NO_INDEX
        } else {
            self.nodes[parent as usize].first_child
        };
        self.nodes.push(Node {
            name_off,
            name_len: name.len() as u32,
            kind,
            flags,
            first_child: NO_INDEX,
            next_sibling,
            parent,
            size,
        });
        if parent != NO_INDEX {
            self.nodes[parent as usize].first_child = idx;
        }
        idx
    }

    fn name(&self, idx: u32) -> &str {
        let n = &self.nodes[idx as usize];
        &self.names[n.name_off as usize..(n.name_off + n.name_len) as usize]
    }

    /// Rebuilds a full path by walking up the parent links. Only called for
    /// the bounded top-N output.
    fn path_of(&self, idx: u32) -> String {
        let mut parts: Vec<&str> = Vec::new();
        let mut i = idx;
        loop {
            parts.push(self.name(i));
            let parent = self.nodes[i as usize].parent;
            if parent == NO_INDEX {
                break;
            }
            i = parent;
        }
        parts.reverse();
        let mut out = String::new();
        for part in parts {
            if out.is_empty() {
                out.push_str(part);
            } else {
                if !out.ends_with('\\') {
                    out.push('\\');
                }
                out.push_str(part);
            }
        }
        strip_verbatim(&out)
    }
}

/// Keeps `TOP_N` largest files. Compared by size so the heap top is the
/// smallest kept item and can be replaced cheaply.
#[derive(PartialEq, Eq)]
struct TopFile {
    size: u64,
    idx: u32,
    modified_ms: i64,
    created_ms: i64,
}

impl Ord for TopFile {
    fn cmp(&self, other: &Self) -> Ordering {
        self.size.cmp(&other.size).then(self.idx.cmp(&other.idx))
    }
}

impl PartialOrd for TopFile {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

struct ScanCtx {
    tree: Tree,
    /// Ancestor stack while consuming the depth-first entry stream.
    stack: Vec<u32>,
    file_count: u64,
    dir_count: u64,
    bytes_counted: u64,
    skipped_count: u64,
    link_count: u64,
    cloud_file_count: u64,
    hardlink_skipped: u64,
    by_type: HashMap<String, (u64, u64)>,
    top_files: BinaryHeap<Reverse<TopFile>>,
    /// (volume serial, file index) of hard-linked files seen so far.
    hardlinks: HashSet<(u32, u64)>,
    cancelled: bool,
    last_emit: Instant,
    last_dir: std::sync::Arc<Path>,
    /// Canonical scan root, for display and payloads.
    root: String,
}

impl ScanCtx {
    fn new(start: Instant, root: String) -> Self {
        ScanCtx {
            tree: Tree::new(),
            stack: Vec::new(),
            file_count: 0,
            dir_count: 0,
            bytes_counted: 0,
            skipped_count: 0,
            link_count: 0,
            cloud_file_count: 0,
            hardlink_skipped: 0,
            by_type: HashMap::new(),
            top_files: BinaryHeap::new(),
            hardlinks: HashSet::new(),
            cancelled: false,
            last_emit: start,
            last_dir: std::sync::Arc::from(Path::new("")),
            root,
        }
    }

    fn progress(&self, start: Instant) -> ScanProgress {
        ScanProgress {
            files: self.file_count,
            dirs: self.dir_count,
            bytes: self.bytes_counted,
            skipped: self.skipped_count,
            current_dir: strip_verbatim(&self.last_dir.to_string_lossy()),
            elapsed_ms: start.elapsed().as_millis() as u64,
            root: self.root.clone(),
            top_files: self.file_preview(),
            top_folders: self.folder_preview(),
        }
    }

    /// Top-N largest files seen so far (used for live progress payloads).
    fn file_preview(&self) -> Vec<FileOut> {
        let mut items: Vec<&TopFile> = self.top_files.iter().map(|r| &r.0).collect();
        items.sort_by(|a, b| b.size.cmp(&a.size).then(a.idx.cmp(&b.idx)));
        items
            .into_iter()
            .map(|f| FileOut {
                path: self.tree.path_of(f.idx),
                name: self.tree.name(f.idx).to_string(),
                size: f.size,
                modified_ms: f.modified_ms,
                created_ms: f.created_ms,
            })
            .collect()
    }

    /// Top-N largest folders by current subtree totals.
    fn folder_preview(&self) -> Vec<FolderOut> {
        let mut heap: BinaryHeap<Reverse<(u64, u32)>> = BinaryHeap::new();
        for (i, node) in self.tree.nodes.iter().enumerate() {
            if node.kind == KIND_DIR {
                heap.push(Reverse((node.size, i as u32)));
                if heap.len() > TOP_N {
                    heap.pop();
                }
            }
        }
        heap.into_sorted_vec()
            .into_iter()
            .map(|Reverse((size, idx))| FolderOut {
                path: self.tree.path_of(idx),
                name: self.tree.name(idx).to_string(),
                size,
            })
            .collect()
    }

    /// Handles one yielded entry. Entries arrive in strict depth-first
    /// (pre-order) sequence, which the ancestor stack relies on.
    fn on_entry(&mut self, entry: &DirEntry<WalkClientState>) {
        let depth = entry.depth();
        while self.stack.len() > depth {
            self.stack.pop();
        }
        let parent = self.stack.last().copied().unwrap_or(NO_INDEX);
        let is_root = depth == 0;
        self.last_dir = entry.parent_path.clone();

        let file_type = entry.file_type();
        if file_type.is_symlink() {
            // Junctions and symlinks are never followed; they are counted and
            // shown but contribute 0 bytes so nothing is counted twice.
            self.link_count += 1;
            let name = entry_name(entry, is_root);
            self.tree.add(parent, &name, KIND_LINK, 0, 0);
        } else if file_type.is_dir() {
            // jwalk reports an unreadable directory (typically permission
            // denied) as a normal entry with the error attached to
            // `read_children`, so it must be counted here.
            if entry
                .read_children
                .as_ref()
                .and_then(|rc| rc.error())
                .is_some()
            {
                self.skipped_count += 1;
            }
            self.dir_count += 1;
            let name = entry_name(entry, is_root);
            let idx = self.tree.add(parent, &name, KIND_DIR, 0, 0);
            self.stack.push(idx);
        } else {
            let Some(info) = entry.client_state.as_ref() else {
                // Could not inspect the entry at all; report it as skipped.
                self.skipped_count += 1;
                return;
            };
            if !info.ok {
                self.skipped_count += 1;
                return;
            }
            if info.links > 1 && !self.hardlinks.insert((info.vol, info.idx)) {
                // Same underlying file seen before: count it once.
                self.hardlink_skipped += 1;
                return;
            }
            self.file_count += 1;
            self.bytes_counted += info.size;

            let name = entry_name(entry, is_root);
            let bucket = self.by_type.entry(ext_of(&name)).or_insert((0, 0));
            bucket.0 += 1;
            bucket.1 += info.size;

            let cloud = info.attrs & CLOUD_ATTRS != 0;
            if cloud {
                self.cloud_file_count += 1;
            }
            let idx = self.tree.add(
                parent,
                &name,
                KIND_FILE,
                if cloud { FLAG_CLOUD } else { 0 },
                info.size,
            );
            // Keep every ancestor folder's total current, so live previews
            // and the final summary both have up-to-date folder sizes.
            let mut ancestor = parent;
            while ancestor != NO_INDEX {
                let node = &mut self.tree.nodes[ancestor as usize];
                node.size += info.size;
                ancestor = node.parent;
            }
            self.top_files.push(Reverse(TopFile {
                size: info.size,
                idx,
                modified_ms: info.modified_ms,
                created_ms: info.created_ms,
            }));
            if self.top_files.len() > TOP_N {
                self.top_files.pop();
            }
        }
    }

    /// Builds the final summary. Folder totals were kept up to date
    /// incrementally while files were added.
    fn finish(self, elapsed_ms: u64) -> ScanSummary {
        let root = self.root.clone();
        let top_folders = self.folder_preview();

        let mut by_type: Vec<TypeStat> = self
            .by_type
            .into_iter()
            .map(|(ext, (count, bytes))| TypeStat { ext, count, bytes })
            .collect();
        by_type.sort_by(|a, b| b.bytes.cmp(&a.bytes).then(a.ext.cmp(&b.ext)));

        // `Reverse` wrapping makes into_sorted_vec yield largest-first.
        let files = self.top_files.into_sorted_vec();
        let top_files = files
            .into_iter()
            .map(|Reverse(f)| FileOut {
                path: self.tree.path_of(f.idx),
                name: self.tree.name(f.idx).to_string(),
                size: f.size,
                modified_ms: f.modified_ms,
                created_ms: f.created_ms,
            })
            .collect();

        ScanSummary {
            cancelled: self.cancelled,
            root,
            total_bytes: self.bytes_counted,
            file_count: self.file_count,
            dir_count: self.dir_count,
            skipped_count: self.skipped_count,
            link_count: self.link_count,
            cloud_file_count: self.cloud_file_count,
            hardlink_skipped: self.hardlink_skipped,
            elapsed_ms,
            by_type,
            top_files,
            top_folders,
        }
    }
}

/// Runs a full scan of `root`. `on_progress` is called at most every 200 ms
/// (on the calling thread) with a small snapshot; `cancel` stops the walk
/// within about a second. Returns partial results when cancelled.
pub fn scan<F>(root: &Path, cancel: &AtomicBool, on_progress: F) -> io::Result<ScanSummary>
where
    F: Fn(&ScanProgress),
{
    // Canonicalizing returns a verbatim (`\\?\`) path, which both follows a
    // junction/symlink *root* safely once and enables >260 char paths.
    let root = fs::canonicalize(root)?;
    if !root.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "path is not a folder",
        ));
    }

    let start = Instant::now();
    let mut ctx = ScanCtx::new(start, strip_verbatim(&root.to_string_lossy()));

    if cancel.load(AtomicOrdering::Relaxed) {
        ctx.cancelled = true;
        return Ok(ctx.finish(start.elapsed().as_millis() as u64));
    }

    let walk = WalkDirGeneric::<WalkClientState>::new(&root)
        .skip_hidden(false)
        .follow_links(false)
        .process_read_dir(process_children);

    for item in walk {
        if cancel.load(AtomicOrdering::Relaxed) {
            ctx.cancelled = true;
            break;
        }
        match item {
            Ok(entry) => ctx.on_entry(&entry),
            Err(_) => ctx.skipped_count += 1,
        }
        if ctx.last_emit.elapsed() >= PROGRESS_INTERVAL {
            ctx.last_emit = Instant::now();
            on_progress(&ctx.progress(start));
        }
    }

    let elapsed_ms = start.elapsed().as_millis() as u64;
    on_progress(&ctx.progress(start));
    Ok(ctx.finish(elapsed_ms))
}

/// Runs for every directory in parallel, before its children are read.
/// Junctions/symlinks are pinned so they are never descended into; plain
/// files are inspected once, here, so the serial consumer does no I/O.
fn process_children(
    _depth: Option<usize>,
    _path: &Path,
    _state: &mut (),
    children: &mut Vec<jwalk::Result<DirEntry<WalkClientState>>>,
) {
    for child in children.iter_mut() {
        let Ok(entry) = child else { continue };
        if entry.file_type().is_symlink() {
            entry.read_children = None;
        } else if !entry.file_type().is_dir() {
            entry.client_state = Some(probe_file(&entry.path()));
        }
    }
}

/// One metadata read per file via a handle that never reads content:
/// works for >260 char paths, does not hydrate OneDrive placeholders, and
/// yields the (volume serial, file index) pair used to count hard links once.
fn probe_file(path: &Path) -> EntryInfo {
    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        let handle = CreateFileW(
            wide.as_ptr(),
            0,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
            std::ptr::null_mut(),
        );
        if handle != INVALID_HANDLE_VALUE {
            let mut info: BY_HANDLE_FILE_INFORMATION = std::mem::zeroed();
            let ok = GetFileInformationByHandle(handle, &mut info) != 0;
            CloseHandle(handle);
            if ok {
                return EntryInfo {
                    ok: true,
                    size: ((info.nFileSizeHigh as u64) << 32) | info.nFileSizeLow as u64,
                    attrs: info.dwFileAttributes,
                    links: info.nNumberOfLinks,
                    vol: info.dwVolumeSerialNumber,
                    idx: ((info.nFileIndexHigh as u64) << 32) | info.nFileIndexLow as u64,
                    modified_ms: filetime_to_millis(
                        ((info.ftLastWriteTime.dwHighDateTime as u64) << 32)
                            | info.ftLastWriteTime.dwLowDateTime as u64,
                    ),
                    created_ms: filetime_to_millis(
                        ((info.ftCreationTime.dwHighDateTime as u64) << 32)
                            | info.ftCreationTime.dwLowDateTime as u64,
                    ),
                };
            }
        }
    }
    // Fallback: attributes-only query (no handle). Link info unavailable.
    match fs::symlink_metadata(path) {
        Ok(md) => EntryInfo {
            ok: true,
            size: md.len(),
            attrs: md.file_attributes(),
            links: 1,
            vol: 0,
            idx: 0,
            modified_ms: system_time_to_millis(md.modified().ok()),
            created_ms: system_time_to_millis(md.created().ok()),
        },
        Err(_) => EntryInfo::default(),
    }
}

fn entry_name(entry: &DirEntry<WalkClientState>, is_root: bool) -> String {
    if is_root {
        // Store the root's full (canonical) path as its name so rebuilt
        // child paths are complete.
        entry.path().to_string_lossy().into_owned()
    } else {
        entry.file_name().to_string_lossy().into_owned()
    }
}

/// Lower-cased extension, or "(none)". `.gitignore` counts as no extension.
fn ext_of(name: &str) -> String {
    match name.rfind('.') {
        Some(i) if i > 0 && i + 1 < name.len() => name[i + 1..].to_ascii_lowercase(),
        _ => "(none)".to_string(),
    }
}

/// FILETIME (100 ns since 1601) to Unix milliseconds.
fn filetime_to_millis(filetime: u64) -> i64 {
    if filetime == 0 {
        return 0;
    }
    (filetime / 10_000) as i64 - 11_644_473_600_000
}

fn system_time_to_millis(time: Option<std::time::SystemTime>) -> i64 {
    time.and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Removes the `\\?\` / `\\?\UNC\` prefix for display.
pub fn strip_verbatim(path: &str) -> String {
    if let Some(rest) = path.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else if let Some(rest) = path.strip_prefix(r"\\?\") {
        rest.to_string()
    } else {
        path.to_string()
    }
}
