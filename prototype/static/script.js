async function requestJson(url, options = {}) {
    const response = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.detail || "요청 처리 중 오류가 발생했습니다.");
    }
    return data;
}

function showMessage(el, text, isError = false) {
    if (!el) return;
    el.textContent = text;
    el.className = isError ? "message error" : "message";
}

const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
        await requestJson("/api/logout", { method: "POST" });
        window.location.href = "/login";
    });
}

const registerForm = document.getElementById("register-form");
if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const msg = document.getElementById("auth-message");
        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;
        try {
            await requestJson("/api/register", {
                method: "POST",
                body: JSON.stringify({ username, password }),
            });
            showMessage(msg, "회원가입 완료. 로그인 페이지로 이동합니다.");
            setTimeout(() => {
                window.location.href = "/login";
            }, 600);
        } catch (err) {
            showMessage(msg, err.message, true);
        }
    });
}

const loginForm = document.getElementById("login-form");
if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const msg = document.getElementById("auth-message");
        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;
        try {
            await requestJson("/api/login", {
                method: "POST",
                body: JSON.stringify({ username, password }),
            });
            window.location.href = "/notes";
        } catch (err) {
            showMessage(msg, err.message, true);
        }
    });
}

const mainEl = document.querySelector("main[data-page]");
const currentPage = mainEl ? mainEl.dataset.page : "";

if (currentPage === "notes") {
    const notesListEl = document.getElementById("notes-list");
    const templatesListEl = document.getElementById("templates-list");
    const msgEl = document.getElementById("notes-message");

    async function loadNotes() {
        const data = await requestJson("/api/notes");
        notesListEl.innerHTML = "";
        if (data.notes.length === 0) {
            notesListEl.innerHTML = "<p class='item-meta'>저장된 노트가 없습니다.</p>";
            return;
        }
        data.notes.forEach((note) => {
            const row = document.createElement("div");
            row.className = "item-row";
            row.innerHTML = `
                <div>
                    <strong>${note.title}</strong>
                    <div class="item-meta">과목: ${note.subject || "-"} | 수정: ${note.updated_at}</div>
                </div>
                <div class="actions">
                    <a href="/editor/${note.id}" class="btn btn-primary">열기</a>
                    <button type="button" class="btn btn-danger" data-delete-note="${note.id}">삭제</button>
                </div>
            `;
            notesListEl.appendChild(row);
        });
    }

    async function loadTemplates() {
        const data = await requestJson("/api/templates");
        templatesListEl.innerHTML = "";
        if (data.templates.length === 0) {
            templatesListEl.innerHTML = "<p class='item-meta'>저장된 템플릿이 없습니다.</p>";
            return;
        }
        data.templates.forEach((tpl) => {
            const row = document.createElement("div");
            row.className = "item-row";
            row.innerHTML = `
                <div>
                    <strong>${tpl.name}</strong>
                    <div class="item-meta">ID: ${tpl.id}</div>
                </div>
                <div class="actions">
                    <button type="button" class="btn btn-secondary" data-rename-template="${tpl.id}" data-current-name="${tpl.name}">이름 수정</button>
                    <button type="button" class="btn btn-danger" data-delete-template="${tpl.id}">삭제</button>
                </div>
            `;
            templatesListEl.appendChild(row);
        });
    }

    document.getElementById("create-note-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const title = document.getElementById("new-note-title").value.trim();
        const subject = document.getElementById("new-note-subject").value.trim();
        try {
            const created = await requestJson("/api/notes", {
                method: "POST",
                body: JSON.stringify({ title, subject }),
            });
            window.location.href = `/editor/${created.id}`;
        } catch (err) {
            showMessage(msgEl, err.message, true);
        }
    });

    notesListEl.addEventListener("click", async (e) => {
        const noteId = e.target.dataset.deleteNote;
        if (!noteId) return;
        try {
            await requestJson(`/api/notes/${noteId}`, { method: "DELETE" });
            showMessage(msgEl, "노트가 삭제되었습니다.");
            await loadNotes();
        } catch (err) {
            showMessage(msgEl, err.message, true);
        }
    });

    templatesListEl.addEventListener("click", async (e) => {
        const deleteId = e.target.dataset.deleteTemplate;
        if (deleteId) {
            try {
                await requestJson(`/api/templates/${deleteId}`, { method: "DELETE" });
                showMessage(msgEl, "템플릿이 삭제되었습니다.");
                await loadTemplates();
            } catch (err) {
                showMessage(msgEl, err.message, true);
            }
            return;
        }
        const renameId = e.target.dataset.renameTemplate;
        if (renameId) {
            const nextName = prompt("새 템플릿 이름을 입력하세요:", e.target.dataset.currentName || "");
            if (!nextName || !nextName.trim()) return;
            try {
                await requestJson(`/api/templates/${renameId}`, {
                    method: "PUT",
                    body: JSON.stringify({ name: nextName.trim() }),
                });
                showMessage(msgEl, "템플릿 이름이 수정되었습니다.");
                await loadTemplates();
            } catch (err) {
                showMessage(msgEl, err.message, true);
            }
        }
    });

    loadNotes();
    loadTemplates();
}

if (currentPage === "editor") {
    const noteId = mainEl.dataset.noteId;
    const titleInput = document.getElementById("editor-title");
    const subjectInput = document.getElementById("editor-subject");
    const jsonTextarea = document.getElementById("editor-json");
    const previewEl = document.getElementById("blocks-preview");
    const msgEl = document.getElementById("editor-message");
    const templateSelect = document.getElementById("template-select");

    function renderBlocksPreview() {
        previewEl.innerHTML = "";
        try {
            const parsed = JSON.parse(jsonTextarea.value);
            const blocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
            if (blocks.length === 0) {
                previewEl.innerHTML = "<p class='item-meta'>블록이 없습니다.</p>";
                return;
            }
            blocks.forEach((b) => {
                const row = document.createElement("div");
                row.className = "item-row";
                row.innerHTML = `
                    <div>
                        <strong>[${b.type || "text"}] ${b.id || ""}</strong>
                        <div>${b.content || ""}</div>
                        <div class="item-meta">x: ${b.x ?? 0}, y: ${b.y ?? 0}, w: ${b.width ?? 0}, h: ${b.height ?? 0}, z: ${b.zIndex ?? 1}</div>
                    </div>
                `;
                previewEl.appendChild(row);
            });
        } catch {
            previewEl.innerHTML = "<p class='message error'>JSON 형식이 올바르지 않습니다.</p>";
        }
    }

    async function loadNote() {
        try {
            const note = await requestJson(`/api/notes/${noteId}`);
            titleInput.value = note.title;
            subjectInput.value = note.subject || "";
            jsonTextarea.value = JSON.stringify(note.content, null, 2);
            renderBlocksPreview();
        } catch (err) {
            showMessage(msgEl, err.message, true);
        }
    }

    async function loadTemplateOptions() {
        const data = await requestJson("/api/templates");
        templateSelect.innerHTML = "<option value=''>불러올 템플릿 선택</option>";
        data.templates.forEach((tpl) => {
            const option = document.createElement("option");
            option.value = tpl.id;
            option.textContent = tpl.name;
            templateSelect.appendChild(option);
        });
    }

    jsonTextarea.addEventListener("input", renderBlocksPreview);

    document.getElementById("insert-sample-btn").addEventListener("click", () => {
        const sample = {
            title: titleInput.value || "수학 필기",
            subject: subjectInput.value || "수학",
            page: { width: 210, height: 297, unit: "mm" },
            blocks: [
                {
                    id: "block_1",
                    type: "text",
                    content: "이차방정식의 근의 공식",
                    x: 0.1,
                    y: 0.2,
                    width: 0.6,
                    height: 0.08,
                    zIndex: 1,
                },
                {
                    id: "block_2",
                    type: "math",
                    content: "x^2+2x+1=0",
                    x: 0.1,
                    y: 0.3,
                    width: 0.5,
                    height: 0.1,
                    zIndex: 2,
                },
            ],
        };
        jsonTextarea.value = JSON.stringify(sample, null, 2);
        renderBlocksPreview();
    });

    document.getElementById("save-note-btn").addEventListener("click", async () => {
        try {
            const parsedContent = JSON.parse(jsonTextarea.value);
            const updated = await requestJson(`/api/notes/${noteId}`, {
                method: "PUT",
                body: JSON.stringify({
                    title: titleInput.value.trim(),
                    subject: subjectInput.value.trim(),
                    content: parsedContent,
                }),
            });
            jsonTextarea.value = JSON.stringify(updated.content, null, 2);
            renderBlocksPreview();
            showMessage(msgEl, `노트가 저장되었습니다. (${updated.updated_at})`);
        } catch (err) {
            showMessage(msgEl, err.message, true);
        }
    });

    document.getElementById("save-template-btn").addEventListener("click", async () => {
        const name = document.getElementById("template-name-input").value.trim();
        if (!name) {
            showMessage(msgEl, "템플릿 이름을 입력해주세요.", true);
            return;
        }
        try {
            const parsedContent = JSON.parse(jsonTextarea.value);
            await requestJson("/api/templates", {
                method: "POST",
                body: JSON.stringify({ name, content: parsedContent }),
            });
            document.getElementById("template-name-input").value = "";
            showMessage(msgEl, "템플릿이 저장되었습니다.");
            await loadTemplateOptions();
        } catch (err) {
            showMessage(msgEl, err.message, true);
        }
    });

    document.getElementById("load-template-btn").addEventListener("click", async () => {
        const templateId = templateSelect.value;
        if (!templateId) {
            showMessage(msgEl, "불러올 템플릿을 선택해주세요.", true);
            return;
        }
        try {
            const tpl = await requestJson(`/api/templates/${templateId}`);
            let currentData = {};
            try {
                currentData = JSON.parse(jsonTextarea.value);
            } catch {
                currentData = {};
            }
            const currentBlocks = Array.isArray(currentData.blocks) ? currentData.blocks : [];
            const tplBlocks = Array.isArray(tpl.content.blocks) ? tpl.content.blocks : [];
            const copiedBlocks = tplBlocks.map((block, idx) => ({
                ...block,
                id: `${block.id || "block"}_${Date.now()}_${idx}`,
            }));
            const merged = {
                ...tpl.content,
                ...currentData,
                title: titleInput.value.trim() || currentData.title || "",
                subject: subjectInput.value.trim() || currentData.subject || "",
                blocks: [...currentBlocks, ...copiedBlocks],
            };
            jsonTextarea.value = JSON.stringify(merged, null, 2);
            renderBlocksPreview();
            showMessage(msgEl, "템플릿 블록을 현재 노트에 불러왔습니다.");
        } catch (err) {
            showMessage(msgEl, err.message, true);
        }
    });

    loadNote();
    loadTemplateOptions();
}
