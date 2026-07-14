"""Friendly desktop front-end for ioscan — "Check My iPhone".

A zero-terminal way to run a scan: it auto-detects local iOS backups on
macOS / Windows / Linux, lets you pick one, runs the scan in the background,
and opens the HTML report in your browser when it finishes.

Design note: all the non-UI logic (backup discovery, running a scan) lives in
plain functions so it can be tested headlessly. Only ``main()`` / ``App``
require a display.
"""

from __future__ import annotations

import plistlib
import sys
import threading
import webbrowser
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from . import CONSENT_NOTICE

# ---------------------------------------------------------------------------
# Backup discovery (headless-testable)
# ---------------------------------------------------------------------------


@dataclass
class BackupInfo:
    """A discovered iOS backup directory."""

    path: Path
    device_name: str | None
    last_backup: datetime | None
    encrypted: bool

    @property
    def label(self) -> str:
        name = self.device_name or self.path.name
        when = (
            self.last_backup.astimezone().strftime("%Y-%m-%d %H:%M")
            if self.last_backup
            else "unknown date"
        )
        lock = " 🔒 encrypted" if self.encrypted else ""
        return f"{name} — {when}{lock}"


def default_backup_roots() -> list[Path]:
    """Standard per-OS locations where Finder / iTunes / Apple Devices store
    local iOS backups."""
    home = Path.home()
    roots: list[Path] = []
    if sys.platform == "darwin":
        roots.append(home / "Library/Application Support/MobileSync/Backup")
    elif sys.platform.startswith("win"):
        import os

        appdata = os.environ.get("APPDATA", str(home / "AppData/Roaming"))
        roots.append(Path(appdata) / "Apple Computer/MobileSync/Backup")
        roots.append(Path(appdata) / "Apple/MobileSync/Backup")
        # Apple Devices app (Microsoft Store) uses a package-scoped path.
        roots.append(home / "Apple/MobileSync/Backup")
    else:
        # No standard iTunes backup path on Linux; user browses manually.
        roots.append(home / ".local/share/MobileSync/Backup")
    return [r for r in roots if r.exists()]


def _read_backup_meta(path: Path) -> BackupInfo:
    """Best-effort read of Info.plist / Manifest.plist for a nicer label."""
    device_name: str | None = None
    last_backup: datetime | None = None
    encrypted = False

    info = path / "Info.plist"
    if info.exists():
        try:
            with info.open("rb") as fh:
                data = plistlib.load(fh)
            device_name = data.get("Device Name") or data.get("Display Name")
            lbd = data.get("Last Backup Date")
            if isinstance(lbd, datetime):
                last_backup = lbd if lbd.tzinfo else lbd.replace(tzinfo=UTC)
        except Exception:
            pass

    manifest = path / "Manifest.plist"
    if manifest.exists():
        try:
            with manifest.open("rb") as fh:
                mdata = plistlib.load(fh)
            encrypted = bool(mdata.get("IsEncrypted", False))
        except Exception:
            pass

    if last_backup is None:
        try:
            last_backup = datetime.fromtimestamp(path.stat().st_mtime, tz=UTC)
        except OSError:
            pass

    return BackupInfo(
        path=path,
        device_name=device_name,
        last_backup=last_backup,
        encrypted=encrypted,
    )


def _looks_like_backup(path: Path) -> bool:
    return (path / "Manifest.db").exists() or (path / "Manifest.plist").exists()


def find_backups(roots: list[Path] | None = None) -> list[BackupInfo]:
    """Discover backups under the given roots (defaults to the per-OS roots).

    A backup is a directory (usually a UDID) containing Manifest.db /
    Manifest.plist. Newest first.
    """
    roots = roots if roots is not None else default_backup_roots()
    found: list[BackupInfo] = []
    seen: set[Path] = set()
    for root in roots:
        if not root.exists():
            continue
        # A root may itself be a backup, or contain UDID subfolders.
        candidates = [root, *[p for p in root.iterdir() if p.is_dir()]]
        for cand in candidates:
            rp = cand.resolve()
            if rp in seen or not _looks_like_backup(cand):
                continue
            seen.add(rp)
            found.append(_read_backup_meta(cand))
    found.sort(key=lambda b: b.last_backup or datetime.min.replace(tzinfo=UTC), reverse=True)
    return found


# ---------------------------------------------------------------------------
# IOC resolution
# ---------------------------------------------------------------------------


def bundled_sample_iocs() -> Path:
    return Path(__file__).resolve().parent / "data" / "sample_iocs.stix2"


def resolve_ioc_paths() -> tuple[list[Path], bool]:
    """Return (ioc_paths, using_real_feeds).

    Prefer real feeds fetched into an ``iocs/`` folder (project root or CWD);
    otherwise fall back to the bundled sample and report using_real_feeds=False.
    """
    project_root = Path(__file__).resolve().parents[1]
    for base in (Path.cwd(), project_root):
        feed_dir = base / "iocs"
        if feed_dir.is_dir():
            feeds = sorted(feed_dir.glob("*.stix2")) + sorted(feed_dir.glob("*.json"))
            if feeds:
                return feeds, True
    return [bundled_sample_iocs()], False


# ---------------------------------------------------------------------------
# Scan runner (headless-testable)
# ---------------------------------------------------------------------------


def run_scan(
    backup_path: Path,
    ioc_paths: list[Path],
    password: str | None,
    output_dir: Path,
    progress: Callable[[str], None] = lambda _msg: None,
):
    """Run a backup scan and write all reports. Returns (result, report_paths).

    ``progress`` is called with human-readable status strings.
    """
    from .report import write_all_reports
    from .scanner import scan_backup

    progress("Opening backup…")
    result = scan_backup(backup_path, ioc_paths, password=password or None)
    progress(f"Analyzed {len(result.records)} records — {len(result.detections)} detection(s).")
    output_dir.mkdir(parents=True, exist_ok=True)
    reports = write_all_reports(result, output_dir)
    progress("Reports written.")
    return result, reports


# ---------------------------------------------------------------------------
# GUI
# ---------------------------------------------------------------------------


VERDICT_COLORS = {
    "Clean": "#1a7f37",
    "Suspicious": "#9a6700",
    "Compromise indicators found": "#cf222e",
}


def main() -> int:  # pragma: no cover - requires a display
    try:
        import tkinter as tk
        from tkinter import filedialog, messagebox, ttk
    except Exception:
        print(
            "The graphical interface needs Tk, which isn't available.\n"
            "Use the command line instead:\n"
            "  ioscan scan-backup <backup-dir> --iocs <file.stix2> --output out/",
            file=sys.stderr,
        )
        return 1

    class App(tk.Tk):
        def __init__(self) -> None:
            super().__init__()
            self.title("Check My iPhone — ioscan")
            self.geometry("760x620")
            self.minsize(680, 560)

            self.backups: list[BackupInfo] = []
            self.result = None
            self.reports: dict[str, Path] = {}

            self._build()
            self._refresh_backups()

        # -- layout ------------------------------------------------------
        def _build(self) -> None:
            pad = {"padx": 12, "pady": 6}

            header = ttk.Frame(self)
            header.pack(fill="x", **pad)
            ttk.Label(
                header,
                text="Check My iPhone",
                font=("Helvetica", 18, "bold"),
            ).pack(anchor="w")
            ttk.Label(
                header,
                text=(
                    "Scan a local iPhone/iPad backup for known spyware "
                    "indicators. Read-only and offline."
                ),
                foreground="#57606a",
            ).pack(anchor="w")
            ttk.Label(
                header,
                text=CONSENT_NOTICE,
                foreground="#57606a",
                wraplength=720,
                font=("Helvetica", 9),
            ).pack(anchor="w", pady=(4, 0))

            # Backup selection
            box = ttk.LabelFrame(self, text="1 · Choose a backup")
            box.pack(fill="x", **pad)
            row = ttk.Frame(box)
            row.pack(fill="x", padx=8, pady=8)
            self.backup_var = tk.StringVar()
            self.backup_combo = ttk.Combobox(
                row, textvariable=self.backup_var, state="readonly", width=60
            )
            self.backup_combo.pack(side="left", fill="x", expand=True)
            ttk.Button(row, text="Rescan", command=self._refresh_backups).pack(side="left", padx=4)
            ttk.Button(row, text="Browse…", command=self._browse).pack(side="left")

            # Password + IOCs
            box2 = ttk.LabelFrame(self, text="2 · Options")
            box2.pack(fill="x", **pad)
            prow = ttk.Frame(box2)
            prow.pack(fill="x", padx=8, pady=8)
            ttk.Label(prow, text="Backup password (if encrypted):").pack(side="left")
            self.pw_var = tk.StringVar()
            ttk.Entry(prow, textvariable=self.pw_var, show="•", width=28).pack(side="left", padx=6)
            self.ioc_label = ttk.Label(box2, text="", foreground="#57606a")
            self.ioc_label.pack(anchor="w", padx=8, pady=(0, 8))
            self._update_ioc_label()

            # Action
            arow = ttk.Frame(self)
            arow.pack(fill="x", **pad)
            self.scan_btn = ttk.Button(arow, text="▶  Scan now", command=self._start_scan)
            self.scan_btn.pack(side="left")
            self.progress = ttk.Progressbar(arow, mode="indeterminate")
            self.progress.pack(side="left", fill="x", expand=True, padx=10)

            # Verdict banner
            self.banner = tk.Label(
                self,
                text="",
                font=("Helvetica", 14, "bold"),
                fg="white",
                pady=10,
            )

            # Output log / detections
            box3 = ttk.LabelFrame(self, text="Results")
            box3.pack(fill="both", expand=True, **pad)
            self.log = tk.Text(box3, height=12, wrap="word", state="disabled")
            self.log.pack(fill="both", expand=True, padx=8, pady=8)

            self.open_btn = ttk.Button(self, text="Open full report", command=self._open_report)

        # -- helpers -----------------------------------------------------
        def _update_ioc_label(self) -> None:
            paths, real = resolve_ioc_paths()
            if real:
                self.ioc_label.config(
                    text=f"IOC feeds: {len(paths)} file(s) from your iocs/ folder.",
                    foreground="#1a7f37",
                )
            else:
                self.ioc_label.config(
                    text=(
                        "IOC feeds: bundled SAMPLE only (demo). For a real check, "
                        "fetch Amnesty MVT feeds into an 'iocs/' folder."
                    ),
                    foreground="#9a6700",
                )

        def _log(self, msg: str) -> None:
            self.log.config(state="normal")
            self.log.insert("end", msg + "\n")
            self.log.see("end")
            self.log.config(state="disabled")

        def _refresh_backups(self) -> None:
            self.backups = find_backups()
            labels = [b.label for b in self.backups]
            self.backup_combo["values"] = labels
            if labels:
                self.backup_combo.current(0)
                self._log(f"Found {len(labels)} backup(s).")
            else:
                self._log(
                    "No backups found automatically. Use Browse… to pick a "
                    "backup folder, or create one in Finder / Apple Devices first."
                )

        def _browse(self) -> None:
            chosen = filedialog.askdirectory(title="Select an iOS backup folder")
            if not chosen:
                return
            info = _read_backup_meta(Path(chosen))
            self.backups.insert(0, info)
            vals = [info.label, *self.backup_combo["values"]]
            self.backup_combo["values"] = vals
            self.backup_combo.current(0)

        def _selected_backup(self) -> BackupInfo | None:
            idx = self.backup_combo.current()
            if idx < 0 or idx >= len(self.backups):
                return None
            return self.backups[idx]

        # -- scan --------------------------------------------------------
        def _start_scan(self) -> None:
            backup = self._selected_backup()
            if backup is None:
                messagebox.showwarning("No backup", "Choose a backup to scan first.")
                return
            self.scan_btn.config(state="disabled")
            self.open_btn.pack_forget()
            self.banner.pack_forget()
            self.progress.start(12)
            self._log(f"\n── Scanning: {backup.label} ──")

            ioc_paths, _ = resolve_ioc_paths()
            output_dir = backup.path.parent / f"ioscan-report-{backup.path.name}"
            pw = self.pw_var.get().strip()

            def work() -> None:
                try:
                    result, reports = run_scan(
                        backup.path,
                        ioc_paths,
                        pw,
                        output_dir,
                        progress=lambda m: self.after(0, self._log, m),
                    )
                    self.after(0, self._done, result, reports)
                except Exception as exc:  # surface any failure to the user
                    self.after(0, self._failed, str(exc))

            threading.Thread(target=work, daemon=True).start()

        def _done(self, result, reports: dict[str, Path]) -> None:
            self.result = result
            self.reports = reports
            self.progress.stop()
            self.scan_btn.config(state="normal")

            verdict = result.verdict
            self.banner.config(
                text=f"  {verdict}  ",
                bg=VERDICT_COLORS.get(verdict, "#57606a"),
            )
            self.banner.pack(fill="x", padx=12, pady=6, before=self.log.master)

            self._log(f"\nVerdict: {verdict}")
            if result.detections:
                self._log("Top findings:")
                for d in result.sorted_detections()[:12]:
                    self._log(
                        f"  [{d.severity.name}] {d.source}: {d.matched_value} — {d.description}"
                    )
            else:
                self._log("No known indicators matched.")
            for note in result.notes:
                if note.level != "INFO":
                    self._log(f"  ({note.level}) {note.source}: {note.message}")
            self._log(f"\nReports saved to: {reports.get('html', '?')}")
            self.open_btn.pack(pady=(0, 10))

        def _failed(self, msg: str) -> None:
            self.progress.stop()
            self.scan_btn.config(state="normal")
            self._log(f"\n✗ Scan failed: {msg}")
            if "password" in msg.lower():
                messagebox.showerror(
                    "Password needed",
                    "This backup looks encrypted. Enter the backup password and try again.",
                )
            else:
                messagebox.showerror("Scan failed", msg)

        def _open_report(self) -> None:
            html = self.reports.get("html")
            if html:
                webbrowser.open(Path(html).resolve().as_uri())

    print(CONSENT_NOTICE)
    App().mainloop()
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
