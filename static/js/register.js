/* static/js/register.js — client-side validation mirrors (not replaces) backend validation */
(function(){
  const NAME_RE = /^[A-Za-z][A-Za-z .'-]{1,79}$/;
  const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  const PHONE_RE = /^\+?[0-9]{7,15}$/;
  const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

  const form = document.getElementById("register-form");
  const submitBtn = document.getElementById("submit-btn");

  function setError(field, msg){ document.getElementById(`err-${field}`).textContent = msg || ""; }

  function validate(){
    let ok = true;
    const full_name = document.getElementById("full_name").value.trim();
    const email = document.getElementById("email").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const password = document.getElementById("password").value;
    const confirm_password = document.getElementById("confirm_password").value;

    setError("full_name",""); setError("email",""); setError("phone","");
    setError("password",""); setError("confirm_password","");

    if (!NAME_RE.test(full_name)){ setError("full_name","Enter a valid name (2-80 letters)."); ok = false; }
    if (!EMAIL_RE.test(email)){ setError("email","Enter a valid email address."); ok = false; }
    if (phone && !PHONE_RE.test(phone)){ setError("phone","Enter a valid phone number."); ok = false; }
    if (!PASSWORD_RE.test(password)){ setError("password","Min 8 characters, with a letter and a number."); ok = false; }
    if (confirm_password !== password){ setError("confirm_password","Passwords do not match."); ok = false; }
    return ok;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validate()) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Creating account...";
    try{
      const data = await api.post("/auth/register/", {
        full_name: document.getElementById("full_name").value.trim(),
        email: document.getElementById("email").value.trim(),
        phone: document.getElementById("phone").value.trim(),
        role: document.getElementById("role").value,
        password: document.getElementById("password").value,
        confirm_password: document.getElementById("confirm_password").value,
      });
      qcSetToken(data.token);
      qcSetUser(data.user);
      qcToast("Account created! Redirecting...", "success");
      window.location.href = data.user.role === "faculty" ? "/faculty/dashboard/" : "/dashboard/";
    } catch(err){
      qcToast(err.message, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Create Account";
    }
  });
})();
