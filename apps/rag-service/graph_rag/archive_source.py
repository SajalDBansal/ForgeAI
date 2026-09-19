"""
Safe source-archive download and extraction for the RAG API.

The source URL normally comes from ForgeAI's orchestrator as a short-lived R2
signed URL. Still, the RAG service treats it as untrusted input: callers can be
buggy, redirects can be hostile, and archives can carry unsafe paths.
"""

from __future__ import annotations

import ipaddress
import re
import socket
import tarfile
from pathlib import Path, PurePosixPath, PureWindowsPath
from urllib.parse import urljoin, urlsplit, urlunsplit

import httpx

from . import config

# How often the download reports progress, in bytes.
_DOWNLOAD_PROGRESS_STEP = 1_000_000
_DOWNLOAD_TIMEOUT = httpx.Timeout(60.0, connect=10.0, read=30.0, write=10.0, pool=10.0)
_MAX_REDIRECTS = 5
_MAX_WRITE_CHUNK_BYTES = 1024 * 1024
_WINDOWS_DRIVE_RE = re.compile(r"^[a-zA-Z]:")
_METADATA_IPS = {
    ipaddress.ip_address("169.254.169.254"),
    ipaddress.ip_address("100.100.100.200"),
}


def _allowed_origins() -> set[str]:
    return {
        _canonical_origin(origin) for origin in config.RAG_SOURCE_ALLOWED_ORIGINS if origin.strip()
    }


def _canonical_origin(value: str) -> str:
    parts = urlsplit(value.strip())
    if (
        parts.scheme not in {"http", "https"}
        or not parts.hostname
        or parts.username
        or parts.password
        or parts.path not in {"", "/"}
        or parts.query
        or parts.fragment
    ):
        raise ValueError("RAG_SOURCE_ALLOWED_ORIGINS must contain http(s) origins")
    port = _port_for(parts.scheme, parts.port)
    return _origin(parts.scheme, parts.hostname, port)


def _port_for(scheme: str, port: int | None) -> int:
    if port is not None:
        return port
    return 443 if scheme == "https" else 80


def _origin(scheme: str, host: str, port: int) -> str:
    host = host.strip("[]").lower()
    host_part = f"[{host}]" if ":" in host else host
    default_port = 443 if scheme == "https" else 80
    port_part = "" if port == default_port else f":{port}"
    return f"{scheme}://{host_part}{port_part}"


def _normalise_ip(address: ipaddress.IPv4Address | ipaddress.IPv6Address):
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
        return address.ipv4_mapped
    return address


def _assert_public_ip(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> None:
    normalised = _normalise_ip(address)
    if normalised in _METADATA_IPS or not normalised.is_global:
        raise ValueError("sourceUrl resolves to a non-public address")


def _assert_public_destination(host: str, port: int) -> None:
    host = host.strip("[]")
    if "%" in host:
        raise ValueError("sourceUrl must not use scoped IPv6 addresses")

    try:
        _assert_public_ip(ipaddress.ip_address(host))
        return
    except ValueError as error:
        if "non-public" in str(error):
            raise

    try:
        addresses = socket.getaddrinfo(
            host, port, type=socket.SOCK_STREAM, proto=socket.IPPROTO_TCP
        )
    except socket.gaierror as error:
        raise ValueError("sourceUrl host could not be resolved") from error

    if not addresses:
        raise ValueError("sourceUrl host could not be resolved")

    for address in addresses:
        _assert_public_ip(ipaddress.ip_address(address[4][0].split("%", 1)[0]))


def validate_archive_source_url(url: str) -> str:
    """
    Return a normalised URL if it is an allowed public http(s) destination.

    This validates both the caller-provided URL and each redirect target.
    """
    try:
        parts = urlsplit(url)
        port = _port_for(parts.scheme, parts.port)
    except ValueError as error:
        raise ValueError("sourceUrl is not a valid URL") from error

    if parts.scheme not in {"http", "https"} or not parts.hostname:
        raise ValueError("sourceUrl must be an http(s) link")
    if parts.username or parts.password:
        raise ValueError("sourceUrl must not include credentials")

    allowed = _allowed_origins()
    if not allowed:
        raise ValueError("RAG_SOURCE_ALLOWED_ORIGINS must allow the archive source origin")

    origin = _origin(parts.scheme, parts.hostname, port)
    if origin not in allowed:
        raise ValueError("sourceUrl origin is not allowed")

    _assert_public_destination(parts.hostname, port)
    return urlunsplit((parts.scheme, parts.netloc, parts.path or "/", parts.query, ""))


def resolve_redirect_url(current_url: str, location: str) -> str:
    """Resolve and validate a redirect target relative to the current URL."""
    if not location:
        raise ValueError("archive download redirect did not include a Location header")
    return validate_archive_source_url(urljoin(current_url, location))


def _content_length(headers: httpx.Headers) -> int | None:
    value = headers.get("content-length")
    if not value:
        return None
    try:
        total = int(value)
    except ValueError:
        return None
    if total < 0:
        raise ValueError("archive content-length is invalid")
    return total


def _raise_http_status(response: httpx.Response) -> None:
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as error:
        raise ValueError(f"archive download returned HTTP {response.status_code}") from error


def download_archive(url: str, target: Path, emit) -> None:
    """Fetch the archive, validating the source, every redirect and the byte limit."""
    current_url = validate_archive_source_url(url)
    try:
        with httpx.Client(
            timeout=_DOWNLOAD_TIMEOUT,
            follow_redirects=False,
            trust_env=False,
        ) as client:
            for redirects in range(_MAX_REDIRECTS + 1):
                current_url = validate_archive_source_url(current_url)
                with client.stream("GET", current_url) as response:
                    if response.is_redirect:
                        if redirects == _MAX_REDIRECTS:
                            raise ValueError("archive download redirected too many times")
                        current_url = resolve_redirect_url(
                            current_url, response.headers.get("location", "")
                        )
                        continue

                    _raise_http_status(response)
                    total = _content_length(response.headers)
                    if total and total > config.MAX_ARCHIVE_BYTES:
                        raise ValueError(
                            f"archive is {total} bytes, over the {config.MAX_ARCHIVE_BYTES} limit"
                        )

                    done = 0
                    next_report = 0
                    with target.open("wb") as out:
                        for chunk in response.iter_bytes():
                            done += len(chunk)
                            if done > config.MAX_ARCHIVE_BYTES:
                                raise ValueError(
                                    f"archive is over the {config.MAX_ARCHIVE_BYTES} byte limit"
                                )
                            out.write(chunk)
                            if done >= next_report:
                                emit(
                                    {
                                        "type": "progress",
                                        "phase": "downloading",
                                        "done": done,
                                        "total": total,
                                    }
                                )
                                next_report = done + _DOWNLOAD_PROGRESS_STEP
                    emit(
                        {
                            "type": "progress",
                            "phase": "downloading",
                            "done": done,
                            "total": total or done,
                        }
                    )
                    return
    except httpx.RequestError as error:
        raise ValueError(f"archive download failed: {type(error).__name__}") from error


def _member_path(member: tarfile.TarInfo) -> PurePosixPath | None:
    name = member.name
    if not name or "\x00" in name or "\\" in name:
        raise ValueError("archive contains an unsafe path")
    if _WINDOWS_DRIVE_RE.match(name) or PureWindowsPath(name).is_absolute():
        raise ValueError("archive contains an unsafe path")

    while name.startswith("./"):
        name = name[2:]
    if name in {"", "."}:
        if member.isdir():
            return None
        raise ValueError("archive contains an unsafe path")

    path = PurePosixPath(name)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise ValueError("archive contains an unsafe path")
    return path


def _member_destination(root: Path, member: tarfile.TarInfo) -> tuple[Path | None, str | None]:
    path = _member_path(member)
    if path is None:
        return None, None
    destination = root.joinpath(*path.parts).resolve()
    root_resolved = root.resolve()
    if destination != root_resolved and not destination.is_relative_to(root_resolved):
        raise ValueError("archive contains a path outside the extraction directory")
    return destination, "/".join(path.parts)


def _check_member(root: Path, member: tarfile.TarInfo, seen: set[str]) -> int:
    _destination, relative = _member_destination(root, member)
    if relative is None:
        return 0
    if relative in seen:
        raise ValueError("archive contains duplicate paths")
    seen.add(relative)

    if member.isdir():
        return 0
    if not member.isfile():
        raise ValueError("archive contains unsupported links or special files")
    if member.size < 0:
        raise ValueError("archive contains an invalid file size")
    return member.size


def _write_file(tar: tarfile.TarFile, member: tarfile.TarInfo, destination: Path) -> None:
    source = tar.extractfile(member)
    if source is None:
        raise ValueError("archive contains an unreadable file")

    destination.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    with source, destination.open("wb") as out:
        while chunk := source.read(_MAX_WRITE_CHUNK_BYTES):
            written += len(chunk)
            if written > member.size:
                raise ValueError("archive file exceeded its declared size")
            out.write(chunk)
    if written != member.size:
        raise ValueError("archive file ended before its declared size")


def unpack_archive(archive: Path, target: Path, emit) -> None:
    """Unpack a tar archive without links, traversal or quota overruns."""
    emit({"type": "progress", "phase": "unpacking", "done": None, "total": None})
    with tarfile.open(archive, "r:*") as tar:
        members = tar.getmembers()
        if len(members) > config.MAX_ARCHIVE_FILES:
            raise ValueError(
                f"archive has {len(members)} entries, over the {config.MAX_ARCHIVE_FILES} limit"
            )

        seen: set[str] = set()
        unpacked = sum(_check_member(target, member, seen) for member in members)
        if unpacked > config.MAX_UNPACKED_BYTES:
            raise ValueError(
                f"archive unpacks to {unpacked} bytes, over the {config.MAX_UNPACKED_BYTES} limit"
            )

        target.mkdir()
        for member in members:
            destination, _relative = _member_destination(target, member)
            if destination is None:
                continue
            if member.isdir():
                destination.mkdir(parents=True, exist_ok=True)
            else:
                _write_file(tar, member, destination)
