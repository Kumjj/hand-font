import hashlib
import hmac
import json
import os
import sqlite3
from datetime import datetime
from fastapi import Body, FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "database.db")

app = FastAPI()
app.add_middleware(SessionMiddleware, secret_key=os.environ.get("SESSION_SECRET", "hand-font-dev-secret-key"))
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


with get_db() as conn:
    conn.execute("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL)")
    conn.execute("CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '', content_json TEXT NOT NULL, updated_at TEXT NOT NULL)")
    conn.execute("CREATE TABLE IF NOT EXISTS templates (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, content_json TEXT NOT NULL)")


def hash_password(password: str) -> str:
    salt = os.urandom(16).hex()
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 100000).hex()
    return f"{salt}:{hashed}"


def verify_password(password: str, stored_hash: str) -> bool:
    parts = stored_hash.split(":")
    if len(parts) != 2:
        return False
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(parts[0]), 100000).hex()
    return hmac.compare_digest(hashed, parts[1])


def current_user(request: Request):
    uid = request.session.get("user_id")
    uname = request.session.get("username")
    return {"id": uid, "username": uname} if uid and uname else None


def to_json_str(content, title="", subject=""):
    if content is None:
        return json.dumps({"title": title, "subject": subject, "page": {"width": 210, "height": 297, "unit": "mm"}, "blocks": []}, ensure_ascii=False)
    if isinstance(content, str):
        parsed = json.loads(content)
        if not isinstance(parsed, dict):
            raise ValueError
        return json.dumps(parsed, ensure_ascii=False)
    if isinstance(content, dict):
        return json.dumps(content, ensure_ascii=False)
    raise ValueError


def err(msg: str, code: int):
    return JSONResponse({"detail": msg}, status_code=code)


@app.get("/")
def index_page(request: Request):
    return templates.TemplateResponse(request, "index.html", {"user": current_user(request)})


@app.get("/login")
def login_page(request: Request):
    if current_user(request):
        return RedirectResponse("/notes", status_code=302)
    return templates.TemplateResponse(request, "login.html", {"user": None})


@app.get("/register")
def register_page(request: Request):
    if current_user(request):
        return RedirectResponse("/notes", status_code=302)
    return templates.TemplateResponse(request, "register.html", {"user": None})


@app.get("/notes")
def notes_page(request: Request):
    user = current_user(request)
    if not user:
        return RedirectResponse("/login", status_code=302)
    return templates.TemplateResponse(request, "notes.html", {"user": user})


@app.get("/editor/{note_id}")
def editor_page(request: Request, note_id: int):
    user = current_user(request)
    if not user:
        return RedirectResponse("/login", status_code=302)
    return templates.TemplateResponse(request, "editor.html", {"user": user, "note_id": note_id})


@app.post("/api/register")
def api_register(body: dict = Body(...)):
    username = str(body.get("username", "")).strip()
    password = str(body.get("password", ""))
    if len(username) < 2 or len(password) < 4:
        return err("아이디는 2자 이상, 비밀번호는 4자 이상이어야 합니다.", 400)
    with get_db() as conn:
        if conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone():
            return err("이미 존재하는 아이디입니다.", 409)
        cur = conn.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", (username, hash_password(password)))
        return JSONResponse({"message": "회원가입 완료", "id": cur.lastrowid, "username": username}, status_code=201)


@app.post("/api/login")
def api_login(request: Request, body: dict = Body(...)):
    username = str(body.get("username", "")).strip()
    password = str(body.get("password", ""))
    with get_db() as conn:
        user = conn.execute("SELECT id, username, password_hash FROM users WHERE username = ?", (username,)).fetchone()
    if not user or not verify_password(password, user["password_hash"]):
        return err("아이디 또는 비밀번호가 올바르지 않습니다.", 401)
    request.session["user_id"] = user["id"]
    request.session["username"] = user["username"]
    return {"message": "로그인 성공", "id": user["id"], "username": user["username"]}


@app.post("/api/logout")
def api_logout(request: Request):
    request.session.clear()
    return {"message": "로그아웃되었습니다."}


@app.get("/api/me")
def api_me(request: Request):
    user = current_user(request)
    return user if user else err("로그인이 필요합니다.", 401)


@app.get("/api/notes")
def api_list_notes(request: Request):
    user = current_user(request)
    if not user:
        return err("로그인이 필요합니다.", 401)
    with get_db() as conn:
        rows = conn.execute("SELECT id, title, subject, updated_at FROM notes WHERE user_id = ? ORDER BY updated_at DESC, id DESC", (user["id"],)).fetchall()
    return {"notes": [dict(r) for r in rows]}


@app.post("/api/notes")
def api_create_note(request: Request, body: dict = Body(...)):
    user = current_user(request)
    if not user:
        return err("로그인이 필요합니다.", 401)
    title = str(body.get("title", "")).strip() or "새 노트"
    subject = str(body.get("subject", "")).strip()
    try:
        content_json = to_json_str(body.get("content"), title, subject)
    except Exception:
        return err("유효한 JSON 데이터가 아닙니다.", 400)
    updated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as conn:
        cur = conn.execute("INSERT INTO notes (user_id, title, subject, content_json, updated_at) VALUES (?, ?, ?, ?, ?)", (user["id"], title, subject, content_json, updated_at))
        return JSONResponse({"id": cur.lastrowid, "title": title, "subject": subject, "content": json.loads(content_json), "updated_at": updated_at}, status_code=201)


@app.get("/api/notes/{note_id}")
def api_get_note(request: Request, note_id: int):
    user = current_user(request)
    if not user:
        return err("로그인이 필요합니다.", 401)
    with get_db() as conn:
        row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    if not row:
        return err("노트를 찾을 수 없습니다.", 404)
    if row["user_id"] != user["id"]:
        return err("접근 권한이 없습니다.", 403)
    return {"id": row["id"], "title": row["title"], "subject": row["subject"], "content": json.loads(row["content_json"]), "updated_at": row["updated_at"]}


@app.put("/api/notes/{note_id}")
def api_update_note(request: Request, note_id: int, body: dict = Body(...)):
    user = current_user(request)
    if not user:
        return err("로그인이 필요합니다.", 401)
    with get_db() as conn:
        row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
        if not row:
            return err("노트를 찾을 수 없습니다.", 404)
        if row["user_id"] != user["id"]:
            return err("접근 권한이 없습니다.", 403)
        title = str(body.get("title", row["title"])).strip() or row["title"]
        subject = str(body.get("subject", row["subject"])).strip()
        try:
            content_json = to_json_str(body["content"], title, subject) if "content" in body else row["content_json"]
        except Exception:
            return err("유효한 JSON 데이터가 아닙니다.", 400)
        updated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute("UPDATE notes SET title = ?, subject = ?, content_json = ?, updated_at = ? WHERE id = ? AND user_id = ?", (title, subject, content_json, updated_at, note_id, user["id"]))
    return {"id": note_id, "title": title, "subject": subject, "content": json.loads(content_json), "updated_at": updated_at}


@app.delete("/api/notes/{note_id}")
def api_delete_note(request: Request, note_id: int):
    user = current_user(request)
    if not user:
        return err("로그인이 필요합니다.", 401)
    with get_db() as conn:
        row = conn.execute("SELECT user_id FROM notes WHERE id = ?", (note_id,)).fetchone()
        if not row:
            return err("노트를 찾을 수 없습니다.", 404)
        if row["user_id"] != user["id"]:
            return err("접근 권한이 없습니다.", 403)
        conn.execute("DELETE FROM notes WHERE id = ? AND user_id = ?", (note_id, user["id"]))
    return {"message": "노트가 삭제되었습니다."}


@app.get("/api/templates")
def api_list_templates(request: Request):
    user = current_user(request)
    if not user:
        return err("로그인이 필요합니다.", 401)
    with get_db() as conn:
        rows = conn.execute("SELECT id, name FROM templates WHERE user_id = ? ORDER BY id DESC", (user["id"],)).fetchall()
    return {"templates": [dict(r) for r in rows]}


@app.post("/api/templates")
def api_create_template(request: Request, body: dict = Body(...)):
    user = current_user(request)
    if not user:
        return err("로그인이 필요합니다.", 401)
    name = str(body.get("name", "")).strip()
    if not name:
        return err("템플릿 이름을 입력해주세요.", 400)
    try:
        content_json = to_json_str(body.get("content"), name)
    except Exception:
        return err("유효한 JSON 데이터가 아닙니다.", 400)
    with get_db() as conn:
        cur = conn.execute("INSERT INTO templates (user_id, name, content_json) VALUES (?, ?, ?)", (user["id"], name, content_json))
        return JSONResponse({"id": cur.lastrowid, "name": name, "content": json.loads(content_json)}, status_code=201)


@app.get("/api/templates/{template_id}")
def api_get_template(request: Request, template_id: int):
    user = current_user(request)
    if not user:
        return err("로그인이 필요합니다.", 401)
    with get_db() as conn:
        row = conn.execute("SELECT * FROM templates WHERE id = ?", (template_id,)).fetchone()
    if not row:
        return err("템플릿을 찾을 수 없습니다.", 404)
    if row["user_id"] != user["id"]:
        return err("접근 권한이 없습니다.", 403)
    return {"id": row["id"], "name": row["name"], "content": json.loads(row["content_json"])}


@app.put("/api/templates/{template_id}")
def api_update_template(request: Request, template_id: int, body: dict = Body(...)):
    user = current_user(request)
    if not user:
        return err("로그인이 필요합니다.", 401)
    with get_db() as conn:
        row = conn.execute("SELECT * FROM templates WHERE id = ?", (template_id,)).fetchone()
        if not row:
            return err("템플릿을 찾을 수 없습니다.", 404)
        if row["user_id"] != user["id"]:
            return err("접근 권한이 없습니다.", 403)
        name = str(body.get("name", row["name"])).strip() or row["name"]
        try:
            content_json = to_json_str(body["content"], name) if "content" in body else row["content_json"]
        except Exception:
            return err("유효한 JSON 데이터가 아닙니다.", 400)
        conn.execute("UPDATE templates SET name = ?, content_json = ? WHERE id = ? AND user_id = ?", (name, content_json, template_id, user["id"]))
    return {"id": template_id, "name": name, "content": json.loads(content_json)}


@app.delete("/api/templates/{template_id}")
def api_delete_template(request: Request, template_id: int):
    user = current_user(request)
    if not user:
        return err("로그인이 필요합니다.", 401)
    with get_db() as conn:
        row = conn.execute("SELECT user_id FROM templates WHERE id = ?", (template_id,)).fetchone()
        if not row:
            return err("템플릿을 찾을 수 없습니다.", 404)
        if row["user_id"] != user["id"]:
            return err("접근 권한이 없습니다.", 403)
        conn.execute("DELETE FROM templates WHERE id = ? AND user_id = ?", (template_id, user["id"]))
    return {"message": "템플릿이 삭제되었습니다."}
