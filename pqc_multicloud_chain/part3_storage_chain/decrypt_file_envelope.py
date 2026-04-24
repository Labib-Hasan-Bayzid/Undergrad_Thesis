# decrypt_file_envelope.py
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Callable, Dict, List, Tuple

from cryptography.exceptions import InvalidTag

from crypto_utils import sha3_512, aes_gcm_decrypt
from kms_lib import kms_unwrap_dek
from merkle_utils import build_merkle_root_sha3_512
from resource_limits import MAX_CHUNKS_PER_FILE, MAX_DOWNLOAD_SECONDS

BYZ_QUORUM = int(os.getenv("BYZ_QUORUM", "2"))            # 2-of-3 default
AUTO_HEAL = os.getenv("AUTO_HEAL", "1") == "1"            # default ON
AUTO_HEAL_MAX = int(os.getenv("AUTO_HEAL_MAX", "4096"))   # cap repairs


def _chunk_path(cloud: str, file_id: str, idx: int) -> Path:
    return Path(cloud) / file_id / f"{idx:08d}.bin"


def _list_clouds(conn, file_id: str) -> List[str]:
    # We keep this DB-driven because your system uses DB "cloud_id" rows as the replica contract.
    with conn.cursor() as cur:
        cur.execute(
            "SELECT DISTINCT cloud_id FROM file_chunks WHERE file_id=%s ORDER BY cloud_id",
            (file_id,),
        )
        rows = cur.fetchall()
    clouds = [r[0] for r in rows]
    if len(clouds) < BYZ_QUORUM:
        raise RuntimeError("INSUFFICIENT_REPLICAS")
    return clouds


def _db_replica_status(conn, file_id: str, cloud: str, status: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO replicas(file_id, cloud_name, status, last_checked)
            VALUES (%s::uuid, %s, %s, now())
            ON CONFLICT (file_id, cloud_name)
            DO UPDATE SET status=EXCLUDED.status, last_checked=now()
            """,
            (file_id, cloud, status),
        )


def _db_integrity_event(conn, file_id: str, cloud: str, event_type: str, detail: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO integrity_events(file_id, cloud_name, event_type, detail)
            VALUES (%s::uuid, %s, %s, %s)
            """,
            (file_id, cloud, event_type, detail[:5000]),
        )


def _heal_replica_chunk_fs(
    *,
    file_id: str,
    chunk_index: int,
    bad_cloud: str,
    good_cloud: str,
) -> None:
    src = _chunk_path(good_cloud, file_id, chunk_index)
    dst = _chunk_path(bad_cloud, file_id, chunk_index)
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(src.read_bytes())


def _fetch_chunk_meta(conn, file_id: str, chunk_index: int, clouds: List[str]) -> Dict[str, Tuple[bytes, bytes, bytes]]:
    # cloud -> (nonce, tag, stored_plain_hash)
    out: Dict[str, Tuple[bytes, bytes, bytes]] = {}
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT cloud_id, nonce, tag, hash_sha3_512
            FROM file_chunks
            WHERE file_id=%s AND chunk_index=%s AND cloud_id = ANY(%s)
            """,
            (file_id, int(chunk_index), clouds),
        )
        for cloud_id, nonce, tag, h in cur.fetchall():
            out[str(cloud_id)] = (bytes(nonce), bytes(tag), bytes(h))
    return out


def decrypt_file_to_stream(conn, file_id: str, sink_func: Callable[[bytes], None]) -> None:
    start_ts = time.time()
    repairs_done = 0

    # --- load file metadata ---
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              status,
              file_size,
              chunk_size,
              chunks_total,
              dek_wrapped,
              dek_wrap_nonce,
              kek_version,
              merkle_root_sha3_512
            FROM files
            WHERE file_id=%s
            """,
            (file_id,),
        )
        row = cur.fetchone()

    if not row:
        raise RuntimeError("FILE_NOT_FOUND")

    (
        status,
        file_size,
        chunk_size,
        chunks_total,
        wrapped_dek,
        wrap_nonce,
        kek_version,
        merkle_root_db,
    ) = row

    if status != "AVAILABLE":
        raise RuntimeError("NOT_AVAILABLE")

    if int(chunks_total) <= 0:
        raise RuntimeError("BAD_CHUNK_COUNT")
    if int(chunks_total) > MAX_CHUNKS_PER_FILE:
        raise RuntimeError("TOO_MANY_CHUNKS")

    dek = kms_unwrap_dek(wrapped_dek, wrap_nonce, int(kek_version))
    clouds = _list_clouds(conn, file_id)

    # quick DB row count check per cloud
    with conn.cursor() as cur:
        for c in clouds:
            cur.execute(
                "SELECT COUNT(*) FROM file_chunks WHERE file_id=%s AND cloud_id=%s",
                (file_id, c),
            )
            if int(cur.fetchone()[0]) != int(chunks_total):
                _db_replica_status(conn, file_id, c, "SUSPECT")
                _db_integrity_event(conn, file_id, c, "BYZ_MISSING", "db_row_count_mismatch")
                conn.commit()
                raise RuntimeError("CHUNK_COUNT_MISMATCH")

    leaves: List[bytes] = []
    total_out = 0

    for idx in range(int(chunks_total)):
        if (time.time() - start_ts) > MAX_DOWNLOAD_SECONDS:
            raise RuntimeError("DOWNLOAD_TIMEOUT")

        meta = _fetch_chunk_meta(conn, file_id, idx, clouds)
        if len(meta) < BYZ_QUORUM:
            raise RuntimeError("INSUFFICIENT_REPLICAS_FOR_CHUNK")

        ok_clouds: Dict[str, Tuple[bytes, bytes]] = {}   # cloud -> (plaintext, pt_hash)
        bad_clouds: Dict[str, str] = {}

        for c in clouds:
            tup = meta.get(c)
            if not tup:
                bad_clouds[c] = "MISSING_DB_ROW"
                continue

            db_nonce, db_tag, stored_plain_hash = tup

            fp = _chunk_path(c, file_id, idx)
            if not fp.exists():
                bad_clouds[c] = "MISSING_FS_CHUNK"
                continue

            blob = fp.read_bytes()
            if len(blob) < (12 + 16):
                bad_clouds[c] = "FS_BLOB_TOO_SMALL"
                continue

            nonce = blob[:12]
            tag = blob[-16:]
            ciphertext = blob[12:-16]

            # optional consistency check vs DB
            if nonce != db_nonce or tag != db_tag:
                bad_clouds[c] = "DB_FS_NONCE_TAG_MISMATCH"
                continue

            try:
                pt = aes_gcm_decrypt(dek, nonce, ciphertext, tag, aad=None)
            except InvalidTag:
                bad_clouds[c] = "AES_GCM_TAG_INVALID"
                continue
            except Exception:
                bad_clouds[c] = "DECRYPT_FAIL"
                continue

            calc_hash = sha3_512(pt)
            if calc_hash != stored_plain_hash:
                bad_clouds[c] = "PLAINTEXT_HASH_MISMATCH"
                continue

            ok_clouds[c] = (pt, calc_hash)

        if len(ok_clouds) < BYZ_QUORUM:
            for c, reason in bad_clouds.items():
                _db_replica_status(conn, file_id, c, "SUSPECT")
                _db_integrity_event(conn, file_id, c, "BYZ_MISMATCH", f"idx={idx} {reason}")
            conn.commit()
            raise RuntimeError("BYZ_QUORUM_NOT_REACHED")

        # majority vote on plaintext hash
        buckets: Dict[bytes, List[str]] = {}
        sample_pt: Dict[bytes, bytes] = {}

        for c, (pt, h) in ok_clouds.items():
            buckets.setdefault(h, []).append(c)
            sample_pt[h] = pt

        best_hash = max(buckets.keys(), key=lambda k: len(buckets[k]))
        winners = buckets[best_hash]

        if len(winners) < BYZ_QUORUM:
            for c in clouds:
                _db_replica_status(conn, file_id, c, "SUSPECT")
            _db_integrity_event(conn, file_id, clouds[0], "BYZ_QUORUM_FAIL", f"idx={idx} no_majority")
            conn.commit()
            raise RuntimeError("BYZ_QUORUM_NOT_REACHED")

        pt_ok = sample_pt[best_hash]
        sink_func(pt_ok)
        total_out += len(pt_ok)
        leaves.append(best_hash)

        source_cloud = winners[0]

        for c in clouds:
            if c in winners:
                _db_replica_status(conn, file_id, c, "HEALTHY")
                continue

            _db_replica_status(conn, file_id, c, "SUSPECT")
            _db_integrity_event(conn, file_id, c, "BYZ_MISMATCH", f"idx={idx} QUORUM_MISMATCH vs {source_cloud}")

            if AUTO_HEAL and repairs_done < AUTO_HEAL_MAX:
                try:
                    _heal_replica_chunk_fs(file_id=file_id, chunk_index=idx, bad_cloud=c, good_cloud=source_cloud)
                    repairs_done += 1
                    _db_replica_status(conn, file_id, c, "REPAIRED")
                    _db_integrity_event(conn, file_id, c, "BYZ_REPAIRED", f"idx={idx} repaired_from={source_cloud}")
                except Exception:
                    _db_integrity_event(conn, file_id, c, "BYZ_REPAIR_FAIL", f"idx={idx} from={source_cloud}")

        conn.commit()

    if total_out != int(file_size):
        raise RuntimeError("FILE_SIZE_MISMATCH")

    if merkle_root_db is not None:
        calc_root = build_merkle_root_sha3_512(leaves)
        if calc_root != merkle_root_db:
            raise RuntimeError("MERKLE_MISMATCH")
