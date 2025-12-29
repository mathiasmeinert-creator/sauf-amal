// ============================
// 1) Supabase config (eintragen)
// ============================
const SUPABASE_URL = "https://qhjclvfwreiggvjcwpwm.supabase.co";      // <- hier eintragen
const SUPABASE_ANON_KEY = "sb_publishable_JXWcFdXoS0b-MGnW_Yecaw_FoRWos6B"; // <- hier eintragen

const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const sb = hasSupabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// UI
const logoutBtn = document.getElementById("logoutBtn");
const syncState = document.getElementById("syncState");

const folderList = document.getElementById("folderList");
const personTitle = document.getElementById("personTitle");
const personHint = document.getElementById("personHint");

const genderEl = document.getElementById("gender");
const heightEl = document.getElementById("heightCm");
const weightEl = document.getElementById("weightKg");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const profileStatus = document.getElementById("profileStatus");

const drinkButtons = document.getElementById("drinkButtons");
const drinkStatus = document.getElementById("drinkStatus");

const filterWho = document.getElementById("filterWho");
const refreshBtn = document.getElementById("refreshBtn");
const drinkTableBody = document.getElementById("drinkTableBody");
const tableHint = document.getElementById("tableHint");

const promilleNow = document.getElementById("promilleNow");
const promilleSub = document.getElementById("promilleSub");

// Summary
const summaryBars = document.getElementById("summaryBars");
const summaryHint = document.getElementById("summaryHint");

// Folder-Namen aus Sidebar
const PEOPLE = [...document.querySelectorAll("#folderList li")].map(li => li.dataset.name);

// ============================
// 2) Drinks (mit 2cl & 4cl Shots)
// ============================
const ETHANOL_DENSITY_G_PER_ML = 0.789;

// Fixe Skala fürs Diagramm
const SUMMARY_MAX_PROMILLE = 3.0;

const DRINKS = [
  { key: "beer_05",   label: "0,5 Bier",             ml: 500, abv: 0.05 },
  { key: "beer_033",  label: "0,33 Bier",            ml: 330, abv: 0.05 },
  { key: "pfiff",     label: "Pfiff",                ml: 200, abv: 0.05 },
  { key: "spritzer",  label: "Spritzer (1 Glas)",    ml: 250, abv: 0.06 },
  { key: "wine_btl",  label: "Flasche Wein (weiß)",  ml: 750, abv: 0.12 },

  // Shots: 2 cl & 4 cl
  { key: "shot375_2", label: "Shot 37,5% (2 cl)",    ml: 20,  abv: 0.375 },
  { key: "shot375_4", label: "Shot 37,5% (4 cl)",    ml: 40,  abv: 0.375 },
  { key: "shot40_2",  label: "Shot 40% (2 cl)",      ml: 20,  abv: 0.40 },
  { key: "shot40_4",  label: "Shot 40% (4 cl)",      ml: 40,  abv: 0.40 }
];

function gramsAlcohol(ml, abv) {
  return ml * abv * ETHANOL_DENSITY_G_PER_ML;
}

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" });
}

function setSyncPill() {
  syncState.textContent = hasSupabase ? "shared (supabase)" : "offline mode";
}

// ============================
// 3) Promille-Schätzung (Spaß-grob)
// ============================
const DEFAULT_AGE = 25;
const BETA_PER_HOUR = 0.15; // ‰/h grob

function tbwWatsonLiters({ gender, weightKg, heightCm, age = DEFAULT_AGE }) {
  const w = Number(weightKg);
  const h = Number(heightCm);
  const a = Number(age);

  if (gender === "m") {
    return 2.447 - 0.09516 * a + 0.1074 * h + 0.3362 * w;
  }
  return -2.097 + 0.1069 * h + 0.2466 * w;
}

function estimatePromilleNow(profile, drinksForPerson) {
  if (!profile) return null;

  const tbwL = tbwWatsonLiters(profile);
  if (!isFinite(tbwL) || tbwL <= 0) return null;

  const now = Date.now();
  const totalA = drinksForPerson.reduce((sum, d) => sum + Number(d.grams_alcohol || 0), 0);

  if (totalA <= 0) return { promille: 0, tbwL, hoursSinceFirst: 0, totalA };

  const earliest = Math.min(...drinksForPerson.map(d => new Date(d.created_at).getTime()));
  const hours = Math.max(0, (now - earliest) / (1000 * 60 * 60));

  const rawPromille = (totalA / (tbwL * 1000)) * 1000;
  const promille = Math.max(0, rawPromille - BETA_PER_HOUR * hours);

  return { promille, tbwL, hoursSinceFirst: hours, totalA };
}

// ============================
// 4) Data layer: Supabase oder local fallback
// ============================
const LS_KEY = "funsite_v1";

function lsLoad() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
  catch { return {}; }
}
function lsSave(data) {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

async function upsertProfile(profile) {
  if (hasSupabase) return sb.from("profiles").upsert(profile).select().single();

  const data = lsLoad();
  data.profiles = data.profiles || {};
  data.profiles[profile.name] = profile;
  lsSave(data);
  return { data: profile, error: null };
}

async function fetchProfile(name) {
  if (hasSupabase) return sb.from("profiles").select("*").eq("name", name).maybeSingle();

  const data = lsLoad();
  return { data: data.profiles?.[name] || null, error: null };
}

async function addDrink(row) {
  if (hasSupabase) return sb.from("drinks").insert(row).select().single();

  const data = lsLoad();
  data.drinks = data.drinks || [];
  const fake = { id: Date.now(), ...row, created_at: new Date().toISOString() };
  data.drinks.unshift(fake);
  lsSave(data);
  return { data: fake, error: null };
}

async function fetchDrinks(filterName = "ALL") {
  if (hasSupabase) {
    let q = sb.from("drinks").select("*").order("created_at", { ascending: false }).limit(250);
    if (filterName !== "ALL") q = q.eq("name", filterName);
    return q;
  }

  const data = lsLoad();
  const all = (data.drinks || []).slice();
  const filtered = filterName === "ALL" ? all : all.filter(d => d.name === filterName);
  return { data: filtered, error: null };
}

async function deleteDrink(id) {
  if (hasSupabase) return sb.from("drinks").delete().eq("id", id);

  const data = lsLoad();
  data.drinks = (data.drinks || []).filter(d => String(d.id) !== String(id));
  lsSave(data);
  return { data: null, error: null };
}

// ============================
// 5) UI wiring
// ============================
let currentPerson = null;

function renderDrinkButtons() {
  drinkButtons.innerHTML = "";
  for (const d of DRINKS) {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.type = "button";
    btn.textContent = d.label;
    btn.addEventListener("click", () => onAddDrink(d));
    drinkButtons.appendChild(btn);
  }
}

function fillFilterDropdown() {
  filterWho.innerHTML = `<option value="ALL">Alle</option>`;
  for (const p of PEOPLE) {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    filterWho.appendChild(opt);
  }
}

function setActiveFolder(name) {
  document.querySelectorAll("#folderList li").forEach(li => li.classList.remove("active"));
  const li = document.querySelector(`#folderList li[data-name="${CSS.escape(name)}"]`);
  if (li) li.classList.add("active");
}

async function loadPerson(name) {
  currentPerson = name;
  setActiveFolder(name);

  personTitle.textContent = `📁 ${name}`;
  personHint.textContent = "Profil speichern, Getränke eintragen, Promille live schätzen.";

  const prof = await fetchProfile(name);
  if (prof.error) {
    profileStatus.textContent = "Profil konnte nicht geladen werden.";
  } else if (prof.data) {
    genderEl.value = prof.data.gender;
    heightEl.value = prof.data.height_cm;
    weightEl.value = prof.data.weight_kg;
    profileStatus.textContent = "Profil geladen.";
  } else {
    profileStatus.textContent = "Kein Profil gespeichert (optional).";
  }

  await refreshAll();
}

async function refreshTable() {
  const who = filterWho.value;
  const res = await fetchDrinks(who);

  if (res.error) {
    drinkTableBody.innerHTML = `<tr><td colspan="5">Fehler beim Laden</td></tr>`;
    return;
  }

  const rows = res.data || [];
  drinkTableBody.innerHTML = rows.map(r => `
    <tr>
      <td>${fmtDate(r.created_at)}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.drink_type)}</td>
      <td>${Number(r.grams_alcohol).toFixed(1)}</td>
      <td class="actions">
        <button class="icon-btn" data-del-id="${r.id}" title="Löschen">🗑️</button>
      </td>
    </tr>
  `).join("");

  tableHint.textContent = `Zeige ${rows.length} Einträge (max 250).`;
}

async function refreshPromille() {
  if (!currentPerson) {
    promilleNow.textContent = "–";
    promilleSub.textContent = "–";
    return;
  }

  const profRes = await fetchProfile(currentPerson);
  const drinksRes = await fetchDrinks(currentPerson);

  if (!profRes.data) {
    promilleNow.textContent = "–";
    promilleSub.textContent = "Profil fehlt";
    return;
  }

  const est = estimatePromilleNow(
    { gender: profRes.data.gender, heightCm: profRes.data.height_cm, weightKg: profRes.data.weight_kg },
    drinksRes.data || []
  );

  if (!est) {
    promilleNow.textContent = "–";
    promilleSub.textContent = "nicht berechenbar";
    return;
  }

  promilleNow.textContent = est.promille.toFixed(2) + " ‰";
  promilleSub.textContent = `${est.totalA.toFixed(1)} g Alkohol • Abbau ~${BETA_PER_HOUR} ‰/h`;
}

// Summary Balken (fixe Skala bis 3‰)
async function refreshSummary() {
  if (!summaryBars || !summaryHint) return;

  const profRes = hasSupabase
    ? await sb.from("profiles").select("*")
    : { data: Object.values((lsLoad().profiles || {})), error: null };

  const drinksRes = hasSupabase
    ? await sb.from("drinks").select("*").order("created_at", { ascending: false }).limit(2000)
    : { data: (lsLoad().drinks || []), error: null };

  if (profRes.error || drinksRes.error) {
    summaryHint.textContent = "Konnte Summary nicht laden.";
    summaryBars.innerHTML = "";
    return;
  }

  const profilesByName = new Map((profRes.data || []).map(p => [p.name, p]));
  const drinks = drinksRes.data || [];

  const byPerson = new Map();
  for (const p of PEOPLE) byPerson.set(p, []);
  for (const d of drinks) {
    if (!byPerson.has(d.name)) byPerson.set(d.name, []);
    byPerson.get(d.name).push(d);
  }

  const entries = PEOPLE.map(name => {
    const prof = profilesByName.get(name);
    const list = byPerson.get(name) || [];
    if (!prof) return { name, promille: null };

    const est = estimatePromilleNow(
      { gender: prof.gender, heightCm: prof.height_cm, weightKg: prof.weight_kg },
      list
    );
    return { name, promille: est ? est.promille : null };
  });

  entries.sort((a, b) => (b.promille ?? -1) - (a.promille ?? -1));

  summaryBars.innerHTML = entries.map(e => {
    const missing = typeof e.promille !== "number";
    const capped = missing ? 0 : Math.min(SUMMARY_MAX_PROMILLE, e.promille);
    const pct = missing ? 0 : (capped / SUMMARY_MAX_PROMILLE) * 100;
const label = missing ? "–" : `${e.promille.toFixed(2)} ‰`;

let levelClass = "";
if (!missing) {
  if (e.promille <= 0.5) levelClass = "level-green";
  else if (e.promille <= 1.1) levelClass = "level-yellow";
  else if (e.promille <= 1.75) levelClass = "level-orange";
  else levelClass = "level-red";
}

return `
  <div class="bar-row ${missing ? "missing" : ""}">
    <div class="bar-name">${escapeHtml(e.name)}</div>
    <div class="bar-track">
      <div class="bar-fill ${levelClass}" style="width:${pct.toFixed(1)}%"></div>
    </div>
    <div class="bar-value">${label}</div>
  </div>
`;
  }).join("");

  summaryHint.textContent = `Skala fix bis ${SUMMARY_MAX_PROMILLE.toFixed(2)} ‰ (Balken capped).`;
}

async function refreshAll() {
  await refreshTable();
  await refreshPromille();
  await refreshSummary();
}

async function onSaveProfile() {
  if (!currentPerson) return;

  const gender = genderEl.value;
  const height_cm = Number(heightEl.value);
  const weight_kg = Number(weightEl.value);

  if (!gender || !height_cm || !weight_kg) {
    profileStatus.textContent = "Bitte Geschlecht, Größe und Gewicht ausfüllen.";
    return;
  }

  profileStatus.textContent = "Speichere…";

  const res = await upsertProfile({
    name: currentPerson,
    gender,
    height_cm,
    weight_kg,
    updated_at: new Date().toISOString()
  });

  if (res.error) {
    profileStatus.textContent = "Speichern fehlgeschlagen.";
  } else {
    profileStatus.textContent = "Profil gespeichert ✅";
    await refreshAll();
  }
}

async function onAddDrink(drinkDef) {
  if (!currentPerson) {
    drinkStatus.textContent = "Bitte links erst einen Folder auswählen.";
    return;
  }

  const g = gramsAlcohol(drinkDef.ml, drinkDef.abv);
  drinkStatus.textContent = "Trage ein…";

  const res = await addDrink({
    name: currentPerson,
    drink_type: drinkDef.label,
    grams_alcohol: Number(g.toFixed(3))
  });

  if (res.error) {
    drinkStatus.textContent = "Eintragen fehlgeschlagen.";
  } else {
    drinkStatus.textContent = `Eingetragen: ${drinkDef.label} ✅`;
    await refreshAll();
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ============================
// Init
// ============================
setSyncPill();
renderDrinkButtons();
fillFilterDropdown();

folderList.addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (!li) return;
  loadPerson(li.dataset.name);
});

saveProfileBtn.addEventListener("click", onSaveProfile);

refreshBtn.addEventListener("click", refreshAll);
filterWho.addEventListener("change", refreshTable);

// Delete-Click
drinkTableBody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-del-id]");
  if (!btn) return;

  const id = btn.dataset.delId;
  const ok = confirm("Eintrag wirklich löschen?");
  if (!ok) return;

  const res = await deleteDrink(id);
  if (res.error) {
    alert("Löschen fehlgeschlagen. (Supabase DELETE-Policy für drinks nötig)");
    return;
  }
  await refreshAll();
});

logoutBtn.addEventListener("click", () => {
  sessionStorage.removeItem("isLoggedIn");
  window.location.href = "index.html";
});

// Auto-Update alle 30s (Abbau sichtbar)
setInterval(() => {
  refreshPromille();
  refreshSummary();
}, 30000);