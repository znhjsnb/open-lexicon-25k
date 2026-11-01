"""
Open-Lexicon 25K Web Server
Pure Python 3 standard library server powered by SQLite with FTS5 search.
Zero external pip dependencies.
"""

import json
import os
import re
import sqlite3
import sys
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT_DIR = Path(__file__).resolve().parent.parent
DB_PATH = ROOT_DIR / "data" / "exports" / "open_lexicon_25k.db"
STATIC_DIR = Path(__file__).resolve().parent / "static"
PORT = 8765

_local = threading.local()

def get_db():
    if not hasattr(_local, "conn"):
        _local.conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        _local.conn.row_factory = sqlite3.Row
    return _local.conn

def is_chinese(text):
    return any('\u4e00' <= char <= '\u9fff' for char in text)


class LexiconHandler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path.startswith("/api/"):
            self.handle_api(path, query)
        else:
            self.handle_static(path)

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_api(self, path, query):
        conn = get_db()
        cur = conn.cursor()

        if path == "/api/stats":
            cur.execute("SELECT COUNT(*) FROM words")
            w_cnt = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM senses")
            s_cnt = cur.fetchone()[0]
            self.send_json({
                "status": "ok",
                "total_words": w_cnt,
                "total_senses": s_cnt,
                "avg_senses": round(s_cnt / w_cnt, 2) if w_cnt else 0,
                "tags": ["高考", "四级", "六级", "考研", "雅思", "托福", "GRE", "商务英语", "PET", "FCE"],
                "pos_list": ["n.", "v.", "adj.", "adv.", "prep.", "conj.", "pron.", "num."]
            })
            return

        elif path == "/api/words":
            q = query.get("q", [""])[0].strip()
            tag = query.get("tag", [""])[0].strip()
            pos = query.get("pos", [""])[0].strip()
            page = max(1, int(query.get("page", ["1"])[0]))
            limit = min(100, max(1, int(query.get("limit", ["30"])[0])))
            offset = (page - 1) * limit

            where_clauses = []
            params = []

            if q:
                if is_chinese(q):
                    # Search by Chinese meaning via senses
                    where_clauses.append("""
                        id IN (SELECT DISTINCT word_id FROM senses WHERE meaning_zh LIKE ?)
                    """)
                    params.append(f"%{q}%")
                else:
                    # Search by English headword prefix or exact
                    where_clauses.append("word LIKE ?")
                    params.append(f"{q}%")

            if tag:
                where_clauses.append("exam_tags LIKE ?")
                params.append(f"%{tag}%")

            if pos:
                where_clauses.append("""
                    id IN (SELECT DISTINCT word_id FROM senses WHERE pos LIKE ?)
                """)
                params.append(f"%{pos}%")

            where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

            # Count total
            count_sql = f"SELECT COUNT(*) FROM words {where_sql}"
            cur.execute(count_sql, params)
            total = cur.fetchone()[0]

            # Fetch rows
            select_sql = f"""
                SELECT id, word, rank_order, phonetic, exam_tags,
                       (SELECT meaning_zh FROM senses WHERE word_id = words.id LIMIT 1) as main_meaning,
                       (SELECT COUNT(*) FROM senses WHERE word_id = words.id) as senses_count
                FROM words
                {where_sql}
                ORDER BY rank_order ASC
                LIMIT ? OFFSET ?
            """
            cur.execute(select_sql, params + [limit, offset])
            rows = cur.fetchall()

            results = []
            for r in rows:
                tags = json.loads(r["exam_tags"]) if r["exam_tags"] else []
                results.append({
                    "id": r["id"],
                    "word": r["word"],
                    "rank": r["rank_order"],
                    "phonetic": r["phonetic"],
                    "main_meaning": r["main_meaning"] or "",
                    "senses_count": r["senses_count"],
                    "exam_tags": tags
                })

            self.send_json({
                "words": results,
                "total": total,
                "page": page,
                "limit": limit,
                "total_pages": (total + limit - 1) // limit if limit else 1
            })
            return

        elif path == "/api/word":
            w_id = query.get("id", [""])[0].strip()
            word_str = query.get("w", [""])[0].strip()

            if w_id.isdigit():
                cur.execute("SELECT raw_json FROM words WHERE id = ?", (int(w_id),))
            elif word_str:
                cur.execute("SELECT raw_json FROM words WHERE word = ? COLLATE NOCASE", (word_str,))
            else:
                self.send_json({"error": "Missing id or w parameter"}, status=400)
                return

            row = cur.fetchone()
            if row and row["raw_json"]:
                data = json.loads(row["raw_json"])
                self.send_json(data)
            else:
                self.send_json({"error": "Word not found"}, status=404)
            return

        elif path == "/api/random":
            cur.execute("SELECT raw_json FROM words ORDER BY RANDOM() LIMIT 1")
            row = cur.fetchone()
            if row and row["raw_json"]:
                self.send_json(json.loads(row["raw_json"]))
            else:
                self.send_json({"error": "No data"}, status=404)
            return

        else:
            self.send_json({"error": "Endpoint not found"}, status=404)

    def handle_static(self, path):
        if path in ("", "/"):
            req_file = STATIC_DIR / "index.html"
        else:
            rel = path.lstrip("/\\")
            req_file = (STATIC_DIR / rel).resolve()

        if not str(req_file).startswith(str(STATIC_DIR.resolve())) or not req_file.exists() or req_file.is_dir():
            req_file = STATIC_DIR / "index.html"

        content_types = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".png": "image/png",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon",
        }
        ctype = content_types.get(req_file.suffix.lower(), "application/octet-stream")

        try:
            with open(req_file, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode("utf-8"))

    def log_message(self, format, *args):
        # Silence verbose request logging for high throughput
        pass


def run_server():
    print(f"🚀 Open-Lexicon 25K Web Server starting on http://127.0.0.1:{PORT} ...")
    server = ThreadingHTTPServer(("127.0.0.1", PORT), LexiconHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        server.server_close()

if __name__ == "__main__":
    run_server()
