async function requestJson(url, options = {}) {
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || "요청 처리 중 오류가 발생했습니다.");
    return data;
}

function showMessage(el, text, isError = false) {
    if (!el) return;
    el.textContent = text;
    el.className = isError ? "message error" : "message";
}

function renderBlockBody(bodyEl, block) {
    const text = block.content || "";
    if ((block.type || "text") === "math" && window.katex) {
        window.katex.render(text, bodyEl, { throwOnError: false });
        return;
    }
    bodyEl.textContent = text;
}

const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
    logoutBtn.onclick = async () => {
        await requestJson("/api/logout", { method: "POST" });
        window.location.href = "/login";
    };
}

const registerForm = document.getElementById("register-form");
if (registerForm) {
    registerForm.onsubmit = async (e) => {
        e.preventDefault();
        const msg = document.getElementById("auth-message");
        try {
            await requestJson("/api/register", {
                method: "POST",
                body: JSON.stringify({ username: username.value, password: password.value }),
            });
            showMessage(msg, "회원가입 완료. 로그인 페이지로 이동합니다.");
            setTimeout(() => { window.location.href = "/login"; }, 600);
        } catch (err) {
            showMessage(msg, err.message, true);
        }
    };
}

const loginForm = document.getElementById("login-form");
if (loginForm) {
    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        const msg = document.getElementById("auth-message");
        try {
            await requestJson("/api/login", {
                method: "POST",
                body: JSON.stringify({ username: username.value, password: password.value }),
            });
            window.location.href = "/notes";
        } catch (err) {
            showMessage(msg, err.message, true);
        }
    };
}

const mainEl = document.querySelector("main[data-page]");
const currentPage = mainEl ? mainEl.dataset.page : "";

if (currentPage === "notes") {
    const notesListEl = document.getElementById("notes-list");
    const categoryTabsEl = document.getElementById("category-tabs");
    const catSelectEl = document.getElementById("new-note-category-select");
    const customCatInput = document.getElementById("new-note-subject");
    const templatesListEl = document.getElementById("templates-list");
    const msgEl = document.getElementById("notes-message");
    let allNotes = [];
    let selectedCategory = "__ALL__";

    const getCat = (n) => (n.subject || "").trim() || "기타";

    function renderNotes() {
        const cats = ["기타", ...Array.from(new Set(allNotes.map(getCat).filter((c) => c !== "기타"))).sort()];
        catSelectEl.innerHTML = cats.map((c) => `<option value="${c}">${c}</option>`).join("") + `<option value="__custom__">+ 새 카테고리 직접 입력</option>`;
        catSelectEl.value = selectedCategory !== "__ALL__" && cats.includes(selectedCategory) ? selectedCategory : "기타";
        customCatInput.classList.add("hidden");
        customCatInput.value = "";
        catSelectEl.classList.remove("hidden");

        const tabs = [{ key: "__ALL__", label: `전체 (${allNotes.length})` }, ...cats.map((c) => ({ key: c, label: `${c} (${allNotes.filter((n) => getCat(n) === c).length})` }))];
        categoryTabsEl.innerHTML = "";
        tabs.forEach((t) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = `cat-tab${selectedCategory === t.key ? " active" : ""}`;
            btn.textContent = t.label;
            btn.onclick = () => { selectedCategory = t.key; renderNotes(); };
            categoryTabsEl.appendChild(btn);
        });

        const filtered = selectedCategory === "__ALL__" ? allNotes : allNotes.filter((n) => getCat(n) === selectedCategory);
        notesListEl.innerHTML = filtered.length === 0 ? "<p class='item-meta'>저장된 노트가 없습니다.</p>" : "";
        filtered.forEach((n) => {
            const row = document.createElement("div");
            row.className = "item-row";
            row.innerHTML = `<div><strong>${n.title}</strong><div class="item-meta">카테고리: ${getCat(n)} | 수정: ${n.updated_at}</div></div><div class="actions"><a href="/editor/${n.id}" class="btn btn-primary">열기</a><button type="button" class="btn btn-danger" data-del-note="${n.id}">삭제</button></div>`;
            notesListEl.appendChild(row);
        });
    }

    async function loadNotes() {
        allNotes = (await requestJson("/api/notes")).notes || [];
        renderNotes();
    }

    async function loadTemplates() {
        const items = (await requestJson("/api/templates")).templates || [];
        templatesListEl.innerHTML = items.length === 0 ? "<p class='item-meta'>저장된 템플릿이 없습니다.</p>" : "";
        items.forEach((t) => {
            const row = document.createElement("div");
            row.className = "item-row";
            row.innerHTML = `<div><strong>${t.name}</strong><div class="item-meta">ID: ${t.id}</div></div><div class="actions"><button type="button" class="btn btn-secondary" data-rename-tpl="${t.id}" data-name="${t.name}">이름 수정</button><button type="button" class="btn btn-danger" data-del-tpl="${t.id}">삭제</button></div>`;
            templatesListEl.appendChild(row);
        });
    }

    catSelectEl.onchange = () => {
        if (catSelectEl.value === "__custom__") {
            catSelectEl.classList.add("hidden");
            customCatInput.classList.remove("hidden");
            customCatInput.focus();
        }
    };

    customCatInput.onkeydown = (e) => {
        if (e.key === "Escape") {
            customCatInput.classList.add("hidden");
            customCatInput.value = "";
            catSelectEl.value = "기타";
            catSelectEl.classList.remove("hidden");
        }
    };

    document.getElementById("create-note-form").onsubmit = async (e) => {
        e.preventDefault();
        const title = document.getElementById("new-note-title").value.trim();
        const subject = (!customCatInput.classList.contains("hidden") ? customCatInput.value.trim() : catSelectEl.value.trim()) || "기타";
        try {
            const created = await requestJson("/api/notes", { method: "POST", body: JSON.stringify({ title, subject }) });
            window.location.href = `/editor/${created.id}`;
        } catch (err) {
            showMessage(msgEl, err.message, true);
        }
    };

    notesListEl.onclick = async (e) => {
        const id = e.target.dataset.delNote;
        if (!id) return;
        try {
            await requestJson(`/api/notes/${id}`, { method: "DELETE" });
            showMessage(msgEl, "노트가 삭제되었습니다.");
            await loadNotes();
        } catch (err) {
            showMessage(msgEl, err.message, true);
        }
    };

    templatesListEl.onclick = async (e) => {
        const delId = e.target.dataset.delTpl;
        if (delId) {
            await requestJson(`/api/templates/${delId}`, { method: "DELETE" });
            showMessage(msgEl, "템플릿이 삭제되었습니다.");
            return loadTemplates();
        }
        const renameId = e.target.dataset.renameTpl;
        if (renameId) {
            const nextName = prompt("새 템플릿 이름:", e.target.dataset.name || "");
            if (!nextName || !nextName.trim()) return;
            await requestJson(`/api/templates/${renameId}`, { method: "PUT", body: JSON.stringify({ name: nextName.trim() }) });
            showMessage(msgEl, "템플릿 이름이 수정되었습니다.");
            await loadTemplates();
        }
    };

    loadNotes();
    loadTemplates();
}

if (currentPage === "editor") {
    const noteId = mainEl.dataset.noteId;
    const titleInput = document.getElementById("editor-title");
    const subjectInput = document.getElementById("editor-subject");
    const jsonTextarea = document.getElementById("editor-json");
    const canvasEl = document.getElementById("page-canvas");
    const canvasHeading = document.getElementById("canvas-heading");
    const togglePreviewBtn = document.getElementById("toggle-preview-btn");
    const msgEl = document.getElementById("editor-message");
    const templateSelect = document.getElementById("template-select");
    const inspectorEmpty = document.getElementById("block-inspector-empty");
    const inspectorEl = document.getElementById("block-inspector");
    const propFields = ["prop-type", "prop-content", "prop-x", "prop-y", "prop-width", "prop-height", "prop-z"].map((id) => document.getElementById(id));

    let docData = { title: "", subject: "", page: { width: 210, height: 297, unit: "mm" }, blocks: [] };
    let selectedBlockId = null;
    let isPreviewMode = false;

    const syncJson = () => {
        docData.title = titleInput.value.trim();
        docData.subject = subjectInput.value.trim();
        jsonTextarea.value = JSON.stringify(docData, null, 2);
    };

    function renderInspector() {
        const block = (docData.blocks || []).find((b) => b.id === selectedBlockId);
        const show = Boolean(block && !isPreviewMode);
        inspectorEmpty.classList.toggle("hidden", show);
        inspectorEl.classList.toggle("hidden", !show);
        if (!show) return;
        propFields[0].value = block.type || "text";
        propFields[1].value = block.content || "";
        propFields[2].value = block.x ?? 0.1;
        propFields[3].value = block.y ?? 0.1;
        propFields[4].value = block.width ?? 0.4;
        propFields[5].value = block.height ?? 0.08;
        propFields[6].value = block.zIndex ?? 1;
    }

    function renderCanvas() {
        canvasEl.classList.toggle("preview-mode", isPreviewMode);
        canvasEl.innerHTML = "";
        (docData.blocks || []).forEach((b) => {
            const el = document.createElement("div");
            el.className = `canvas-block type-${b.type || "text"}${!isPreviewMode && b.id === selectedBlockId ? " selected" : ""}`;
            el.style.left = `${(b.x ?? 0.1) * 100}%`;
            el.style.top = `${(b.y ?? 0.1) * 100}%`;
            el.style.width = `${(b.width ?? 0.4) * 100}%`;
            el.style.height = `${(b.height ?? 0.08) * 100}%`;
            el.style.zIndex = b.zIndex ?? 1;
            el.innerHTML = `<div class="block-tag">${b.type || "text"}</div><div></div>`;
            renderBlockBody(el.lastChild, b);

            if (!isPreviewMode) {
                el.onmousedown = (e) => {
                    e.preventDefault();
                    selectedBlockId = b.id;
                    renderInspector();
                    const rect = canvasEl.getBoundingClientRect();
                    const sx = e.clientX, sy = e.clientY, ox = b.x ?? 0.1, oy = b.y ?? 0.1;
                    const onMove = (ev) => {
                        b.x = Math.max(0, Math.min(1 - (b.width ?? 0.2), Number((ox + (ev.clientX - sx) / rect.width).toFixed(3))));
                        b.y = Math.max(0, Math.min(1 - (b.height ?? 0.06), Number((oy + (ev.clientY - sy) / rect.height).toFixed(3))));
                        el.style.left = `${b.x * 100}%`;
                        el.style.top = `${b.y * 100}%`;
                        propFields[2].value = b.x;
                        propFields[3].value = b.y;
                        syncJson();
                    };
                    const onUp = () => {
                        window.removeEventListener("mousemove", onMove);
                        window.removeEventListener("mouseup", onUp);
                        renderCanvas();
                    };
                    window.addEventListener("mousemove", onMove);
                    window.addEventListener("mouseup", onUp);
                };
            }
            canvasEl.appendChild(el);
        });
    }

    propFields.forEach((f) => f.addEventListener("input", () => {
        const b = (docData.blocks || []).find((x) => x.id === selectedBlockId);
        if (!b) return;
        b.type = propFields[0].value;
        b.content = propFields[1].value;
        b.x = Number(propFields[2].value) || 0;
        b.y = Number(propFields[3].value) || 0;
        b.width = Math.max(0.05, Number(propFields[4].value) || 0.3);
        b.height = Math.max(0.04, Number(propFields[5].value) || 0.08);
        b.zIndex = parseInt(propFields[6].value, 10) || 1;
        syncJson();
        renderCanvas();
    }));

    function addBlock(type) {
        isPreviewMode = false;
        togglePreviewBtn.textContent = "노트 미리보기";
        canvasHeading.textContent = "페이지 캔버스 (블록 드래그 이동)";
        const b = { id: `block_${Date.now()}`, type, content: type === "math" ? "\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}" : "새 텍스트 블록", x: 0.1, y: Math.min(0.85, 0.1 + docData.blocks.length * 0.1), width: 0.5, height: 0.1, zIndex: docData.blocks.length + 1 };
        docData.blocks.push(b);
        selectedBlockId = b.id;
        syncJson();
        renderInspector();
        renderCanvas();
    }

    document.getElementById("add-text-btn").onclick = () => addBlock("text");
    document.getElementById("add-math-btn").onclick = () => addBlock("math");
    document.getElementById("delete-block-btn").onclick = () => {
        docData.blocks = docData.blocks.filter((b) => b.id !== selectedBlockId);
        selectedBlockId = null;
        syncJson();
        renderInspector();
        renderCanvas();
    };
    togglePreviewBtn.onclick = () => {
        isPreviewMode = !isPreviewMode;
        togglePreviewBtn.textContent = isPreviewMode ? "편집 모드로 돌아가기" : "노트 미리보기";
        canvasHeading.textContent = isPreviewMode ? "노트 미리보기 (A4 / LaTeX 렌더링)" : "페이지 캔버스 (블록 드래그 이동)";
        renderInspector();
        renderCanvas();
    };
    document.getElementById("ai-placeholder-btn").onclick = () => showMessage(msgEl, "AI 모델(YOLO/PaddleOCR/UniMERNet) 연동이 아직 보류 상태입니다.");
    document.getElementById("apply-json-btn").onclick = () => {
        try {
            docData = JSON.parse(jsonTextarea.value);
            if (!Array.isArray(docData.blocks)) docData.blocks = [];
            selectedBlockId = null;
            renderInspector();
            renderCanvas();
            showMessage(msgEl, "JSON 데이터를 반영했습니다.");
        } catch {
            showMessage(msgEl, "유효한 JSON 형식이 아닙니다.", true);
        }
    };
    document.getElementById("insert-sample-btn").onclick = () => {
        docData = {
            title: titleInput.value || "수학 필기",
            subject: subjectInput.value || "수학",
            page: { width: 210, height: 297, unit: "mm" },
            blocks: [
                { id: "block_1", type: "text", content: "이차방정식의 근의 공식", x: 0.1, y: 0.12, width: 0.6, height: 0.08, zIndex: 1 },
                { id: "block_2", type: "math", content: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}", x: 0.1, y: 0.24, width: 0.65, height: 0.12, zIndex: 2 },
            ],
        };
        selectedBlockId = "block_1";
        syncJson();
        renderInspector();
        renderCanvas();
    };
    document.getElementById("save-note-btn").onclick = async () => {
        try {
            syncJson();
            const updated = await requestJson(`/api/notes/${noteId}`, { method: "PUT", body: JSON.stringify({ title: titleInput.value.trim(), subject: subjectInput.value.trim(), content: docData }) });
            docData = updated.content;
            syncJson();
            showMessage(msgEl, `노트가 저장되었습니다. (${updated.updated_at})`);
        } catch (err) {
            showMessage(msgEl, err.message, true);
        }
    };
    document.getElementById("save-template-btn").onclick = async () => {
        const name = document.getElementById("template-name-input").value.trim();
        if (!name) return showMessage(msgEl, "템플릿 이름을 입력해주세요.", true);
        try {
            syncJson();
            await requestJson("/api/templates", { method: "POST", body: JSON.stringify({ name, content: docData }) });
            document.getElementById("template-name-input").value = "";
            showMessage(msgEl, "템플릿이 저장되었습니다.");
            loadTemplateOptions();
        } catch (err) {
            showMessage(msgEl, err.message, true);
        }
    };
    document.getElementById("load-template-btn").onclick = async () => {
        if (!templateSelect.value) return showMessage(msgEl, "불러올 템플릿을 선택해주세요.", true);
        try {
            const tpl = await requestJson(`/api/templates/${templateSelect.value}`);
            const copied = (tpl.content.blocks || []).map((b, i) => ({ ...b, id: `${b.id || "block"}_${Date.now()}_${i}` }));
            docData.blocks = [...(docData.blocks || []), ...copied];
            syncJson();
            renderCanvas();
            showMessage(msgEl, "템플릿 블록을 불러왔습니다.");
        } catch (err) {
            showMessage(msgEl, err.message, true);
        }
    };

    async function loadTemplateOptions() {
        const items = (await requestJson("/api/templates")).templates || [];
        templateSelect.innerHTML = "<option value=''>불러올 템플릿 선택</option>" + items.map((t) => `<option value="${t.id}">${t.name}</option>`).join("");
    }

    (async () => {
        try {
            const note = await requestJson(`/api/notes/${noteId}`);
            titleInput.value = note.title;
            subjectInput.value = note.subject || "";
            docData = note.content || { page: { width: 210, height: 297, unit: "mm" }, blocks: [] };
            if (!Array.isArray(docData.blocks)) docData.blocks = [];
            syncJson();
            renderInspector();
            renderCanvas();
            loadTemplateOptions();
        } catch (err) {
            showMessage(msgEl, err.message, true);
        }
    })();
}
