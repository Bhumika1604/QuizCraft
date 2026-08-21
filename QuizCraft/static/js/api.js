/* =========================================================
   QuizCraft — static/js/api.js
   ONE reusable helper for every API call in the project.
   - Consistent base URL (relative /api/, never hardcoded localhost)
   - Attaches the Bearer token automatically
   - Safe JSON parsing + consistent error handling
   - Toast notifications
   ========================================================= */
const QC_API_BASE = "/api";

function qcGetToken(){ return localStorage.getItem("qc_token") || ""; }
function qcSetToken(t){ localStorage.setItem("qc_token", t); }
function qcClearToken(){ localStorage.removeItem("qc_token"); localStorage.removeItem("qc_user"); }
function qcGetUser(){
  try { return JSON.parse(localStorage.getItem("qc_user") || "null"); }
  catch(e){ return null; }
}
function qcSetUser(u){ localStorage.setItem("qc_user", JSON.stringify(u)); }

async function qcRequest(method, path, body){
  const headers = { "Content-Type": "application/json" };
  const token = qcGetToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let response;
  try{
    response = await fetch(`${QC_API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr){
    console.error("QuizCraft network error:", networkErr);
    throw new Error("Could not reach the QuizCraft server. Check that the Django backend is running.");
  }

  let payload;
  try{
    payload = await response.json();
  } catch(parseErr){
    console.error("QuizCraft: failed to parse response JSON", parseErr);
    throw new Error(`Unexpected server response (HTTP ${response.status}).`);
  }

  if (response.status === 401){
    qcClearToken();
  }

  if (!response.ok || payload.success === false){
    const message = payload && payload.message ? payload.message : `Request failed (HTTP ${response.status}).`;
    const err = new Error(message);
    err.status = response.status;
    err.data = payload ? payload.data : null;
    throw err;
  }
  return payload.data;
}

const api = {
  get:  (path)       => qcRequest("GET", path),
  post: (path, body) => qcRequest("POST", path, body || {}),
  put:  (path, body) => qcRequest("PUT", path, body || {}),
  patch:(path, body) => qcRequest("PATCH", path, body || {}),
  del:  (path)        => qcRequest("DELETE", path),
};

/* ---------------- Toast notifications ---------------- */
function qcToast(message, type = "info"){
  let region = document.getElementById("qc-toast-region");
  if (!region){
    region = document.createElement("div");
    region.id = "qc-toast-region";
    document.body.appendChild(region);
  }
  const icon = type === "success" ? "fa-circle-check" : type === "error" ? "fa-circle-exclamation" : "fa-circle-info";
  const el = document.createElement("div");
  el.className = `qc-toast ${type}`;
  el.innerHTML = `<i class="fa-solid ${icon}" style="margin-top:2px;color:var(--primary)"></i><div>${message}</div>`;
  region.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; setTimeout(() => el.remove(), 300); }, 4000);
}

/* ---------------- Auth guard used on every protected page ---------------- */
async function qcRequireAuth(requiredRole){
  const token = qcGetToken();
  if (!token){
    window.location.href = "/login/";
    return null;
  }
  try{
    const user = await api.get("/auth/me/");
    qcSetUser(user);
    if (requiredRole && user.role !== requiredRole){
      window.location.href = user.role === "faculty" ? "/faculty/dashboard/" : "/dashboard/";
      return null;
    }
    return user;
  } catch(e){
    qcClearToken();
    window.location.href = "/login/";
    return null;
  }
}

function qcLogout(){
  api.post("/auth/logout/").catch(() => {}).finally(() => {
    qcClearToken();
    window.location.href = "/login/";
  });
}

function qcEscapeHtml(str){
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function qcFormatDate(iso){
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) +
         " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function qcFormatSeconds(total){
  total = Math.max(0, Math.floor(total || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function qcDifficultyBadgeClass(d){
  if (d === "Easy") return "badge-easy";
  if (d === "Hard") return "badge-hard";
  return "badge-medium";
}
