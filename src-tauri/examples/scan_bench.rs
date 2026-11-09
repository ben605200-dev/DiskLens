//! Headless benchmark helper: scans a folder with the real scanner and prints
//! totals, scan time, and the process peak working set.
//!
//! Usage (from src-tauri):
//!   cargo run --release --example scan_bench -- <folder>

use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::time::Instant;

use windows_sys::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
use windows_sys::Win32::System::Threading::GetCurrentProcess;

fn main() {
    let Some(path) = std::env::args().nth(1) else {
        eprintln!("usage: cargo run --release --example scan_bench -- <folder>");
        std::process::exit(2);
    };

    let cancel = AtomicBool::new(false);
    let start = Instant::now();
    let summary = disklens_lib::scanner::scan(Path::new(&path), &cancel, |_| {}, None, &[])
        .expect("scan failed");
    let elapsed = start.elapsed();

    let mut counters: PROCESS_MEMORY_COUNTERS = unsafe { std::mem::zeroed() };
    let ok = unsafe {
        GetProcessMemoryInfo(
            GetCurrentProcess(),
            &mut counters,
            std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
        )
    };
    let peak_mb = if ok != 0 {
        counters.PeakWorkingSetSize as f64 / (1024.0 * 1024.0)
    } else {
        0.0
    };

    println!("files={}", summary.file_count);
    println!("dirs={}", summary.dir_count);
    println!("bytes={}", summary.total_bytes);
    println!("skipped={}", summary.skipped_count);
    println!("elapsed_ms={}", elapsed.as_millis());
    println!("peak_working_set_mb={peak_mb:.1}");
}
