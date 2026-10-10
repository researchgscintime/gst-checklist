const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const loginBtn = document.getElementById("loginBtn");

// If already logged in, skip straight to the dashboard.
api.auth.me().then(
  () => { window.location.href = "/index.html"; },
  () => {} // not logged in - stay on this page
);

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.classList.add("hidden");
  loginBtn.disabled = true;
  try {
    await api.auth.login(
      document.getElementById("username").value.trim(),
      document.getElementById("password").value
    );
    window.location.href = "/index.html";
  } catch (err) {
    loginError.textContent = err.message;
    loginError.classList.remove("hidden");
    loginBtn.disabled = false;
  }
});
