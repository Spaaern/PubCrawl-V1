const STATE_VERSION = 1;
const checklistEl = document.getElementById("checklist");
const headerTitleEl = document.getElementById("headerTitle");
const addCheckpointBtn = document.getElementById("addCheckpointBtn");
const backToHubBtn = document.getElementById("backToHubBtn");
const participantsListEl = document.getElementById("participants-list");
const newParticipantInput = document.getElementById("new-participant");
const addParticipantBtn = document.getElementById("addParticipantBtn");
const hubTab = document.getElementById("hubTab");
const archiveTab = document.getElementById("archiveTab");

// Normalize State
function normalizeState() {
  lists.forEach(list => {
    list.participants = [...(list.participants || [])];
    list.checkpoints = (list.checkpoints || []).map(c => {
      const normalized = {
        id: c.id ?? generateId(),
        name: c.name ?? "Unnamed checkpoint",
        expanded: c.expanded ?? true,
        owner: list.participants.includes(c.owner) ? c.owner : null,
        subtasks: (c.subtasks || []).map(st => ({
          id: st.id ?? generateId(),
          name: st.name ?? "Unnamed subtask",
          participants: Object.fromEntries(
            Object.entries(st.participants || {}).filter(([p]) =>
              list.participants.includes(p)
            )
          )
        }))
      };

      normalized.done =
        normalized.subtasks.length > 0 &&
        normalized.subtasks.every(st => {
          const vals = Object.values(st.participants);
          return vals.length > 0 && vals.every(Boolean);
        });

      return normalized;
    });
  });
}

function renderParticipants() {
  const list = getActiveList();
  if (!list) return;

  participantsListEl.innerHTML = "";

  list.participants.forEach(name => {
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.marginBottom = "0.25rem";

    const span = document.createElement("span");
    span.textContent = name;
    span.style.flex = "1";

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "✕";
    removeBtn.style.marginLeft = "0.5rem";
    removeBtn.addEventListener("click", () => removeParticipant(name));

    div.appendChild(span);
    div.appendChild(removeBtn);
    participantsListEl.appendChild(div);
  });
}

const hubRaw = JSON.parse(localStorage.getItem("hub") || "{}");
let lists = hubRaw.lists || [];
let activeListId = hubRaw.activeListId || null;
let viewMode = "hub"; // "hub" | "list"

// -------- MIGRATION: single list → hub --------
if (lists.length === 0) {
  const legacyParticipants = JSON.parse(localStorage.getItem("participants") || "[]");
  const legacyRaw = JSON.parse(localStorage.getItem("checkpoints") || "{}");
  const legacyCheckpoints = legacyRaw.data || legacyRaw || [];

  if (legacyCheckpoints.length > 0) {
    const listId = generateId();

    lists.push({
      id: listId,
      name: "My first list",
      participants: [...legacyParticipants],
      checkpoints: legacyCheckpoints,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    activeListId = listId;

    localStorage.removeItem("participants");
    localStorage.removeItem("checkpoints");
    cleanupArchivedLists();
    saveHub();
  }
}

importFromUrl();
normalizeState();
renderParticipants();
render();

// ---------------- GENERATE ID -----------------

function generateId() {
  return Date.now() + Math.random();
}

// ---------------- SHARE DATA ------------------

const shareBtn = document.createElement("button");
shareBtn.textContent = "🔗";
document.querySelector("header").appendChild(shareBtn);

function generateShareLink() {
  const payload = buildSharePayload();
  if (!payload) return null;

  const encoded = btoa(
    encodeURIComponent(JSON.stringify(payload))
  );

  return `${location.origin}${location.pathname}#data=${encoded}`;
}

shareBtn.onclick = () => {
  const link = generateShareLink();
  navigator.clipboard.writeText(link);
  alert("Share link copied to clipboard!");
};

// ---------------- EXPORT DATA -----------------
const exportBtn = document.createElement("button");
exportBtn.textContent = "⬇";
document.querySelector("header").appendChild(exportBtn);

function exportData() {
  const payload = buildSharePayload();
  if (!payload) return;

  const filename =
    payload.type === "hub"
      ? "checklist-hub.json"
      : `${payload.list.name || "list"}.json`;

  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: "application/json" }
  );

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

exportBtn.onclick = exportData;

// ---------------- IMPORT DATA ----------------
const importBtn = document.createElement("button");
importBtn.textContent = "⬆";
document.querySelector("header").appendChild(importBtn);

function buildSharePayload() {
  if (viewMode === "list") {
    const list = getActiveList();
    if (!list) return null;

    return {
      version: STATE_VERSION,
      type: "list",
      list
    };
  }

  // hub mode
  return {
    version: STATE_VERSION,
    type: "hub",
    lists
  };
}

function importData(file) {
  const reader = new FileReader();

  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);

      if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid file");
      }

      if (parsed.version !== STATE_VERSION) {
        console.warn("Version mismatch, attempting import anyway");
      }

      if (parsed.type === "hub") {
        // ✅ Import entire hub
        parsed.lists.forEach(incoming => {
          const list = structuredClone(incoming);
          list.id = generateId();
          lists.push(list);
        });

        activeListId = null;
        viewMode = "hub";
      }

      else if (parsed.type === "list") {
        // ✅ Import single list
        const list = structuredClone(parsed.list);
        list.id = generateId();
        lists.push(list);

        activeListId = list.id;
        viewMode = "list";
      }

      else {
        throw new Error("Unknown import type");
      }

      normalizeState();
      saveHub();
      render();

    } catch (err) {
      console.error(err);
      alert("Import failed: invalid or corrupted file");
    }
  };

  reader.readAsText(file);
}

importBtn.onclick = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";

  input.onchange = () => {
    if (input.files.length > 0) {
      importData(input.files[0]);
    }
  };

  input.click();
};

function importFromUrl() {
  const hash = window.location.hash;
  if (!hash.startsWith("#data=")) return;

  try {
    const encoded = hash.slice(6);
    const json = decodeURIComponent(atob(encoded));
    const parsed = JSON.parse(json);

    if (!parsed) return;

    if (parsed.type === "hub") {
      parsed.lists.forEach(incoming => {
        const list = structuredClone(incoming);
        list.id = generateId();
        lists.push(list);
      });

      viewMode = "hub";
      activeListId = null;
    }

    else if (parsed.type === "list") {
      const list = structuredClone(parsed.list);
      list.id = generateId();
      lists.push(list);

      viewMode = "list";
      activeListId = list.id;
    }

    normalizeState();
    saveHub();
    render();

  } catch (err) {
    console.error("Failed to import from URL", err);
  }
}

// ---------------- PARTICIPANTS ----------------

addParticipantBtn.onclick = () => {
  const name = newParticipantInput.value.trim();
  if (!name) return;

  const list = getActiveList();
  if (!list || list.participants.includes(name)) return;

  list.participants.push(name);
  newParticipantInput.value = "";
  saveHub();
  renderParticipants();
  render();
};

function removeParticipant(name) {
  const list = getActiveList();
  if (!list) return;

  list.participants = list.participants.filter(p => p !== name);

  list.checkpoints.forEach(c => {
    if (c.owner === name) c.owner = null;
    c.subtasks.forEach(st => delete st.participants[name]);
  });

  saveHub();
  renderParticipants();
  render();
}

// ---------------- CHECKPOINTS ----------------

function makeInlineEditable({
  text,
  onSave
}) {
  const span = document.createElement("span");
  span.textContent = text;
  span.style.cursor = "pointer";

  span.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = text;
    input.style.fontSize = "inherit";
    input.style.width = "80%";

    span.replaceWith(input);
    input.focus();
    input.select();

    const cancel = () => {
      input.replaceWith(span);
    };

    const save = () => {
      const newValue = input.value.trim();
      if (newValue && newValue !== text) {
        onSave(newValue);
      }
      cancel();
    };

    input.addEventListener("blur", save);
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") save();
      if (e.key === "Escape") cancel();
    });
  });

  return span;
}

backToHubBtn.onclick = goToHub;

addCheckpointBtn.onclick = () => {
  const name = prompt("Checkpoint name:");
  if (!name) return;
  addCheckpoint(name);
  render();
};

function deleteCheckpoint(id) {
  const list = getActiveList();
  list.checkpoints = list.checkpoints.filter(c => c.id !== id);
  saveHub();
  render();
}

function moveCheckpoint(fromIndex, toIndex) {
  const list = getActiveList();
  const movedItem = list.checkpoints.splice(fromIndex, 1)[0];
  list.checkpoints.splice(toIndex, 0, movedItem);
  saveHub();
  render();
}

function confirmDelete(id) {
  if (confirm("Are you sure you want to delete this checkpoint?")) {
    deleteCheckpoint(id);
  }
}

// ---------------- SCOREBOARD ----------------

function renderScoreboard() {
  const scoreboardEl = document.getElementById("scoreboard");
  const scores = calculateScores();

  if (!scoreboardEl) return;
  scoreboardEl.innerHTML = "";

  // Sorter efter flest point
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  sorted.forEach(([name, score]) => {
    const div = document.createElement("div");
    div.textContent = `${name}: ${score}`;
    scoreboardEl.appendChild(div);
  });
}

// ---------------- COLLAPSIBLE SECTIONS ----------------
const participantsSection = document.getElementById("participants-section");
const participantsContent = document.getElementById("participants-content");
const toggleParticipantsBtn = document.getElementById("toggleParticipantsBtn");

const scoreboardSection = document.getElementById("scoreboard-section");
const scoreboardContent = document.getElementById("scoreboard-content");
const toggleScoreboardBtn = document.getElementById("toggleScoreboardBtn");

// Load saved collapsed states
let uiState = JSON.parse(localStorage.getItem("uiState") || "{}");

if (uiState.participantsCollapsed) {
  participantsContent.style.display = "none";
  toggleParticipantsBtn.textContent = "Show";
}
if (uiState.scoreboardCollapsed) {
  scoreboardContent.style.display = "none";
  toggleScoreboardBtn.textContent = "Show";
}

toggleParticipantsBtn.addEventListener("click", () => {
  const isHidden = participantsContent.style.display === "none";
  participantsContent.style.display = isHidden ? "block" : "none";
  toggleParticipantsBtn.textContent = isHidden ? "Hide" : "Show";
  uiState.participantsCollapsed = !isHidden;
  localStorage.setItem("uiState", JSON.stringify(uiState));
});

toggleScoreboardBtn.addEventListener("click", () => {
  const isHidden = scoreboardContent.style.display === "none";
  scoreboardContent.style.display = isHidden ? "block" : "none";
  toggleScoreboardBtn.textContent = isHidden ? "Hide" : "Show";
  uiState.scoreboardCollapsed = !isHidden;
  localStorage.setItem("uiState", JSON.stringify(uiState));
});

function calculateScores() {
  const scores = {};
  getCheckpoints().forEach(c => {
    c.subtasks.forEach(st => {
      Object.entries(st.participants).forEach(([name, done]) => {
        if (!scores[name]) scores[name] = 0;
        if (done) scores[name]++;
      });
    });
  });
  return scores;
}

// Progress Summary per checkpoint:

function isSubtaskComplete(subtask) {
  const values = Object.values(subtask.participants);
  return values.length > 0 && values.every(Boolean);
}

function getCheckpointProgress(checkpoint) {
  const total = checkpoint.subtasks.length;
  const completed = checkpoint.subtasks.filter(isSubtaskComplete).length;
  return { completed, total };
}

function syncCheckpointCompletion(checkpoint) {
  const { completed, total } = getCheckpointProgress(checkpoint);
  checkpoint.done = total > 0 && completed === total;
}

function showSubtaskCreator(container, checkpoint) {
  // Prevent multiple creators
  if (container.querySelector(".subtask-creator")) return;

  const creator = document.createElement("div");
  creator.className = "subtask-creator";
  creator.style.marginTop = "0.5rem";
  creator.style.padding = "0.5rem";
  creator.style.border = "1px solid #ccc";
  creator.style.borderRadius = "6px";
  creator.style.background = "#f9f9f9";

  // Name input
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Subtask name";
  nameInput.style.width = "100%";
  nameInput.style.marginBottom = "0.4rem";

  creator.appendChild(nameInput);

  // Participant selector
  const participantsDiv = document.createElement("div");
  participantsDiv.style.marginBottom = "0.4rem";

  const assigned = {};

  getParticipants().forEach(p => {
    const label = document.createElement("label");
    label.style.marginRight = "0.6rem";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        assigned[p] = false;
      } else {
        delete assigned[p];
      }
    });

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(" " + p));
    participantsDiv.appendChild(label);
  });

  creator.appendChild(participantsDiv);

  // Buttons
  const createBtn = document.createElement("button");
  createBtn.textContent = "Create";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  cancelBtn.style.marginLeft = "0.5rem";

  createBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (!name) return;

    addSubtaskToCheckpoint(checkpoint, name, assigned);
    render();
  });

  cancelBtn.addEventListener("click", () => creator.remove());

  creator.appendChild(createBtn);
  creator.appendChild(cancelBtn);

  container.appendChild(creator);
  nameInput.focus();
}

// ---------------- HUB STRUCTURE ------------------
function setListUiVisible(visible) {
  document.getElementById("participants-section").style.display = visible ? "block" : "none";
  document.getElementById("scoreboard-section").style.display = visible ? "block" : "none";
  document.getElementById("addCheckpointBtn").style.display = visible ? "inline-block" : "none";
  backToHubBtn.style.display = visible ? "inline-block" : "none";
}

function updateHeaderTitle() {
  if (viewMode === "list") {
    const list = getActiveList();
    headerTitleEl.textContent = list?.name || "Untitled list";
  } else {
    headerTitleEl.textContent = "Hub";
  }
}

function openList(listId) {
  activeListId = listId;
  viewMode = "list";
  saveHub();
  renderParticipants()
  render();
}

function goToHub() {
  viewMode = "hub";
  saveHub();
  render();
}

function archiveList(listId) {
  const list = lists.find(l => l.id === listId);
  if (!list) return;

  const ok = confirm(
    `Archive "${list.name || "Untitled list"}"?\nYou can restore it within 30 days.`
  );
  if (!ok) return;

  list.archivedAt = Date.now();

  if (activeListId === listId) {
    activeListId = null;
    viewMode = "hub";
  }

  saveHub();
  render();
}

function cleanupArchivedLists() {
  const now = Date.now();
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

  lists = lists.filter(list => {
    if (!list.archivedAt) return true;
    return now - list.archivedAt < THIRTY_DAYS;
  });
}

function renderHub() {
  checklistEl.innerHTML = "";

  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(220px, 1fr))";
  grid.style.gap = "1rem";

  lists
  .filter(list => !list.archivedAt)
  .forEach(list => {
    const card = document.createElement("div");
    card.style.border = "1px solid #ccc";
    card.style.borderRadius = "8px";
    card.style.padding = "1rem";
    card.style.cursor = "pointer";
    card.style.background = "#fff";

    const title = document.createElement("h3");
    title.textContent = list.name || "Untitled list";
    title.style.marginTop = "0";

    const meta = document.createElement("div");
    meta.style.fontSize = "0.8rem";
    meta.style.opacity = "0.7";
    meta.textContent = `${list.checkpoints.length} checkpoints`;

    card.appendChild(title);
    card.appendChild(meta);

    card.addEventListener("click", () => openList(list.id));

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑";
    deleteBtn.style.marginLeft = "0.5rem";
    deleteBtn.style.float = "right";

    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // ⛔ prevent opening the list
      archiveList(list.id);
    });

    title.appendChild(deleteBtn);

    grid.appendChild(card);
  });

  // ➕ New list card
  const newCard = document.createElement("div");
  newCard.style.border = "2px dashed #aaa";
  newCard.style.borderRadius = "8px";
  newCard.style.padding = "1rem";
  newCard.style.textAlign = "center";
  newCard.style.cursor = "pointer";
  newCard.textContent = "+ New list";

  newCard.addEventListener("click", () => {
    const name = prompt("List name:");
    if (!name) return;

    const id = generateId();
    lists.push({
      id,
      name,
      participants: [],
      checkpoints: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    activeListId = id;
    viewMode = "list";
    saveHub();
    render();
  });

  grid.appendChild(newCard);
  checklistEl.appendChild(grid);
}

hubTab.onclick = () => {
  viewMode = "hub";
  activeListId = null;
  saveHub();
  render();
};

archiveTab.onclick = () => {
  viewMode = "archive";
  activeListId = null;
  saveHub();
  render();
};

// ---------------- RENDER ARCHIVE ----------------

function renderArchive() {
  checklistEl.innerHTML = "";

  const archivedLists = lists.filter(l => l.archivedAt);

  if (archivedLists.length === 0) {
    checklistEl.textContent = "No archived lists.";
    return;
  }

  archivedLists.forEach(list => {
    const card = document.createElement("div");
    card.style.border = "1px solid #ccc";
    card.style.borderRadius = "8px";
    card.style.padding = "1rem";
    card.style.marginBottom = "0.5rem";
    card.style.background = "#f9f9f9";

    const title = document.createElement("h3");
    title.textContent = list.name || "Untitled list";

    const meta = document.createElement("div");
    const daysLeft = Math.max(
      0,
      30 - Math.floor((Date.now() - list.archivedAt) / (1000 * 60 * 60 * 24))
    );
    meta.textContent = `Archived • ${daysLeft} days left`;
    meta.style.fontSize = "0.8rem";
    meta.style.opacity = "0.7";

    // Restore button
    const restoreBtn = document.createElement("button");
    restoreBtn.textContent = "Restore";
    restoreBtn.onclick = () => restoreList(list.id);

    // Delete permanently
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete permanently";
    deleteBtn.style.marginLeft = "0.5rem";
    deleteBtn.onclick = () => permanentlyDeleteList(list.id);

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(restoreBtn);
    card.appendChild(deleteBtn);

    checklistEl.appendChild(card);
  });
}

function restoreList(listId) {
  const list = lists.find(l => l.id === listId);
  if (!list) return;

  list.archivedAt = null;
  saveHub();
  render();
}

function permanentlyDeleteList(listId) {
  const ok = confirm("This will permanently delete the list. This cannot be undone.");
  if (!ok) return;

  lists = lists.filter(l => l.id !== listId);
  saveHub();
  render();
}

// ---------------- STATE MUTATIONS ----------------
function saveHub() {
  localStorage.setItem(
    "hub",
    JSON.stringify({
      version: STATE_VERSION,
      lists,
      activeListId
    })
  );
}

function getActiveList() {
  return lists.find(l => l.id === activeListId);
}

function getParticipants() {
  return getActiveList()?.participants || [];
}

function getCheckpoints() {
  return getActiveList()?.checkpoints || [];
}

function addCheckpoint(name) {
  const list = getActiveList();
  if (!list) return;

  list.checkpoints.push({
    id: generateId(),
    name,
    expanded: true,
    owner: null,
    subtasks: []
  });
  saveHub();
}

function addSubtaskToCheckpoint(checkpoint, name, participants) {
  checkpoint.subtasks.push({
    id: generateId(),
    name,
    participants
  });
  syncCheckpointCompletion(checkpoint);
  saveHub();
}

function setCheckpointOwner(checkpoint, owner) {
  checkpoint.owner = owner;
  saveHub();
}

function toggleParticipantDone(checkpoint, subtask, participant) {
  subtask.participants[participant] = !subtask.participants[participant];
  syncCheckpointCompletion(checkpoint);
  saveHub();
}

function checkAllSubtaskParticipants(checkpoint, subtask) {
  Object.keys(subtask.participants).forEach(p => {
    subtask.participants[p] = true;
  });
  syncCheckpointCompletion(checkpoint);
  saveHub();
}

// ---------------- RENDERING ----------------
function render() {
  const participants = getParticipants();
  const checkpoints = getCheckpoints();
  checklistEl.innerHTML = "";

  updateHeaderTitle();

  if (viewMode === "hub") {
    setListUiVisible(false);
    renderHub();
    return;
  }

  if (viewMode === "archive") {
   setListUiVisible(false);
    renderArchive();
    return;
  }

  if (viewMode === "list") {
    renderParticipants();
  }

  setListUiVisible(true);

  checkpoints.forEach((c, index) => {
    const div = document.createElement("div");
    div.className = "checkpoint";
    div.setAttribute("draggable", true);
    div.setAttribute("data-index", index);

    // Drag events
    div.ondragstart = (e) => {
      e.dataTransfer.setData("text/plain", index);
      div.classList.add("dragging");
    };
    div.ondragend = () => div.classList.remove("dragging");

    div.ondragover = (e) => e.preventDefault();
    div.ondrop = (e) => {
      e.preventDefault();
      const fromIndex = parseInt(e.dataTransfer.getData("text/plain"));
      const toIndex = index;
      moveCheckpoint(fromIndex, toIndex);
    };

    // Header
    const h2 = document.createElement("h2");

    // Checkpoint checkbox
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = c.done;
    checkbox.disabled = true;
    h2.appendChild(checkbox);

    // Checkpoint name
    const nameEditor = makeInlineEditable({
      text: c.name,
      onSave: newName => {
        c.name = newName;
        saveHub();
        render();
      }
    });

    h2.appendChild(document.createTextNode(" "));
    h2.appendChild(nameEditor);
    h2.appendChild(document.createTextNode(" "));

    const progress = getCheckpointProgress(c);

    if (progress.total > 0) {
      const progressSpan = document.createElement("span");
      progressSpan.style.marginLeft = "0.5rem";
      progressSpan.style.fontSize = "0.8rem";
      progressSpan.style.opacity = "0.7";
      progressSpan.textContent = `✔ ${progress.completed} / ${progress.total}`;
      h2.appendChild(progressSpan);
    }

    // Owner selector
    const ownerSelect = document.createElement("select");
    ownerSelect.style.marginLeft = "0.5rem";

    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "Owner";
    ownerSelect.appendChild(emptyOption);

    participants.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      if (c.owner === p) opt.selected = true;
      ownerSelect.appendChild(opt);
    });

    ownerSelect.addEventListener("change", () => {
      setCheckpointOwner(c, ownerSelect.value || null);
      render();
    });

    if (c.owner) {
      const ownerLabel = document.createElement("span");
      ownerLabel.textContent = `👤 ${c.owner}`;
      ownerLabel.style.marginLeft = "0.4rem";
      ownerLabel.style.fontSize = "0.8rem";
      ownerLabel.style.opacity = "0.8";
      h2.appendChild(ownerLabel);
    }

    h2.appendChild(ownerSelect);

    // Expand / Collapse button
    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = c.expanded ? "Hide" : "Show";
    toggleBtn.style.marginLeft = "0.5rem";
    toggleBtn.addEventListener("click", () => {
      c.expanded = !c.expanded;
      saveHub();
      render();
    });
    h2.appendChild(toggleBtn);

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.style.marginLeft = "auto";
    deleteBtn.textContent = "🗑";
    deleteBtn.addEventListener("click", () => confirmDelete(c.id));
    h2.appendChild(deleteBtn);

    div.appendChild(h2);

    // Subtasks container
    const subtasksDiv = document.createElement("div");
    subtasksDiv.className = "subtasks";
    subtasksDiv.style.display = c.expanded ? "block" : "none";

    c.subtasks.forEach(st => {
      const stDiv = document.createElement("div");

      // Subtask name
      const stNameEditor = makeInlineEditable({
        text: st.name,
        onSave: newName => {
          st.name = newName;
          saveHub();
          render();
        }
      });

      const stNameWrapper = document.createElement("strong");
      stNameWrapper.appendChild(stNameEditor);
      stDiv.appendChild(stNameWrapper);

      // Check All button
      const checkAllBtn = document.createElement("button");
      checkAllBtn.className = "check-all-btn";
      checkAllBtn.textContent = "Check All";
      checkAllBtn.addEventListener("click", () => {
        checkAllSubtaskParticipants(c, st);
        render();
      });
      stDiv.appendChild(checkAllBtn);

      // Participant checkboxes
      const participantDiv = document.createElement("div");
      Object.keys(st.participants).forEach(p => {
        const label = document.createElement("label");

        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "participant-checkbox";
        input.checked = st.participants[p];
        input.addEventListener("change", () => {
          toggleParticipantDone(c, st, p);
          render();
        });

        label.appendChild(input);
        label.appendChild(document.createTextNode(" " + p));
        participantDiv.appendChild(label);
      });

      stDiv.appendChild(participantDiv);
      subtasksDiv.appendChild(stDiv);
    });

    // Add subtask button
    const addSubtaskDiv = document.createElement("div");
    addSubtaskDiv.className = "add-subtask";
    addSubtaskDiv.textContent = "+ Add subtask";
    addSubtaskDiv.style.cursor = "pointer";

    addSubtaskDiv.addEventListener("click", () => {
      showSubtaskCreator(subtasksDiv, c);
    });

    subtasksDiv.appendChild(addSubtaskDiv);

    div.appendChild(subtasksDiv);
    checklistEl.appendChild(div);
  });
  renderScoreboard();
}

// ---------------- EXPOSE FUNCTIONS TO GLOBAL SCOPE ----------------
window.deleteCheckpoint = deleteCheckpoint;
window.confirmDelete = confirmDelete;
