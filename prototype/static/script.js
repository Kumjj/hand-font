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

function renderBlockBody(bodyEl, block) {
    const text = block.content || "";
    if (block.type === "math" && window.katex) {
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
        const usernameVal = document.getElementById("username").value;
        const passwordVal = document.getElementById("password").value;
        try {
            await requestJson("/api/register", {
                method: "POST",
                body: JSON.stringify({ username: usernameVal, password: passwordVal }),
            });
            showMessage(msg, "회원가입 완료. 로그인 페이지로 이동합니다.");
            setTimeout(() => {
                window.location.href = "/login";
            }, 600);
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
        const usernameVal = document.getElementById("username").value;
        const passwordVal = document.getElementById("password").value;
        try {
            await requestJson("/api/login", {
                method: "POST",
                body: JSON.stringify({ username: usernameVal, password: passwordVal }),
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

    function getCategory(note) {
        if (note.subject && note.subject.trim()) {
            return note.subject.trim();
        }
        return "기타";
    }

    function getCategoryList(notes) {
        const list = ["기타"];
        for (const note of notes) {
            const cat = getCategory(note);
            if (!list.includes(cat)) {
                list.push(cat);
            }
        }
        return list;
    }

    function countByCategory(notes, cat) {
        let count = 0;
        for (const note of notes) {
            if (getCategory(note) === cat) {
                count += 1;
            }
        }
        return count;
    }

    function renderNotes() {
        const categories = getCategoryList(allNotes);

        catSelectEl.innerHTML = "";
        for (const cat of categories) {
            const opt = document.createElement("option");
            opt.value = cat;
            opt.textContent = cat;
            catSelectEl.appendChild(opt);
        }
        const customOpt = document.createElement("option");
        customOpt.value = "__custom__";
        customOpt.textContent = "+ 새 카테고리 직접 입력";
        catSelectEl.appendChild(customOpt);

        if (selectedCategory !== "__ALL__" && categories.includes(selectedCategory)) {
            catSelectEl.value = selectedCategory;
        } else {
            catSelectEl.value = "기타";
        }
        customCatInput.classList.add("hidden");
        customCatInput.value = "";
        catSelectEl.classList.remove("hidden");

        categoryTabsEl.innerHTML = "";
        const allBtn = document.createElement("button");
        allBtn.type = "button";
        allBtn.className = selectedCategory === "__ALL__" ? "cat-tab active" : "cat-tab";
        allBtn.textContent = `전체 (${allNotes.length})`;
        allBtn.onclick = () => {
            selectedCategory = "__ALL__";
            renderNotes();
        };
        categoryTabsEl.appendChild(allBtn);

        for (const cat of categories) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = selectedCategory === cat ? "cat-tab active" : "cat-tab";
            btn.textContent = `${cat} (${countByCategory(allNotes, cat)})`;
            btn.onclick = () => {
                selectedCategory = cat;
                renderNotes();
            };
            categoryTabsEl.appendChild(btn);
        }

        notesListEl.innerHTML = "";
        let shown = 0;
        for (const note of allNotes) {
            const cat = getCategory(note);
            if (selectedCategory !== "__ALL__" && cat !== selectedCategory) {
                continue;
            }
            shown += 1;
            const row = document.createElement("div");
            row.className = "item-row";
            row.innerHTML = `
                <div>
                    <strong>${note.title}</strong>
                    <div class="item-meta">카테고리: ${cat} | 수정: ${note.updated_at}</div>
                </div>
                <div class="actions">
                    <a href="/editor/${note.id}" class="btn btn-primary">열기</a>
                    <button type="button" class="btn btn-danger" data-del-note="${note.id}">삭제</button>
                </div>
            `;
            notesListEl.appendChild(row);
        }
        if (shown === 0) {
            notesListEl.innerHTML = "<p class='item-meta'>저장된 노트가 없습니다.</p>";
        }
    }

    async function loadNotes() {
        const data = await requestJson("/api/notes");
        allNotes = data.notes || [];
        renderNotes();
    }

    async function loadTemplates() {
        const data = await requestJson("/api/templates");
        const items = data.templates || [];
        templatesListEl.innerHTML = "";
        if (items.length === 0) {
            templatesListEl.innerHTML = "<p class='item-meta'>저장된 템플릿이 없습니다.</p>";
            return;
        }
        for (const tpl of items) {
            const row = document.createElement("div");
            row.className = "item-row";
            row.innerHTML = `
                <div>
                    <strong>${tpl.name}</strong>
                    <div class="item-meta">ID: ${tpl.id}</div>
                </div>
                <div class="actions">
                    <button type="button" class="btn btn-secondary" data-rename-tpl="${tpl.id}" data-name="${tpl.name}">이름 수정</button>
                    <button type="button" class="btn btn-danger" data-del-tpl="${tpl.id}">삭제</button>
                </div>
            `;
            templatesListEl.appendChild(row);
        }
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
        let subject = catSelectEl.value.trim();
        if (!customCatInput.classList.contains("hidden")) {
            subject = customCatInput.value.trim();
        }
        if (!subject) {
            subject = "기타";
        }
        try {
            const created = await requestJson("/api/notes", {
                method: "POST",
                body: JSON.stringify({ title, subject }),
            });
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
            await loadTemplates();
            return;
        }
        const renameId = e.target.dataset.renameTpl;
        if (renameId) {
            const nextName = prompt("새 템플릿 이름:", e.target.dataset.name || "");
            if (!nextName || !nextName.trim()) return;
            await requestJson(`/api/templates/${renameId}`, {
                method: "PUT",
                body: JSON.stringify({ name: nextName.trim() }),
            });
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

    const propType = document.getElementById("prop-type");
    const propContent = document.getElementById("prop-content");
    const propX = document.getElementById("prop-x");
    const propY = document.getElementById("prop-y");
    const propWidth = document.getElementById("prop-width");
    const propHeight = document.getElementById("prop-height");
    const propZ = document.getElementById("prop-z");

    let docData = { title: "", subject: "", page: { width: 210, height: 297, unit: "mm" }, blocks: [] };
    let selectedBlockId = null;
    let isPreviewMode = false;

    function syncJson() {
        docData.title = titleInput.value.trim();
        docData.subject = subjectInput.value.trim();
        jsonTextarea.value = JSON.stringify(docData, null, 2);
    }

    function findSelectedBlock() {
        for (const block of docData.blocks || []) {
            if (block.id === selectedBlockId) {
                return block;
            }
        }
        return null;
    }

    function renderInspector() {
        const block = findSelectedBlock();
        if (!block || isPreviewMode) {
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
        canvasEl.classList.toggle("preview-mode", isPreviewMode);
        canvasEl.innerHTML = "";

        for (const b of docData.blocks || []) {
            const el = document.createElement("div");
            el.className = "canvas-block type-" + (b.type || "text");
            if (!isPreviewMode && b.id === selectedBlockId) {
                el.classList.add("selected");
            }
            el.style.left = ((b.x ?? 0.1) * 100) + "%";
            el.style.top = ((b.y ?? 0.1) * 100) + "%";
            el.style.width = ((b.width ?? 0.4) * 100) + "%";
            el.style.height = ((b.height ?? 0.08) * 100) + "%";
            el.style.zIndex = b.zIndex ?? 1;

            const tag = document.createElement("div");
            tag.className = "block-tag";
            tag.textContent = b.type || "text";

            const body = document.createElement("div");
            renderBlockBody(body, b);

            el.appendChild(tag);
            el.appendChild(body);

            if (!isPreviewMode) {
                el.onmousedown = (e) => {
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
                        el.style.left = (b.x * 100) + "%";
                        el.style.top = (b.y * 100) + "%";
                        propX.value = b.x;
                        propY.value = b.y;
                        syncJson();
                    }

                    function onUp() {
                        window.removeEventListener("mousemove", onMove);
                        window.removeEventListener("mouseup", onUp);
                        renderCanvas();
                    }

                    window.addEventListener("mousemove", onMove);
                    window.addEventListener("mouseup", onUp);
                };
            }

            canvasEl.appendChild(el);
        }
    }

    function onInspectorInput() {
        const block = findSelectedBlock();
        if (!block) return;
        block.type = propType.value;
        block.content = propContent.value;
        block.x = Number(propX.value) || 0;
        block.y = Number(propY.value) || 0;
        block.width = Math.max(0.05, Number(propWidth.value) || 0.3);
        block.height = Math.max(0.04, Number(propHeight.value) || 0.08);
        block.zIndex = parseInt(propZ.value, 10) || 1;
        syncJson();
        renderCanvas();
    }

    propType.addEventListener("input", onInspectorInput);
    propContent.addEventListener("input", onInspectorInput);
    propX.addEventListener("input", onInspectorInput);
    propY.addEventListener("input", onInspectorInput);
    propWidth.addEventListener("input", onInspectorInput);
    propHeight.addEventListener("input", onInspectorInput);
    propZ.addEventListener("input", onInspectorInput);

    function addBlock(type) {
        isPreviewMode = false;
        togglePreviewBtn.textContent = "노트 미리보기";
        canvasHeading.textContent = "페이지 캔버스 (블록 드래그 이동)";
        const block = {
            id: "block_" + Date.now(),
            type: type,
            content: type === "math" ? "\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}" : "새 텍스트 블록",
            x: 0.1,
            y: Math.min(0.85, 0.1 + docData.blocks.length * 0.1),
            width: 0.5,
            height: 0.1,
            zIndex: docData.blocks.length + 1,
        };
        docData.blocks.push(block);
        selectedBlockId = block.id;
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

    document.getElementById("ai-placeholder-btn").onclick = () => {
        showMessage(msgEl, "AI 모델(YOLO/PaddleOCR/UniMERNet) 연동이 아직 보류 상태입니다.");
    };

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
            const updated = await requestJson(`/api/notes/${noteId}`, {
                method: "PUT",
                body: JSON.stringify({
                    title: titleInput.value.trim(),
                    subject: subjectInput.value.trim(),
                    content: docData,
                }),
            });
            docData = updated.content;
            syncJson();
            showMessage(msgEl, `노트가 저장되었습니다. (${updated.updated_at})`);
        } catch (err) {
            showMessage(msgEl, err.message, true);
        }
    };

    document.getElementById("save-template-btn").onclick = async () => {
        const name = document.getElementById("template-name-input").value.trim();
        if (!name) {
            showMessage(msgEl, "템플릿 이름을 입력해주세요.", true);
            return;
        }
        try {
            syncJson();
            await requestJson("/api/templates", {
                method: "POST",
                body: JSON.stringify({ name, content: docData }),
            });
            document.getElementById("template-name-input").value = "";
            showMessage(msgEl, "템플릿이 저장되었습니다.");
            loadTemplateOptions();
        } catch (err) {
            showMessage(msgEl, err.message, true);
        }
    };

    document.getElementById("load-template-btn").onclick = async () => {
        if (!templateSelect.value) {
            showMessage(msgEl, "불러올 템플릿을 선택해주세요.", true);
            return;
        }
        try {
            const tpl = await requestJson(`/api/templates/${templateSelect.value}`);
            const tplBlocks = tpl.content.blocks || [];
            for (let i = 0; i < tplBlocks.length; i++) {
                const copy = { ...tplBlocks[i], id: (tplBlocks[i].id || "block") + "_" + Date.now() + "_" + i };
                docData.blocks.push(copy);
            }
            syncJson();
            renderCanvas();
            showMessage(msgEl, "템플릿 블록을 불러왔습니다.");
        } catch (err) {
            showMessage(msgEl, err.message, true);
        }
    };

    async function loadTemplateOptions() {
        const data = await requestJson("/api/templates");
        templateSelect.innerHTML = "<option value=''>불러올 템플릿 선택</option>";
        for (const tpl of data.templates || []) {
            const opt = document.createElement("option");
            opt.value = tpl.id;
            opt.textContent = tpl.name;
            templateSelect.appendChild(opt);
        }
    }

    async function initEditor() {
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
    }

    initEditor();
}
