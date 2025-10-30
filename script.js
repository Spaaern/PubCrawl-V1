const checklistEl = document.getElementById("checklist");
const addCheckpointBtn = document.getElementById("addCheckpointBtn");

const participantsListEl = document.getElementById("participants-list");
const newParticipantInput = document.getElementById("new-participant");
const addParticipantBtn = document.getElementById("addParticipantBtn");

// Load or initialize participants
let participants = JSON.parse(localStorage.getItem("participants") || "[]");

// Load or initialize checkpoints
let checkpoints = JSON.parse(localStorage.getItem("checkpoints") || "[]");

renderParticipants();
render();

// ---------------- PARTICIPANTS ----------------

addParticipantBtn.onclick = () => {
  const name = newParticipantInput.value.trim();
  if (!name || participants.includes(name)) return;
  participants.push(name);
  newParticipantInput.value = "";
  saveParticipants();
  renderParticipants();
  render(); // Re-render checklist to include new participant checkboxes
};

function removeParticipant(name) {
  participants = participants.filter(p => p !== name);
  // Remove participant from all subtasks
  checkpoints.forEach(c => c.subtasks.forEach(s => delete s.participants[name]));
  saveParticipants();
  saveCheckpoints();
  renderParticipants();
  render();
}

function saveParticipants() {
  localStorage.setItem("participants", JSON.stringify(participants));
}

function renderParticipants() {
  participantsListEl.innerHTML = "";
  participants.forEach(name => {
    const span = document.createElement("span");
    span.textContent = name;
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "❌";
    removeBtn.onclick = () => removeParticipant(name);
    span.appendChild(removeBtn);
    participantsListEl.appendChild(span);
  });
}

// ---------------- CHECKPOINTS ----------------

addCheckpointBtn.onclick = () => {
  const name = prompt("Checkpoint name:");
  if (!name) return;
  checkpoints.push({ id: Date.now(), name, done: false, subtasks: [] });
  saveCheckpoints();
  render();
};

function toggleCheckpoint(id) {
  const c = checkpoints.find(c => c.id === id);
  c.done = !c.done;
  saveCheckpoints();
  render();
}

function addSubtask(checkpointId) {
  const name = prompt("Subtask name:");
  if (!name) return;
  const cp = checkpoints.find(c => c.id === checkpointId);
  const participantsObj = {};
  participants.forEach(p => (participantsObj[p] = false));
  cp.subtasks.push({ id: Date.now(), name, participants: participantsObj });
  saveCheckpoints();
  render();
}

function toggleParticipant(checkpointId, subtaskId, participantName) {
  const cp = checkpoints.find(c => c.id === checkpointId);
  const st = cp.subtasks.find(s => s.id === subtaskId);
  st.participants[participantName] = !st.participants[participantName];
  saveCheckpoints();
  render();
}

function checkAllParticipants(checkpointId, subtaskId) {
  const cp = checkpoints.find(c => c.id === checkpointId);
  const st = cp.subtasks.find(s => s.id === subtaskId);
  participants.forEach(p => (st.participants[p] = true));
  saveCheckpoints();
  render();
}

function deleteCheckpoint(id) {
  checkpoints = checkpoints.filter(c => c.id !== id);
  saveCheckpoints();
  render();
}

function saveCheckpoints() {
  localStorage.setItem("checkpoints", JSON.stringify(checkpoints));
}

function moveCheckpoint(fromIndex, toIndex) {
  const movedItem = checkpoints.splice(fromIndex, 1)[0];
  checkpoints.splice(toIndex, 0, movedItem);
  saveCheckpoints();
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
  checkpoints.forEach(c => {
    c.subtasks.forEach(st => {
      Object.entries(st.participants).forEach(([name, done]) => {
        if (!scores[name]) scores[name] = 0;
        if (done) scores[name]++;
      });
    });
  });
  return scores;
}

// ---------------- RENDERING ----------------
function render() {
  checklistEl.innerHTML = "";

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
    checkbox.addEventListener("change", () => toggleCheckpoint(c.id));
    h2.appendChild(checkbox);

    // Checkpoint name
    const nameText = document.createTextNode(" " + c.name + " ");
    h2.appendChild(nameText);

    // Expand / Collapse button
    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = c.expanded ? "Hide" : "Show";
    toggleBtn.style.marginLeft = "0.5rem";
    toggleBtn.addEventListener("click", () => {
      c.expanded = !c.expanded;
      saveCheckpoints();
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
      const stName = document.createElement("strong");
      stName.textContent = st.name;
      stDiv.appendChild(stName);

      // Check All button
      const checkAllBtn = document.createElement("button");
      checkAllBtn.className = "check-all-btn";
      checkAllBtn.textContent = "Check All";
      checkAllBtn.addEventListener("click", () => checkAllParticipants(c.id, st.id));
      stDiv.appendChild(checkAllBtn);

      // Participant checkboxes
      const participantDiv = document.createElement("div");
      Object.keys(st.participants).forEach(p => {
        const label = document.createElement("label");

        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "participant-checkbox";
        input.checked = st.participants[p];
        input.addEventListener("change", () => toggleParticipant(c.id, st.id, p));

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
    addSubtaskDiv.addEventListener("click", () => addSubtask(c.id));
    subtasksDiv.appendChild(addSubtaskDiv);

    div.appendChild(subtasksDiv);
    checklistEl.appendChild(div);
    renderScoreboard();
  });
}

// ---------------- EXPOSE FUNCTIONS TO GLOBAL SCOPE ----------------
window.toggleCheckpoint = toggleCheckpoint;
window.addSubtask = addSubtask;
window.toggleParticipant = toggleParticipant;
window.checkAllParticipants = checkAllParticipants;
window.deleteCheckpoint = deleteCheckpoint;
window.confirmDelete = confirmDelete;
