
const SUPABASE_URL = "https://rnktpvvvgqwezfnpnxxp.supabase.co";
const SUPABASE_KEY = "sb_publishable_vKhLnVfTgQ3vnlrO0IcEAw_Ke4B44tA";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

let allJobs = [];
let currentFilter = "all";

const $ = (id) => document.getElementById(id);

function message(text, isError = false) {
  $("statusMessage").textContent = text;
  $("statusMessage").style.color = isError ? "#dc2626" : "#15803d";
}

function safeLink(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol)
      ? url.href
      : "";
  } catch {
    return "";
  }
}

async function checkAdmin() {
  const { data: { user }, error } = await db.auth.getUser();

  if (error || !user) {
    $("loginSection").classList.remove("hidden");
    $("dashboard").classList.add("hidden");
    return false;
  }

  const { data, error: adminError } = await db
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminError || !data) {
    await db.auth.signOut();
    $("loginSection").classList.remove("hidden");
    $("dashboard").classList.add("hidden");
    $("loginMessage").textContent =
      "Access denied. This account is not an administrator.";
    return false;
  }

  $("loginSection").classList.add("hidden");
  $("dashboard").classList.remove("hidden");

  return true;
}

// Admin login
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  $("loginMessage").textContent = "Logging in...";

  const email = $("email").value.trim();
  const password = $("password").value;

  const { error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    $("loginMessage").textContent = error.message;
    return;
  }

  const allowed = await checkAdmin();

  if (allowed) {
    $("loginMessage").textContent = "";
    await loadJobs();
  }
});

// Logout
$("logoutBtn").addEventListener("click", async () => {
  await db.auth.signOut();
  location.reload();
});

// Load all jobs for admin
async function loadJobs() {
  message("Loading jobs...");

  const { data, error } = await db
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    message(error.message, true);
    return;
  }

  allJobs = data || [];
  updateStats();
  renderJobs();

  message("Jobs loaded successfully.");
}

function updateStats() {
  $("totalJobs").textContent = allJobs.length;

  $("pendingJobs").textContent =
    allJobs.filter(j => j.status === "pending").length;

  $("approvedJobs").textContent =
    allJobs.filter(j => j.status === "approved").length;

  $("rejectedJobs").textContent =
    allJobs.filter(j => j.status === "rejected").length;
}

// Create safe text elements
function addText(parent, tag, value) {
  const element = document.createElement(tag);
  element.textContent = value || "Not provided";
  parent.appendChild(element);
  return element;
}

// Render jobs
function renderJobs() {
  const container = $("jobsList");
  container.replaceChildren();

  const search = $("searchInput").value.toLowerCase();

  const filtered = allJobs.filter(job => {
    const matchesStatus =
      currentFilter === "all" || job.status === currentFilter;

    const matchesSearch =
      (job.title || "").toLowerCase().includes(search) ||
      (job.department || "").toLowerCase().includes(search);

    return matchesStatus && matchesSearch;
  });

  if (!filtered.length) {
    addText(container, "p", "No jobs found.");
    return;
  }

  filtered.forEach(job => {
    const card = document.createElement("article");
    card.className = "job-card";

    addText(card, "h3", job.title);
    addText(card, "p", "Odia: " + (job.title_odia || "Not added"));
    addText(card, "p", "Department: " + job.department);
    addText(card, "p", "Qualification: " + job.qualification);
    addText(card, "p", "Vacancies: " + job.vacancies);
    addText(card, "p", "Salary: " + job.salary);
    addText(card, "p", "Source: " + job.source_name);

    const badge = addText(card, "span", job.status.toUpperCase());
    badge.className = "status-badge " + job.status;

    const notice = safeLink(job.notification_url);

    if (notice) {
      const link = document.createElement("a");
      link.href = notice;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "View Official Notification";
      link.style.display = "block";
      link.style.marginTop = "12px";
      card.appendChild(link);
    }

    const actions = document.createElement("div");
    actions.className = "job-actions";

    if (job.status !== "approved") {
      actions.appendChild(makeButton(
        "Approve", "approve-btn",
        () => changeStatus(job.id, "approved")
      ));
    }

    if (job.status !== "rejected") {
      actions.appendChild(makeButton(
        "Reject", "reject-btn",
        () => changeStatus(job.id, "rejected")
      ));
    }

    actions.appendChild(makeButton(
      "Edit", "edit-btn", () => openEdit(job)
    ));

    actions.appendChild(makeButton(
      "Delete", "delete-btn", () => deleteJob(job.id)
    ));

    card.appendChild(actions);
    container.appendChild(card);
  });
}

function makeButton(label, className, callback) {
  const button = document.createElement("button");
  button.textContent = label;
  button.className = className;
  button.addEventListener("click", callback);
  return button;
}

// Approve or reject
async function changeStatus(id, status) {
  const action = status === "approved" ? "approve" : "reject";

  if (!confirm("Are you sure you want to " + action + " this job?")) {
    return;
  }

  const { error } = await db
    .from("jobs")
    .update({ status })
    .eq("id", id);

  if (error) {
    message(error.message, true);
    return;
  }

  message("Job status updated.");
  await loadJobs();
}

// Delete job
async function deleteJob(id) {
  if (!confirm("Permanently delete this job?")) return;

  const { error } = await db
    .from("jobs")
    .delete()
    .eq("id", id);

  if (error) {
    message(error.message, true);
    return;
  }

  message("Job deleted successfully.");
  await loadJobs();
}

// Edit job
function openEdit(job) {
  $("editId").value = job.id;
  $("editTitle").value = job.title || "";
  $("editTitleOdia").value = job.title_odia || "";
  $("editDepartment").value = job.department || "";
  $("editQualification").value = job.qualification || "";
  $("editVacancies").value = job.vacancies || "";
  $("editSalary").value = job.salary || "";
  $("editNotificationUrl").value = job.notification_url || "";
  $("editApplyUrl").value = job.apply_url || "";
  $("editLastDate").value = job.last_date || "";

  $("editDialog").showModal();
}

$("cancelEdit").addEventListener("click", () => {
  $("editDialog").close();
});

$("editForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = Number($("editId").value);
  const notificationUrl = safeLink(
    $("editNotificationUrl").value.trim()
  );
  const applyValue = $("editApplyUrl").value.trim();
  const applyUrl = applyValue ? safeLink(applyValue) : null;

  if (!notificationUrl || (applyValue && !applyUrl)) {
    alert("Please enter valid HTTP/HTTPS links.");
    return;
  }

  const updates = {
    title: $("editTitle").value.trim(),
    title_odia: $("editTitleOdia").value.trim() || null,
    department: $("editDepartment").value.trim(),
    qualification: $("editQualification").value.trim() || null,
    vacancies: $("editVacancies").value.trim() || null,
    salary: $("editSalary").value.trim() || null,
    notification_url: notificationUrl,
    apply_url: applyUrl,
    last_date: $("editLastDate").value || null
  };

  const { error } = await db
    .from("jobs")
    .update(updates)
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  $("editDialog").close();
  message("Job updated successfully.");
  await loadJobs();
});

// Search
$("searchInput").addEventListener("input", renderJobs);

// Filter buttons
document.querySelectorAll(".filters button").forEach(button => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;

    document.querySelectorAll(".filters button")
      .forEach(b => b.classList.remove("active"));

    button.classList.add("active");
    renderJobs();
  });
});

// Refresh
$("refreshBtn").addEventListener("click", loadJobs);

// Start dashboard
async function init() {
  const allowed = await checkAdmin();

  if (allowed) {
    await loadJobs();
  }
}

db.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") {
    $("loginSection").classList.remove("hidden");
    $("dashboard").classList.add("hidden");
  }
});

init();
