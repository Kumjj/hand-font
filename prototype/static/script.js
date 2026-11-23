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
    const canvasEl = document.getElementById("page-canvas");
    const msgEl = document.getElementById("editor-message");
    const templateSelect = document.getElementById("template-select");
    const inspectorEmpty = document.getElementById("block-inspector-empty");
    const inspectorEl = document.getElementById("block-inspector");
    const propType = document.getElementById("prop-type");
    const propContent = document.getElementById("prop-content");
    const propX = document.getElementById("prop-x");
    const propY = document.getElementById("prop-y");
    const propWidth = document.getElementById("prop-width");
    const propHeight = document.getElementById("prop-height");
    const propZ = document.getElementById("prop-z");

    let docData = {
        title: "",
        subject: "",
        page: { width: 210, height: 297, unit: "mm" },
        blocks: [],
    };
    let selectedBlockId = null;

    function syncJsonFromDoc() {
        docData.title = titleInput.value.trim();
        docData.subject = subjectInput.value.trim();
        jsonTextarea.value = JSON.stringify(docData, null, 2);
    }

    function renderInspector() {
        const block = (docData.blocks || []).find((b) => b.id === selectedBlockId);
        if (!block) {
            inspectorEmpty.classList.remove("hidden");
            inspectorEl.classList.add("hidden");
            return;
        }
        inspectorEmpty.classList.add("hidden");
        inspectorEl.classList.remove("hidden");
        propType.value = block.type || "text";
        propContent.value = block.content || "";
        propX.value = block.x ?? 0.1;
        propY.value = block.y ?? 0.1;
        propWidth.value = block.width ?? 0.4;
        propHeight.value = block.height ?? 0.08;
        propZ.value = block.zIndex ?? 1;
    }

    function renderCanvas() {
        canvasEl.innerHTML = "";
        const blocks = Array.isArray(docData.blocks) ? docData.blocks : [];
        blocks.forEach((b) => {
            const el = document.createElement("div");
            el.className = `canvas-block type-${b.type || "text"}${b.id === selectedBlockId ? " selected" : ""}`;
            el.style.left = `${(b.x ?? 0.1) * 100}%`;
            el.style.top = `${(b.y ?? 0.1) * 100}%`;
            el.style.width = `${(b.width ?? 0.4) * 100}%`;
            el.style.height = `${(b.height ?? 0.08) * 100}%`;
            el.style.zIndex = b.zIndex ?? 1;

            const tag = document.createElement("div");
            tag.className = "block-tag";
            tag.textContent = b.type || "text";

            const body = document.createElement("div");
            body.textContent = b.content || "";

            el.appendChild(tag);
            el.appendChild(body);

            el.addEventListener("mousedown", (e) => {
                e.preventDefault();
                selectedBlockId = b.id;
                renderInspector();
                const rect = canvasEl.getBoundingClientRect();
                const startX = e.clientX;
                const startY = e.clientY;
                const origX = b.x ?? 0.1;
                const origY = b.y ?? 0.1;

                function onMove(ev) {
                    const dx = (ev.clientX - startX) / rect.width;
                    const dy = (ev.clientY - startY) / rect.height;
                    b.x = Math.max(0, Math.min(1 - (b.width ?? 0.2), Number((origX + dx).toFixed(3))));
                    b.y = Math.max(0, Math.min(1 - (b.height ?? 0.06), Number((origY + dy).toFixed(3))));
                    el.style.left = `${b.x * 100}%`;
                    el.style.top = `${b.y * 100}%`;
                    propX.value = b.x;
                    propY.value = b.y;
                    syncJsonFromDoc();
                }

                function onUp() {
                    window.removeEventListener("mousemove", onMove);
                    window.removeEventListener("mouseup", onUp);
                    renderCanvas();
                }

                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
            });

            canvasEl.appendChild(el);
        });
    }

    function updateSelectedBlock() {
        const block = (docData.blocks || []).find((b) => b.id === selectedBlockId);
        if (!block) return;
        block.type = propType.value;
        block.content = propContent.value;
        block.x = Number(propX.value) || 0;
        block.y = Number(propY.value) || 0;
        block.width = Math.max(0.05, Number(propWidth.value) || 0.3);
        block.height = Math.max(0.04, Number(propHeight.value) || 0.08);
        block.zIndex = parseInt(propZ.value, 10) || 1;
        syncJsonFromDoc();
        renderCanvas();
    }

    [propType, propContent, propX, propY, propWidth, propHeight, propZ].forEach((input) => {
        input.addEventListener("input", updateSelectedBlock);
    });

    document.getElementById("delete-block-btn").addEventListener("click", () => {
        docData.blocks = (docData.blocks || []).filter((b) => b.id !== selectedBlockId);
        selectedBlockId = null;
        syncJsonFromDoc();
        renderInspector();
        renderCanvas();
    });

    function addNewBlock(type) {
        if (!Array.isArray(docData.blocks)) docData.blocks = [];
        const newBlock = {
            id: `block_${Date.now()}`,
            type,
            content: type === "math" ? "a^2 + b^2 = c^2" : "새 텍스트 블록",
            x: 0.1,
            y: Math.min(0.85, 0.1 + docData.blocks.length * 0.1),
            width: 0.5,
            height: 0.09,
            zIndex: docData.blocks.length + 1,
        };
        docData.blocks.push(newBlock);
        selectedBlockId = newBlock.id;
        syncJsonFromDoc();
        renderInspector();
        renderCanvas();
    }

    document.getElementById("add-text-btn").addEventListener("click", () => addNewBlock("text"));
    document.getElementById("add-math-btn").addEventListener("click", () => addNewBlock("math"));

    document.getElementById("ai-placeholder-btn").addEventListener("click", () => {
        showMessage(msgEl, "AI 모델(YOLO/PaddleOCR/UniMERNet) 연동이 아직 보류 상태입니다. 모델이 준비되면 자동 분석 블록이 추가됩니다.");
    });

    document.getElementById("apply-json-btn").addEventListener("click", () => {
        try {
            const parsed = JSON.parse(jsonTextarea.value);
            if (!Array.isArray(parsed.blocks)) parsed.blocks = [];
            docData = parsed;
            selectedBlockId = null;
            renderInspector();
            renderCanvas();
            showMessage(msgEl, "JSON 데이터를 캔버스에 반영했습니다.");
        } catch {
            showMessage(msgEl, "유효한 JSON 형식이 아닙니다.", true);
        }
    });

    async function loadNote() {
        try {
            const note = await requestJson(`/api/notes/${noteId}`);
            titleInput.value = note.title;
            subjectInput.value = note.subject || "";
            docData = note.content || { page: { width: 210, height: 297, unit: "mm" }, blocks: [] };
            if (!Array.isArray(docData.blocks)) docData.blocks = [];
            syncJsonFromDoc();
            renderInspector();
            renderCanvas();
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

    document.getElementById("insert-sample-btn").addEventListener("click", () => {
        docData = {
            title: titleInput.value || "수학 필기",
            subject: subjectInput.value || "수학",
            page: { width: 210, height: 297, unit: "mm" },
            blocks: [
                {
                    id: "block_1",
                    type: "text",
                    content: "이차방정식의 근의 공식",
                    x: 0.1,
                    y: 0.12,
                    width: 0.6,
                    height: 0.08,
                    zIndex: 1,
                },
                {
                    id: "block_2",
                    type: "math",
                    content: "x = (-b ± √(b² - 4ac)) / 2a",
                    x: 0.1,
                    y: 0.24,
                    width: 0.65,
                    height: 0.1,
                    zIndex: 2,
                },
            ],
        };
        selectedBlockId = "block_1";
        syncJsonFromDoc();
        renderInspector();
        renderCanvas();
    });

    document.getElementById("save-note-btn").addEventListener("click", async () => {
        try {
            syncJsonFromDoc();
            const updated = await requestJson(`/api/notes/${noteId}`, {
                method: "PUT",
                body: JSON.stringify({
                    title: titleInput.value.trim(),
                    subject: subjectInput.value.trim(),
                    content: docData,
                }),
            });
            docData = updated.content;
            syncJsonFromDoc();
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
            syncJsonFromDoc();
            await requestJson("/api/templates", {
                method: "POST",
                body: JSON.stringify({ name, content: docData }),
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
            const currentBlocks = Array.isArray(docData.blocks) ? docData.blocks : [];
            const tplBlocks = Array.isArray(tpl.content.blocks) ? tpl.content.blocks : [];
            const copiedBlocks = tplBlocks.map((block, idx) => ({
                ...block,
                id: `${block.id || "block"}_${Date.now()}_${idx}`,
            }));
            docData.blocks = [...currentBlocks, ...copiedBlocks];
            syncJsonFromDoc();
            renderCanvas();
            showMessage(msgEl, "템플릿 블록을 현재 노트에 불러왔습니다.");
        } catch (err) {
            showMessage(msgEl, err.message, true);
        }
    });

    loadNote();
    loadTemplateOptions();
}
