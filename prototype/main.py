import hashlib
import hmac
import json
import os
import sqlite3
from datetime import datetime
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "database.db")

app = FastAPI()
app.add_middleware(
    SessionMiddleware,
    secret_key=os.environ.get("SESSION_SECRET", "hand-font-dev-secret-key"),
)
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            subject TEXT NOT NULL DEFAULT '',
            content_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            content_json TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


init_db()


def hash_password(password: str) -> str:
    salt = os.urandom(16).hex()
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 100000).hex()
    return f"{salt}:{hashed}"


def verify_password(password: str, stored_hash: str) -> bool:
    parts = stored_hash.split(":")
    if len(parts) != 2:
        return False
    salt, expected = parts
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 100000).hex()
    return hmac.compare_digest(hashed, expected)


def get_current_user(request: Request):
    user_id = request.session.get("user_id")
    username = request.session.get("username")
    if not user_id or not username:
        return None
    return {"id": user_id, "username": username}


def normalize_content_json(content, default_title="", default_subject=""):
    if content is None:
        data = {
            "title": default_title,
            "subject": default_subject,
            "page": {"width": 210, "height": 297, "unit": "mm"},
            "blocks": [],
        }
        return json.dumps(data, ensure_ascii=False)
    if isinstance(content, str):
        parsed = json.loads(content)
        if not isinstance(parsed, dict):
            raise ValueError("JSON must be an object")
        return json.dumps(parsed, ensure_ascii=False)
    if isinstance(content, dict):
        return json.dumps(content, ensure_ascii=False)
    raise ValueError("Invalid content format")


@app.get("/")
def index_page(request: Request):
    user = get_current_user(request)
    return templates.TemplateResponse(request, "index.html", {"user": user})


@app.get("/login")
def login_page(request: Request):
    user = get_current_user(request)
    if user:
        return RedirectResponse(url="/notes", status_code=302)
    return templates.TemplateResponse(request, "login.html", {"user": None})


@app.get("/register")
def register_page(request: Request):
    user = get_current_user(request)
    if user:
        return RedirectResponse(url="/notes", status_code=302)
    return templates.TemplateResponse(request, "register.html", {"user": None})


@app.get("/notes")
def notes_page(request: Request):
    user = get_current_user(request)
    if not user:
        return RedirectResponse(url="/login", status_code=302)
    return templates.TemplateResponse(request, "notes.html", {"user": user})


@app.get("/editor/{note_id}")
def editor_page(request: Request, note_id: int):
    user = get_current_user(request)
    if not user:
        return RedirectResponse(url="/login", status_code=302)
    return templates.TemplateResponse(request, "editor.html", {"user": user, "note_id": note_id})


@app.post("/api/register")
async def api_register(request: Request):
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"detail": "잘못된 요청 형식입니다."}, status_code=400)

    username = str(body.get("username", "")).strip()
    password = str(body.get("password", ""))

    if len(username) < 2 or len(password) < 4:
        return JSONResponse({"detail": "아이디는 2자 이상, 비밀번호는 4자 이상이어야 합니다."}, status_code=400)

    conn = get_db()
    existing = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if existing:
        conn.close()
        return JSONResponse({"detail": "이미 존재하는 아이디입니다."}, status_code=409)

    pw_hash = hash_password(password)
    cursor = conn.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username, pw_hash),
    )
    conn.commit()
    user_id = cursor.lastrowid
    conn.close()

    return JSONResponse({"message": "회원가입이 완료되었습니다.", "id": user_id, "username": username}, status_code=201)


@app.post("/api/login")
async def api_login(request: Request):
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"detail": "잘못된 요청 형식입니다."}, status_code=400)

    username = str(body.get("username", "")).strip()
    password = str(body.get("password", ""))

    if not username or not password:
        return JSONResponse({"detail": "아이디와 비밀번호를 입력해주세요."}, status_code=400)

    conn = get_db()
    user = conn.execute("SELECT id, username, password_hash FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()

    if not user or not verify_password(password, user["password_hash"]):
        return JSONResponse({"detail": "아이디 또는 비밀번호가 올바르지 않습니다."}, status_code=401)

    request.session["user_id"] = user["id"]
    request.session["username"] = user["username"]
    return {"message": "로그인 성공", "id": user["id"], "username": user["username"]}


@app.post("/api/logout")
def api_logout(request: Request):
    request.session.clear()
    return {"message": "로그아웃되었습니다."}


@app.get("/api/me")
def api_me(request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse({"detail": "로그인이 필요합니다."}, status_code=401)
    return user


@app.get("/api/notes")
def api_list_notes(request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse({"detail": "로그인이 필요합니다."}, status_code=401)

    conn = get_db()
    rows = conn.execute(
        "SELECT id, title, subject, updated_at FROM notes WHERE user_id = ? ORDER BY updated_at DESC, id DESC",
        (user["id"],),
    ).fetchall()
    conn.close()

    notes = [
        {
            "id": row["id"],
            "title": row["title"],
            "subject": row["subject"],
            "updated_at": row["updated_at"],
        }
        for row in rows
    ]
    return {"notes": notes}


@app.post("/api/notes")
async def api_create_note(request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse({"detail": "로그인이 필요합니다."}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"detail": "잘못된 요청 형식입니다."}, status_code=400)

    title = str(body.get("title", "")).strip() or "새 노트"
    subject = str(body.get("subject", "")).strip()

    try:
        content_json = normalize_content_json(body.get("content"), title, subject)
    except Exception:
        return JSONResponse({"detail": "유효한 JSON 블록 데이터가 아닙니다."}, status_code=400)

    updated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_db()
    cursor = conn.execute(
        "INSERT INTO notes (user_id, title, subject, content_json, updated_at) VALUES (?, ?, ?, ?, ?)",
        (user["id"], title, subject, content_json, updated_at),
    )
    conn.commit()
    note_id = cursor.lastrowid
    conn.close()

    return JSONResponse(
        {
            "id": note_id,
            "title": title,
            "subject": subject,
            "content": json.loads(content_json),
            "updated_at": updated_at,
        },
        status_code=201,
    )


@app.get("/api/notes/{note_id}")
def api_get_note(request: Request, note_id: int):
    user = get_current_user(request)
    if not user:
        return JSONResponse({"detail": "로그인이 필요합니다."}, status_code=401)

    conn = get_db()
    row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    conn.close()

    if not row:
        return JSONResponse({"detail": "노트를 찾을 수 없습니다."}, status_code=404)
    if row["user_id"] != user["id"]:
        return JSONResponse({"detail": "접근 권한이 없습니다."}, status_code=403)

    return {
        "id": row["id"],
        "title": row["title"],
        "subject": row["subject"],
        "content": json.loads(row["content_json"]),
        "updated_at": row["updated_at"],
    }


@app.put("/api/notes/{note_id}")
async def api_update_note(request: Request, note_id: int):
    user = get_current_user(request)
    if not user:
        return JSONResponse({"detail": "로그인이 필요합니다."}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"detail": "잘못된 요청 형식입니다."}, status_code=400)

    conn = get_db()
    row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    if not row:
        conn.close()
        return JSONResponse({"detail": "노트를 찾을 수 없습니다."}, status_code=404)
    if row["user_id"] != user["id"]:
        conn.close()
        return JSONResponse({"detail": "접근 권한이 없습니다."}, status_code=403)

    title = str(body.get("title", row["title"])).strip() or row["title"]
    subject = str(body.get("subject", row["subject"])).strip()

    if "content" in body:
        try:
            content_json = normalize_content_json(body.get("content"), title, subject)
        except Exception:
            conn.close()
            return JSONResponse({"detail": "유효한 JSON 블록 데이터가 아닙니다."}, status_code=400)
    else:
        content_json = row["content_json"]

    updated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn.execute(
        "UPDATE notes SET title = ?, subject = ?, content_json = ?, updated_at = ? WHERE id = ? AND user_id = ?",
        (title, subject, content_json, updated_at, note_id, user["id"]),
    )
    conn.commit()
    conn.close()

    return {
        "id": note_id,
        "title": title,
        "subject": subject,
        "content": json.loads(content_json),
        "updated_at": updated_at,
    }


@app.delete("/api/notes/{note_id}")
def api_delete_note(request: Request, note_id: int):
    user = get_current_user(request)
    if not user:
        return JSONResponse({"detail": "로그인이 필요합니다."}, status_code=401)

    conn = get_db()
    row = conn.execute("SELECT user_id FROM notes WHERE id = ?", (note_id,)).fetchone()
    if not row:
        conn.close()
        return JSONResponse({"detail": "노트를 찾을 수 없습니다."}, status_code=404)
    if row["user_id"] != user["id"]:
        conn.close()
        return JSONResponse({"detail": "접근 권한이 없습니다."}, status_code=403)

    conn.execute("DELETE FROM notes WHERE id = ? AND user_id = ?", (note_id, user["id"]))
    conn.commit()
    conn.close()
    return {"message": "노트가 삭제되었습니다."}


@app.get("/api/templates")
def api_list_templates(request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse({"detail": "로그인이 필요합니다."}, status_code=401)

    conn = get_db()
    rows = conn.execute(
        "SELECT id, name FROM templates WHERE user_id = ? ORDER BY id DESC",
        (user["id"],),
    ).fetchall()
    conn.close()

    items = [{"id": row["id"], "name": row["name"]} for row in rows]
    return {"templates": items}


@app.post("/api/templates")
async def api_create_template(request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse({"detail": "로그인이 필요합니다."}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"detail": "잘못된 요청 형식입니다."}, status_code=400)

    name = str(body.get("name", "")).strip()
    if not name:
        return JSONResponse({"detail": "템플릿 이름을 입력해주세요."}, status_code=400)

    try:
        content_json = normalize_content_json(body.get("content"), name, "")
    except Exception:
        return JSONResponse({"detail": "유효한 JSON 템플릿 데이터가 아닙니다."}, status_code=400)

    conn = get_db()
    cursor = conn.execute(
        "INSERT INTO templates (user_id, name, content_json) VALUES (?, ?, ?)",
        (user["id"], name, content_json),
    )
    conn.commit()
    template_id = cursor.lastrowid
    conn.close()

    return JSONResponse(
        {
            "id": template_id,
            "name": name,
            "content": json.loads(content_json),
        },
        status_code=201,
    )


@app.get("/api/templates/{template_id}")
def api_get_template(request: Request, template_id: int):
    user = get_current_user(request)
    if not user:
        return JSONResponse({"detail": "로그인이 필요합니다."}, status_code=401)

    conn = get_db()
    row = conn.execute("SELECT * FROM templates WHERE id = ?", (template_id,)).fetchone()
    conn.close()

    if not row:
        return JSONResponse({"detail": "템플릿을 찾을 수 없습니다."}, status_code=404)
    if row["user_id"] != user["id"]:
        return JSONResponse({"detail": "접근 권한이 없습니다."}, status_code=403)

    return {
        "id": row["id"],
        "name": row["name"],
        "content": json.loads(row["content_json"]),
    }


@app.put("/api/templates/{template_id}")
async def api_update_template(request: Request, template_id: int):
    user = get_current_user(request)
    if not user:
        return JSONResponse({"detail": "로그인이 필요합니다."}, status_code=401)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"detail": "잘못된 요청 형식입니다."}, status_code=400)

    conn = get_db()
    row = conn.execute("SELECT * FROM templates WHERE id = ?", (template_id,)).fetchone()
    if not row:
        conn.close()
        return JSONResponse({"detail": "템플릿을 찾을 수 없습니다."}, status_code=404)
    if row["user_id"] != user["id"]:
        conn.close()
        return JSONResponse({"detail": "접근 권한이 없습니다."}, status_code=403)

    name = str(body.get("name", row["name"])).strip() or row["name"]
    if "content" in body:
        try:
            content_json = normalize_content_json(body.get("content"), name, "")
        except Exception:
            conn.close()
            return JSONResponse({"detail": "유효한 JSON 템플릿 데이터가 아닙니다."}, status_code=400)
    else:
        content_json = row["content_json"]

    conn.execute(
        "UPDATE templates SET name = ?, content_json = ? WHERE id = ? AND user_id = ?",
        (name, content_json, template_id, user["id"]),
    )
    conn.commit()
    conn.close()

    return {
        "id": template_id,
        "name": name,
        "content": json.loads(content_json),
    }


@app.delete("/api/templates/{template_id}")
def api_delete_template(request: Request, template_id: int):
    user = get_current_user(request)
    if not user:
        return JSONResponse({"detail": "로그인이 필요합니다."}, status_code=401)

    conn = get_db()
    row = conn.execute("SELECT user_id FROM templates WHERE id = ?", (template_id,)).fetchone()
    if not row:
        conn.close()
        return JSONResponse({"detail": "템플릿을 찾을 수 없습니다."}, status_code=404)
    if row["user_id"] != user["id"]:
        conn.close()
        return JSONResponse({"detail": "접근 권한이 없습니다."}, status_code=403)

    conn.execute("DELETE FROM templates WHERE id = ? AND user_id = ?", (template_id, user["id"]))
    conn.commit()
    conn.close()
    return {"message": "템플릿이 삭제되었습니다."}
