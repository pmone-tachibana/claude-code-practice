const STORAGE_KEY = "todo-app.items";
const PRIORITY_LABELS = { high: "高", medium: "中", low: "低" };

/** @type {{id: string, text: string, completed: boolean, priority: "high"|"medium"|"low", dueDate: string|null}[]} */
let todos = loadTodos();
let currentFilter = "all";
let editingId = null;
let draggedId = null;

const form = document.getElementById("todo-form");
const input = document.getElementById("todo-input");
const priorityInput = document.getElementById("todo-priority");
const dueInput = document.getElementById("todo-due");
const list = document.getElementById("todo-list");
const itemsLeft = document.getElementById("items-left");
const clearCompletedBtn = document.getElementById("clear-completed");
const filterButtons = document.querySelectorAll(".filter-btn");

function loadTodos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    // 旧データ（優先度・期限日を持たない）を補完しつつ読み込む
    return parsed.map((t) => ({
      id: t.id,
      text: t.text,
      completed: !!t.completed,
      priority: t.priority || "medium",
      dueDate: t.dueDate || null,
    }));
  } catch {
    return [];
  }
}

function saveTodos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

function addTodo(text, priority, dueDate) {
  todos.push({
    id: crypto.randomUUID(),
    text,
    completed: false,
    priority: priority || "medium",
    dueDate: dueDate || null,
  });
  saveTodos();
  render();
}

function toggleTodo(id) {
  const todo = todos.find((t) => t.id === id);
  if (todo) {
    todo.completed = !todo.completed;
    saveTodos();
    render();
  }
}

function deleteTodo(id) {
  todos = todos.filter((t) => t.id !== id);
  saveTodos();
  render();
}

function clearCompleted() {
  todos = todos.filter((t) => !t.completed);
  saveTodos();
  render();
}

function editTodoText(id, newText) {
  const todo = todos.find((t) => t.id === id);
  const trimmed = newText.trim();
  if (todo && trimmed) {
    todo.text = trimmed;
    saveTodos();
  }
  editingId = null;
  render();
}

function updatePriority(id, priority) {
  const todo = todos.find((t) => t.id === id);
  if (todo) {
    todo.priority = priority;
    saveTodos();
    render();
  }
}

function updateDueDate(id, dueDate) {
  const todo = todos.find((t) => t.id === id);
  if (todo) {
    todo.dueDate = dueDate || null;
    saveTodos();
    render();
  }
}

function reorderTodo(fromId, toId) {
  if (fromId === toId) return;
  const fromIndex = todos.findIndex((t) => t.id === fromId);
  const toIndex = todos.findIndex((t) => t.id === toId);
  if (fromIndex === -1 || toIndex === -1) return;
  const [moved] = todos.splice(fromIndex, 1);
  todos.splice(toIndex, 0, moved);
  saveTodos();
  render();
}

function getFilteredTodos() {
  switch (currentFilter) {
    case "active":
      return todos.filter((t) => !t.completed);
    case "completed":
      return todos.filter((t) => t.completed);
    default:
      return todos;
  }
}

function getTodayISO() {
  return new Date().toISOString().slice(0, 10);
}

function getDueStatus(todo) {
  if (!todo.dueDate || todo.completed) return null;
  const today = getTodayISO();
  if (todo.dueDate < today) return "overdue";
  if (todo.dueDate === today) return "due-today";
  return null;
}

function render() {
  const filtered = getFilteredTodos();
  list.innerHTML = "";

  if (filtered.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-message";
    empty.textContent = "表示するタスクがありません";
    list.appendChild(empty);
  }

  for (const todo of filtered) {
    const dueStatus = getDueStatus(todo);
    const isEditing = editingId === todo.id;

    const li = document.createElement("li");
    li.className = ["todo-item", todo.completed && "completed", dueStatus]
      .filter(Boolean)
      .join(" ");
    li.draggable = !isEditing;
    li.dataset.id = todo.id;

    li.addEventListener("dragstart", () => {
      draggedId = todo.id;
      li.classList.add("dragging");
    });
    li.addEventListener("dragend", () => {
      draggedId = null;
      li.classList.remove("dragging");
    });
    li.addEventListener("dragover", (e) => {
      e.preventDefault();
      li.classList.add("drag-over");
    });
    li.addEventListener("dragleave", () => li.classList.remove("drag-over"));
    li.addEventListener("drop", (e) => {
      e.preventDefault();
      li.classList.remove("drag-over");
      if (draggedId) reorderTodo(draggedId, todo.id);
    });

    const main = document.createElement("div");
    main.className = "todo-main";

    const dragHandle = document.createElement("span");
    dragHandle.className = "drag-handle";
    dragHandle.textContent = "⠿";
    dragHandle.setAttribute("aria-label", "ドラッグして並び替え");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.completed;
    checkbox.addEventListener("change", () => toggleTodo(todo.id));

    let labelEl;
    if (isEditing) {
      labelEl = document.createElement("input");
      labelEl.type = "text";
      labelEl.className = "edit-input";
      labelEl.value = todo.text;
      labelEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") labelEl.blur();
        if (e.key === "Escape") {
          editingId = null;
          render();
        }
      });
      labelEl.addEventListener("blur", () => {
        // Escapeで既にキャンセル済み（editingIdがクリア済み）の場合は保存しない。
        // render()内のDOM削除でこのinputへblurが発火するため、このガードが必要。
        if (editingId !== todo.id) return;
        editTodoText(todo.id, labelEl.value);
      });
    } else {
      labelEl = document.createElement("span");
      labelEl.className = "label";
      labelEl.textContent = todo.text;
      labelEl.addEventListener("dblclick", () => {
        editingId = todo.id;
        render();
      });
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "✕";
    deleteBtn.setAttribute("aria-label", "削除");
    deleteBtn.addEventListener("click", () => deleteTodo(todo.id));

    main.append(dragHandle, checkbox, labelEl);
    if (!isEditing) {
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "edit-btn";
      editBtn.textContent = "✎";
      editBtn.setAttribute("aria-label", "編集");
      editBtn.addEventListener("click", () => {
        editingId = todo.id;
        render();
      });
      main.appendChild(editBtn);
    }
    main.appendChild(deleteBtn);

    const meta = document.createElement("div");
    meta.className = "todo-meta";

    const prioritySelect = document.createElement("select");
    prioritySelect.className = `priority-select priority-${todo.priority}`;
    for (const [value, label] of Object.entries(PRIORITY_LABELS)) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      opt.selected = value === todo.priority;
      prioritySelect.appendChild(opt);
    }
    prioritySelect.addEventListener("change", () => {
      updatePriority(todo.id, prioritySelect.value);
    });

    const dueDateInput = document.createElement("input");
    dueDateInput.type = "date";
    dueDateInput.className = "due-input";
    dueDateInput.value = todo.dueDate || "";
    dueDateInput.setAttribute("aria-label", "期限日");
    dueDateInput.addEventListener("change", () => {
      updateDueDate(todo.id, dueDateInput.value);
    });

    meta.append(prioritySelect, dueDateInput);

    if (dueStatus === "overdue") {
      const badge = document.createElement("span");
      badge.className = "due-badge overdue-badge";
      badge.textContent = "期限切れ";
      meta.appendChild(badge);
    } else if (dueStatus === "due-today") {
      const badge = document.createElement("span");
      badge.className = "due-badge today-badge";
      badge.textContent = "今日締切";
      meta.appendChild(badge);
    }

    li.append(main, meta);
    list.appendChild(li);
  }

  const remaining = todos.filter((t) => !t.completed).length;
  itemsLeft.textContent = `${remaining} 件残り`;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  addTodo(text, priorityInput.value, dueInput.value);
  input.value = "";
  priorityInput.value = "medium";
  dueInput.value = "";
  input.focus();
});

clearCompletedBtn.addEventListener("click", clearCompleted);

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    render();
  });
});

render();
