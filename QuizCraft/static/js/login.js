(function(){
  const form = document.getElementById("login-form");
  const submitBtn = document.getElementById("submit-btn");
  const errorEl = document.getElementById("login-error");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    if (!email || !password){ errorEl.textContent = "Email and password are required."; return; }

    submitBtn.disabled = true;
    submitBtn.textContent = "Logging in...";
    try{
      const data = await api.post("/auth/login/", { email, password });
      qcSetToken(data.token);
      qcSetUser(data.user);
      qcToast(`Welcome back, ${data.user.full_name.split(" ")[0]}!`, "success");
      window.location.href = data.user.role === "faculty" ? "/faculty/dashboard/" : "/dashboard/";
    } catch(err){
      errorEl.textContent = err.message;
      submitBtn.disabled = false;
      submitBtn.textContent = "Log In";
    }
  });
})();
