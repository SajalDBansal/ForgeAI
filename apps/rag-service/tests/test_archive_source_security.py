import io
import socket
import tarfile

import pytest

from graph_rag import archive_source, config

PUBLIC_ORIGIN = "https://archives.example"
PUBLIC_IP = "93.184.216.34"


def allow_archives_from(monkeypatch, *origins: str) -> None:
    monkeypatch.setattr(config, "RAG_SOURCE_ALLOWED_ORIGINS", origins)


def resolve_host_to(monkeypatch, ip: str) -> None:
    def fake_getaddrinfo(host, port, **_kwargs):
        return [
            (
                socket.AF_INET6 if ":" in ip else socket.AF_INET,
                socket.SOCK_STREAM,
                socket.IPPROTO_TCP,
                "",
                (ip, port),
            )
        ]

    monkeypatch.setattr(archive_source.socket, "getaddrinfo", fake_getaddrinfo)


def add_tar_file(tar: tarfile.TarFile, name: str, data: bytes) -> None:
    info = tarfile.TarInfo(name)
    info.size = len(data)
    tar.addfile(info, io.BytesIO(data))


def write_tar(path, entries) -> None:
    with tarfile.open(path, "w:gz") as tar:
        for entry in entries:
            kind = entry[0]
            if kind == "file":
                add_tar_file(tar, entry[1], entry[2])
            elif kind == "dir":
                info = tarfile.TarInfo(entry[1])
                info.type = tarfile.DIRTYPE
                tar.addfile(info)
            elif kind == "symlink":
                info = tarfile.TarInfo(entry[1])
                info.type = tarfile.SYMTYPE
                info.linkname = entry[2]
                tar.addfile(info)
            else:
                raise AssertionError(f"unknown fixture entry kind: {kind}")


def test_unpack_accepts_snapshot_style_dot_entries(tmp_path):
    archive = tmp_path / "source.tar.gz"
    target = tmp_path / "source"
    write_tar(
        archive,
        [
            ("dir", "."),
            ("dir", "./src"),
            ("file", "./src/app.ts", b"export const ok = true\n"),
        ],
    )

    archive_source.unpack_archive(archive, target, lambda _event: None)

    assert (target / "src" / "app.ts").read_text(encoding="utf-8") == "export const ok = true\n"


def test_source_url_requires_an_allowed_origin(monkeypatch):
    allow_archives_from(monkeypatch, PUBLIC_ORIGIN)
    resolve_host_to(monkeypatch, PUBLIC_IP)

    with pytest.raises(ValueError, match="origin is not allowed"):
        archive_source.validate_archive_source_url("https://evil.example/source.tar.gz")


def test_source_url_rejects_private_ip_literals(monkeypatch):
    allow_archives_from(monkeypatch, "http://169.254.169.254")

    with pytest.raises(ValueError, match="non-public"):
        archive_source.validate_archive_source_url("http://169.254.169.254/latest/meta-data")


def test_source_url_rejects_private_dns_results(monkeypatch):
    allow_archives_from(monkeypatch, PUBLIC_ORIGIN)
    resolve_host_to(monkeypatch, "10.0.0.5")

    with pytest.raises(ValueError, match="non-public"):
        archive_source.validate_archive_source_url(f"{PUBLIC_ORIGIN}/source.tar.gz")


def test_redirects_are_validated_like_initial_urls(monkeypatch):
    allow_archives_from(monkeypatch, PUBLIC_ORIGIN)
    resolve_host_to(monkeypatch, PUBLIC_IP)

    assert (
        archive_source.resolve_redirect_url(
            f"{PUBLIC_ORIGIN}/one/source.tar.gz", "../two/source.tar.gz"
        )
        == f"{PUBLIC_ORIGIN}/two/source.tar.gz"
    )

    with pytest.raises(ValueError, match="origin is not allowed"):
        archive_source.resolve_redirect_url(
            f"{PUBLIC_ORIGIN}/source.tar.gz", "https://evil.example/source.tar.gz"
        )


def test_unpack_rejects_traversal_without_writing_outside(tmp_path):
    archive = tmp_path / "source.tar.gz"
    target = tmp_path / "source"
    outside = tmp_path / "outside.txt"
    outside.write_text("unchanged", encoding="utf-8")
    write_tar(archive, [("file", "../outside.txt", b"owned")])

    with pytest.raises(ValueError, match="unsafe path"):
        archive_source.unpack_archive(archive, target, lambda _event: None)

    assert outside.read_text(encoding="utf-8") == "unchanged"
    assert not target.exists()
    assert not (tmp_path / "owned").exists()


def test_unpack_rejects_symlinks(tmp_path):
    archive = tmp_path / "source.tar.gz"
    target = tmp_path / "source"
    write_tar(archive, [("symlink", "src/link", "../outside.txt")])

    with pytest.raises(ValueError, match="unsupported links"):
        archive_source.unpack_archive(archive, target, lambda _event: None)

    assert not target.exists()
    assert not (target / "src" / "link").exists()


def test_unpack_rejects_compressed_bombs_before_extracting(tmp_path, monkeypatch):
    archive = tmp_path / "source.tar.gz"
    target = tmp_path / "source"
    monkeypatch.setattr(config, "MAX_UNPACKED_BYTES", 10)
    write_tar(
        archive,
        [
            ("file", "small.txt", b"ok"),
            ("file", "huge.txt", b"x" * 100),
        ],
    )

    with pytest.raises(ValueError, match="unpacks to"):
        archive_source.unpack_archive(archive, target, lambda _event: None)

    assert not target.exists()
    assert not (target / "small.txt").exists()
    assert not (target / "huge.txt").exists()
