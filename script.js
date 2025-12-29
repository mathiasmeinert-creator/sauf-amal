const btn = document.getElementById("loginBtn");
const password = document.getElementById("password");
const status = document.getElementById("status");

const CORRECT_PASSWORD = "saufensaufensaufen";

function setLoading(isLoading) {
  btn.disabled = isLoading;
  password.disabled = isLoading;
}

btn.addEventListener("click", async () => {
  document.body.classList.remove("done"); // Flasche dreht wieder
  setLoading(true);
  status.textContent = "Login läuft...";

  // kleine "Processing"-Pause für den Effekt
  await new Promise((resolve) => setTimeout(resolve, 900));

  const entered = password.value;

  if (entered === CORRECT_PASSWORD) {
    document.body.classList.add("done"); // Flasche stoppt
    status.textContent = "Login abgeschlossen.";

    // ✅ Pseudo-Login merken
    sessionStorage.setItem("isLoggedIn", "true");

    // ✅ Weiterleitung zur „wahren“ Seite
    setTimeout(() => {
      window.location.href = "app.html";
    }, 600);

  } else {
    status.textContent = "Falsches Passwort. Versuch’s nochmal.";
  }

  setLoading(false);
});

// Enter-Taste
password.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !btn.disabled) btn.click();
});