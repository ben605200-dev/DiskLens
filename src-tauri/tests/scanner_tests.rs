//! Integration tests for the DiskLens scanner. All fixtures live in unique
//! folders under the system temp directory and are removed on drop.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command as StdCommand;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use disklens_lib::commands::mask_path;
use disklens_lib::drives::list_drives;
use disklens_lib::scanner::{LastScan, ScanProgress, ScanSummary, scan};

static COUNTER: AtomicU64 = AtomicU64::new(0);

struct TestDir {
    path: PathBuf,
}

impl TestDir {
    fn new(tag: &str) -> Self {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!(
            "disklens-test-{}-{}-{}",
            tag,
            std::process::id(),
            n
        ));
        fs::create_dir_all(&path).unwrap();
        TestDir { path }
    }

    fn path(&self) -> &Path {
        &self.path
    }

    /// Creates a file with `bytes` zero bytes, including parent folders.
    fn write(&self, rel: &str, bytes: usize) -> PathBuf {
        let p = self.path.join(rel);
        if let Some(parent) = p.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(&p, vec![0u8; bytes]).unwrap();
        p
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn run_scan(root: &Path) -> ScanSummary {
    let cancel = AtomicBool::new(false);
    scan(root, &cancel, |_| {}, None).expect("scan failed")
}

fn mklink_junction(link: &Path, target: &Path) -> bool {
    StdCommand::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(link)
        .arg(target)
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
}

/// Prefixes a path with `\\?\` so it can exceed MAX_PATH without registry changes.
fn verbatim(p: &Path) -> PathBuf {
    let s = p.to_string_lossy().to_string();
    if s.starts_with(r"\\?\") {
        p.to_path_buf()
    } else if let Some(rest) = s.strip_prefix(r"\\") {
        PathBuf::from(format!(r"\\?\UNC\{rest}"))
    } else {
        PathBuf::from(format!(r"\\?\{s}"))
    }
}

#[test]
fn junctions_and_cycles_are_not_followed_or_double_counted() {
    let td = TestDir::new("junction");
    let target = td.path().join("target");
    fs::create_dir_all(&target).unwrap();
    fs::write(target.join("data.bin"), vec![0u8; 4096]).unwrap();
    let real = td.path().join("real");
    fs::create_dir_all(&real).unwrap();
    fs::write(real.join("big.bin"), vec![0u8; 8192]).unwrap();

    // A cycle (target\loop -> target) and a double-count trap (real_alias -> real).
    assert!(
        mklink_junction(&target.join("loop"), &target),
        "mklink failed; junctions normally work without admin rights"
    );
    assert!(mklink_junction(&td.path().join("real_alias"), &real));

    let s = run_scan(td.path());
    assert!(!s.cancelled);
    assert_eq!(s.total_bytes, 4096 + 8192, "junction targets counted twice");
    assert_eq!(s.file_count, 2);
    assert_eq!(
        s.link_count, 2,
        "both junctions should be reported as links"
    );
}

#[test]
fn file_symlinks_are_not_counted_as_files() {
    let td = TestDir::new("symlink");
    let target = td.write("real.bin", 1000);
    let link = td.path().join("link.bin");
    if std::os::windows::fs::symlink_file(&target, &link).is_err() {
        eprintln!("skipping: creating file symlinks needs Developer Mode or admin");
        return;
    }
    let s = run_scan(td.path());
    assert_eq!(s.total_bytes, 1000);
    assert_eq!(s.file_count, 1);
    assert_eq!(s.link_count, 1);
}

#[test]
fn hard_links_are_counted_once() {
    let td = TestDir::new("hardlink");
    let a = td.write("a.bin", 2048);
    fs::hard_link(&a, td.path().join("b.bin")).unwrap();

    let s = run_scan(td.path());
    assert_eq!(s.total_bytes, 2048, "hard-linked file counted twice");
    assert_eq!(s.file_count, 1);
    assert_eq!(s.hardlink_skipped, 1);
}

#[test]
fn permission_denied_folders_are_skipped_without_crashing() {
    let td = TestDir::new("perm");
    td.write("readable.bin", 100);
    let locked = td.path().join("locked");
    fs::create_dir_all(&locked).unwrap();
    fs::write(locked.join("hidden.bin"), vec![0u8; 777]).unwrap();

    // Deny Everyone "read data / list directory" on the locked folder.
    let deny = StdCommand::new("icacls")
        .arg(&locked)
        .args(["/deny", "*S-1-1-0:(RD)"])
        .output()
        .expect("icacls not runnable");
    assert!(
        deny.status.success(),
        "icacls deny failed: {}",
        String::from_utf8_lossy(&deny.stderr)
    );
    let blocked = fs::read_dir(&locked).is_err();

    let s = run_scan(td.path());

    // Restore access before any assertion so cleanup still works.
    let _ = StdCommand::new("icacls")
        .arg(&locked)
        .args(["/remove:d", "*S-1-1-0"])
        .output();

    if !blocked {
        eprintln!("skipping: deny ACE did not block listing in this environment");
        return;
    }
    assert_eq!(s.total_bytes, 100, "readable file should still be counted");
    assert!(
        s.skipped_count >= 1,
        "the unreadable folder should be reported as skipped"
    );
}

#[test]
fn empty_folders_are_counted() {
    let td = TestDir::new("empty");
    fs::create_dir_all(td.path().join("a/b")).unwrap();
    fs::create_dir_all(td.path().join("c")).unwrap();

    let s = run_scan(td.path());
    assert_eq!(s.dir_count, 4, "root, a, b and c");
    assert_eq!(s.file_count, 0);
    assert_eq!(s.total_bytes, 0);
    assert_eq!(s.top_folders[0].size, 0);
}

#[test]
fn long_paths_beyond_260_chars_are_scanned() {
    let td = TestDir::new("longpath");
    let mut rel = PathBuf::new();
    for i in 0..10 {
        rel.push(format!("segment-{i:02}-padding-padding"));
    }
    rel.push("deep.bin");
    let deep = verbatim(&td.path().join(&rel));
    fs::create_dir_all(deep.parent().unwrap()).unwrap();
    fs::write(&deep, vec![0u8; 512]).unwrap();
    assert!(
        deep.to_string_lossy().len() > 260,
        "test path was not actually longer than 260 chars"
    );

    let s = run_scan(td.path());
    assert_eq!(s.total_bytes, 512);
    assert_eq!(s.file_count, 1);
    assert_eq!(s.dir_count, 11, "root plus ten segments");
    assert!(
        s.top_files.iter().any(|f| f.name == "deep.bin"),
        "the deep file should appear in the top files list"
    );
}

#[test]
fn top_lists_are_ordered_and_folders_ranked_by_totals() {
    let td = TestDir::new("topn");
    td.write("A/a1.bin", 1000);
    td.write("A/a2.bin", 2000);
    td.write("A/a3.bin", 3000);
    td.write("B/b1.bin", 500);
    td.write("C/c.bin", 4000);

    let s = run_scan(td.path());
    assert_eq!(s.total_bytes, 10500);

    let sizes: Vec<u64> = s.top_files.iter().map(|f| f.size).collect();
    assert_eq!(sizes, vec![4000, 3000, 2000, 1000, 500]);

    let names: Vec<&str> = s.top_files.iter().map(|f| f.name.as_str()).collect();
    assert_eq!(names, vec!["c.bin", "a3.bin", "a2.bin", "a1.bin", "b1.bin"]);

    // Folders ranked by total subtree size: root, A, C, B.
    let folder_sizes: Vec<u64> = s.top_folders.iter().map(|f| f.size).collect();
    assert_eq!(&folder_sizes[..4], &[10500, 6000, 4000, 500]);
    assert!(s.top_folders[1].path.ends_with("A"));
    assert!(s.top_folders[2].path.ends_with("C"));

    // Size per file type.
    let bin = s.by_type.iter().find(|t| t.ext == "bin").unwrap();
    assert_eq!(bin.count, 5);
    assert_eq!(bin.bytes, 10500);
}

#[test]
fn offline_files_are_marked_as_cloud_without_changing_counts() {
    let td = TestDir::new("cloud");
    let f = td.write("placeholder.bin", 1234);
    let set = StdCommand::new("attrib")
        .arg("+O")
        .arg(&f)
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false);
    if !set {
        eprintln!("skipping: cannot set the OFFLINE attribute in this environment");
        return;
    }

    let s = run_scan(td.path());
    assert_eq!(s.cloud_file_count, 1);
    assert_eq!(s.file_count, 1);
    assert_eq!(s.total_bytes, 1234, "placeholder size is counted as-is");
}

#[test]
fn cancellation_stops_the_scan() {
    let td = TestDir::new("cancel");
    for i in 0..100 {
        td.write(&format!("f{i}.bin"), 100);
    }

    let cancel = AtomicBool::new(true); // already cancelled before starting
    let s = scan(td.path(), &cancel, |_| {}, None).unwrap();
    assert!(s.cancelled);
    assert!(s.file_count < 100);
}

#[test]
fn scanning_a_missing_path_returns_an_error() {
    let cancel = AtomicBool::new(false);
    let missing = std::env::temp_dir().join("disklens-missing-path-for-test");
    assert!(scan(&missing, &cancel, |_| {}, None).is_err());
}

#[test]
fn progress_callback_reports_running_totals_and_previews() {
    let td = TestDir::new("progress");
    td.write("x.bin", 300);

    let seen: Mutex<Vec<ScanProgress>> = Mutex::new(Vec::new());
    let cancel = AtomicBool::new(false);
    let s = scan(
        td.path(),
        &cancel,
        |p| {
            seen.lock().unwrap().push(p.clone());
        },
        None,
    )
    .unwrap();

    let seen = seen.into_inner().unwrap();
    assert!(!seen.is_empty(), "at least the final progress is reported");
    let last = seen.last().unwrap();
    assert_eq!(last.files, 1);
    assert_eq!(last.bytes, 300);
    assert!(!last.root.is_empty(), "progress should carry the scan root");
    assert_eq!(last.top_files.len(), 1);
    assert_eq!(last.top_files[0].name, "x.bin");
    assert_eq!(last.top_files[0].size, 300);
    assert_eq!(
        last.top_folders[0].path, last.root,
        "the root folder should be the largest folder so far"
    );
    assert_eq!(s.file_count, 1);
}

#[test]
fn list_children_lists_direct_children_biggest_first() {
    let td = TestDir::new("children");
    td.write("small.bin", 100);
    td.write("big.bin", 500);
    td.write("sub/one.bin", 800);

    let cancel = AtomicBool::new(false);
    let last = Arc::new(LastScan::default());
    assert!(last.list_children("C:\\").is_err(), "no scan stored yet");

    let s = scan(td.path(), &cancel, |_| {}, Some(last.clone())).unwrap();

    let children = last.list_children(&s.root).unwrap();
    assert_eq!(children.len(), 3);
    assert_eq!(children[0].name, "sub");
    assert_eq!(children[0].kind, "folder");
    assert_eq!(children[0].size, 800);
    assert_eq!(children[1].name, "big.bin");
    assert_eq!(children[1].kind, "file");
    assert_eq!(children[1].is_cloud, Some(false));
    assert_eq!(children[2].name, "small.bin");

    let inside = last.list_children(&children[0].path).unwrap();
    assert_eq!(inside.len(), 1);
    assert_eq!(inside[0].name, "one.bin");
    assert_eq!(inside[0].size, 800);

    assert!(last.list_children("X:\\does-not-exist").is_err());
}

#[test]
fn drives_report_capacity() {
    let drives = list_drives();
    assert!(!drives.is_empty(), "expected at least one drive");
    for d in &drives {
        assert_eq!(d.letter.len(), 2, "drive letters look like \"C:\"");
        assert!(d.total_bytes > 0);
        assert_eq!(
            d.used_bytes + d.free_bytes,
            d.total_bytes,
            "used + free should equal total"
        );
    }
}

#[test]
fn mask_path_hides_the_user_profile() {
    let profile = std::env::var("USERPROFILE").expect("USERPROFILE is set on Windows");
    let masked = mask_path(format!("{profile}\\Documents\\report.pdf"));
    assert!(
        masked.starts_with("%USERPROFILE%"),
        "profile prefix not masked"
    );
    assert!(masked.ends_with("\\Documents\\report.pdf"));

    let untouched = mask_path("D:\\Other\\x.txt".to_string());
    assert_eq!(untouched, "D:\\Other\\x.txt");
}
