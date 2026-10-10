(() => {
  const $ = selector => document.querySelector(selector);
  const db = window.supabase?.createClient(window.STORE_SUPABASE_URL, window.STORE_SUPABASE_PUBLISHABLE_KEY);

  const setMessage = (selector, text, isError = false) => {
    const node = $(selector);
    if (!node) return;
    node.textContent = text;
    node.className = `form-message${isError ? ' error' : ''}`;
  };

  const showUpdateForm = () => {
    $('#requestCard').hidden = true;
    $('#updateCard').hidden = false;
  };

  const hasRecoveryToken = () => new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery';

  const requestReset = async event => {
    event.preventDefault();
    const email = $('#resetEmail').value.trim();
    const redirectTo = new URL('reset-password.html', window.location.href).href;
    setMessage('#requestMsg', 'Sending your reset link…');
    const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      setMessage('#requestMsg', error.message || 'The reset link could not be sent. Please try again.', true);
      return;
    }
    setMessage('#requestMsg', 'If this email is an Owner Panel account, a reset link has been sent. Check your inbox and spam folder.');
  };

  const updatePassword = async event => {
    event.preventDefault();
    const password = $('#newPassword').value;
    if (password !== $('#confirmPassword').value) {
      setMessage('#updateMsg', 'The two passwords do not match.', true);
      return;
    }
    setMessage('#updateMsg', 'Saving your new password…');
    const { error } = await db.auth.updateUser({ password });
    if (error) {
      setMessage('#updateMsg', error.message || 'Your password could not be changed. Request another reset link and try again.', true);
      return;
    }
    setMessage('#updateMsg', 'Password saved. Taking you back to the Owner Panel…');
    window.setTimeout(() => { window.location.replace('admin.html'); }, 1300);
  };

  if (!db) {
    setMessage('#requestMsg', 'Supabase configuration is missing.', true);
    return;
  }

  $('#requestForm').addEventListener('submit', requestReset);
  $('#updateForm').addEventListener('submit', updatePassword);
  db.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' || (session && hasRecoveryToken())) showUpdateForm();
  });
  if (hasRecoveryToken()) showUpdateForm();
})();
