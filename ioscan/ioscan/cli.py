"""ioscan command-line interface (click)."""

from __future__ import annotations

import sys
from pathlib import Path

import click

from . import CONSENT_NOTICE, __version__
from .console import out_console, setup_logging


def _print_consent() -> None:
    out_console.print(f"[dim]{CONSENT_NOTICE}[/dim]")


@click.group(context_settings={"help_option_names": ["-h", "--help"]})
@click.version_option(__version__, prog_name="ioscan")
@click.option("-v", "--verbose", is_flag=True, help="Enable debug logging.")
@click.pass_context
def cli(ctx: click.Context, verbose: bool) -> None:
    """ioscan - offline DFIR scanner for iOS backups & sysdiagnose (defensive)."""
    ctx.ensure_object(dict)
    ctx.obj["logger"] = setup_logging(verbose)
    ctx.obj["verbose"] = verbose


@cli.command("version")
def version_cmd() -> None:
    """Print the ioscan version."""
    out_console.print(f"ioscan {__version__}")


@cli.command("scan-backup")
@click.argument("backup_path", type=click.Path(exists=True, file_okay=False, path_type=Path))
@click.option(
    "--iocs",
    "ioc_paths",
    multiple=True,
    type=click.Path(exists=True, path_type=Path),
    help="STIX2 IOC file(s). May be repeated.",
)
@click.option("--password", "-p", default=None, help="Backup password (for encrypted backups).")
@click.option(
    "--output",
    "-o",
    "output_dir",
    default="out",
    type=click.Path(path_type=Path),
    help="Directory to write reports into.",
)
@click.option("--no-consent", is_flag=True, help="Suppress the consent banner.")
@click.pass_context
def scan_backup_cmd(
    ctx: click.Context,
    backup_path: Path,
    ioc_paths: tuple[Path, ...],
    password: str | None,
    output_dir: Path,
    no_consent: bool,
) -> None:
    """Scan an iOS backup directory (Manifest.db based) for IOCs."""
    if not no_consent:
        _print_consent()
    from .report import write_all_reports
    from .scanner import scan_backup

    result = scan_backup(backup_path, list(ioc_paths), password=password)
    write_all_reports(result, output_dir)
    _emit_verdict(result)
    sys.exit(_exit_code(result))


@cli.command("scan-sysdiagnose")
@click.argument("sysdiagnose_path", type=click.Path(exists=True, path_type=Path))
@click.option(
    "--iocs",
    "ioc_paths",
    multiple=True,
    type=click.Path(exists=True, path_type=Path),
    help="STIX2 IOC file(s). May be repeated.",
)
@click.option(
    "--output",
    "-o",
    "output_dir",
    default="out",
    type=click.Path(path_type=Path),
    help="Directory to write reports into.",
)
@click.option("--no-consent", is_flag=True, help="Suppress the consent banner.")
@click.pass_context
def scan_sysdiagnose_cmd(
    ctx: click.Context,
    sysdiagnose_path: Path,
    ioc_paths: tuple[Path, ...],
    output_dir: Path,
    no_consent: bool,
) -> None:
    """Scan an unpacked sysdiagnose archive for IOCs and anomalies."""
    if not no_consent:
        _print_consent()
    from .report import write_all_reports
    from .scanner import scan_sysdiagnose

    result = scan_sysdiagnose(sysdiagnose_path, list(ioc_paths))
    write_all_reports(result, output_dir)
    _emit_verdict(result)
    sys.exit(_exit_code(result))


@cli.command("check-iocs")
@click.argument("ioc_path", type=click.Path(exists=True, path_type=Path))
def check_iocs_cmd(ioc_path: Path) -> None:
    """Validate a STIX2 IOC file and summarize the indicators it contains."""
    from .iocs import load_iocs, summarize_iocs

    try:
        bundle = load_iocs([ioc_path])
    except Exception as exc:  # noqa: BLE001 - surface any parse error cleanly
        out_console.print(f"[red]Invalid IOC file:[/red] {exc}")
        sys.exit(2)
    summary = summarize_iocs(bundle)
    out_console.print(f"[green]OK[/green] {ioc_path} - {summary['total']} indicators")
    for ioc_type, count in sorted(summary["by_type"].items()):
        out_console.print(f"  {ioc_type}: {count}")


def _emit_verdict(result) -> None:  # noqa: ANN001
    from .report.verdict import render_verdict_banner

    render_verdict_banner(result, out_console)


def _exit_code(result) -> int:  # noqa: ANN001
    from .models import Severity

    top = result.highest_severity
    if top is None:
        return 0
    if top >= Severity.HIGH:
        return 2
    if top >= Severity.LOW:
        return 1
    return 0


if __name__ == "__main__":
    cli()
