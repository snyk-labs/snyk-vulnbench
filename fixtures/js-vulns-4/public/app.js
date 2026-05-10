const form = document.getElementById("todo-form");
const editIdInput = document.getElementById("edit-id");
const titleInput = document.getElementById("title");
const descriptionInput = document.getElementById("description");
const completedInput = document.getElementById("completed");
const attachmentInput = document.getElementById("attachment");
const removeAttachmentInput = document.getElementById("remove-attachment");
const removeAttachmentLabel = document.getElementById("remove-attachment-label");
const submitBtn = document.getElementById("submit-btn");
const cancelEditBtn = document.getElementById("cancel-edit");
const listEl = document.getElementById("todo-list");
const emptyEl = document.getElementById("empty-state");

function api(path, options = {}) {
  return fetch(path, options).then(async (res) => {
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!res.ok) {
      const msg = body && body.error ? body.error : res.statusText;
      throw new Error(msg);
    }
    return body;
  });
}

function resetForm() {
  editIdInput.value = "";
  titleInput.value = "";
  descriptionInput.value = "";
  completedInput.checked = false;
  attachmentInput.value = "";
  removeAttachmentInput.checked = false;
  removeAttachmentLabel.classList.add("hidden");
  submitBtn.textContent = "Add todo";
  cancelEditBtn.classList.add("hidden");
}

function enterEdit(todo) {
  editIdInput.value = String(todo.id);
  titleInput.value = todo.title;
  descriptionInput.value = todo.description || "";
  completedInput.checked = todo.completed;
  attachmentInput.value = "";
  removeAttachmentInput.checked = false;
  removeAttachmentLabel.classList.toggle("hidden", !todo.attachment);
  submitBtn.textContent = "Save changes";
  cancelEditBtn.classList.remove("hidden");
  titleInput.focus();
}

async function loadTodos() {
  const todos = await api("/api/todos");
  listEl.innerHTML = "";
  emptyEl.classList.toggle("hidden", todos.length > 0);
  for (const todo of todos) {
    const li = document.createElement("li");
    li.className = "todo-item" + (todo.completed ? " done" : "");

    const title = document.createElement("p");
    title.className = "todo-title";
    title.textContent = todo.title;

    const desc = document.createElement("p");
    desc.className = "todo-desc";
    desc.textContent = todo.description || "(no description)";

    const meta = document.createElement("p");
    meta.className = "todo-meta";
    meta.textContent = todo.created_at ? `Created: ${todo.created_at}` : "";

    const actions = document.createElement("div");
    actions.className = "todo-actions";

    if (todo.attachment) {
      const dl = document.createElement("a");
      dl.href = todo.attachment.downloadUrl;
      dl.textContent = `Download: ${todo.attachment.originalName || "file"}`;
      dl.setAttribute("download", "");
      actions.appendChild(dl);
    }

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "small secondary";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => enterEdit(todo));

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "small danger";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async () => {
      if (!confirm("Delete this todo?")) return;
      await api(`/api/todos/${todo.id}`, { method: "DELETE" });
      await loadTodos();
      if (editIdInput.value === String(todo.id)) resetForm();
    });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    li.appendChild(title);
    li.appendChild(desc);
    if (meta.textContent) li.appendChild(meta);
    li.appendChild(actions);
    listEl.appendChild(li);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = editIdInput.value.trim();
  const fd = new FormData();
  fd.append("title", titleInput.value.trim());
  fd.append("description", descriptionInput.value);
  fd.append("completed", completedInput.checked ? "true" : "false");
  const file = attachmentInput.files[0];
  if (file) fd.append("attachment", file);
  if (id && removeAttachmentInput.checked && !file) {
    fd.append("removeAttachment", "true");
  }

  submitBtn.disabled = true;
  try {
    if (id) {
      const url = `/api/todos/${encodeURIComponent(id)}`;
      await api(url, { method: "PUT", body: fd });
    } else {
      await api("/api/todos", { method: "POST", body: fd });
    }
    resetForm();
    await loadTodos();
  } catch (err) {
    alert(err.message || String(err));
  } finally {
    submitBtn.disabled = false;
  }
});

cancelEditBtn.addEventListener("click", () => resetForm());

loadTodos().catch((err) => {
  emptyEl.textContent = `Could not load todos: ${err.message}`;
  emptyEl.classList.remove("hidden");
});
