<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Change Password - TikTalk</title>
    <link rel="stylesheet" href="/styles/login.css">
    <script src="https://kit.fontawesome.com/2616052655.js" crossorigin="anonymous"></script>
</head>
<body>
    <main>
        <section class="login-container">
            <h2>Change Password</h2>
            <form id="change-password-form">
                <label for="current-password">Current Password:</label>
                <div class="password-container">
                    <input type="password" id="current-password" name="currentPassword" required placeholder="Enter current password">
                    <i id="toggle-eye-current" class="fa-solid fa-eye-slash" onclick="togglePasswordVisibility('current-password', 'current')"></i>
                </div>

                <label for="new-password">New Password:</label>
                <div class="password-container">
                    <input type="password" id="new-password" name="newPassword" required placeholder="Enter new password">
                    <i id="toggle-eye-new" class="fa-solid fa-eye-slash" onclick="togglePasswordVisibility('new-password', 'new')"></i>
                </div>

                <label for="confirm-password">Confirm New Password:</label>
                <div class="password-container">
                    <input type="password" id="confirm-password" name="confirmPassword" required placeholder="Confirm new password">
                    <i id="toggle-eye-confirm" class="fa-solid fa-eye-slash" onclick="togglePasswordVisibility('confirm-password', 'confirm')"></i>
                </div>

                <p class="password-warning" id="password-warning" style="display: none;">⚠ Passwords do not match</p>
                <p class="error-message" id="error-message" style="color: red; display: none;"></p>
                <p class="success-message" id="success-message" style="color: green; display: none;"></p>

                <button type="submit" id="change-btn">Change Password</button>
                <p><a href="/settings">Back to Settings</a></p>
            </form>
        </section>
    </main>

    <footer>
        <p>&copy; 2025 TikTalk Archers</p>
    </footer>

    <script>
        function togglePasswordVisibility(fieldId, type) {
            let passwordField = document.getElementById(fieldId);
            let eyeIcon = document.getElementById('toggle-eye-' + type);

            if (passwordField.type === 'password') {
                passwordField.type = 'text';
                eyeIcon.classList.remove('fa-eye-slash');
                eyeIcon.classList.add('fa-eye');
            } else {
                passwordField.type = 'password';
                eyeIcon.classList.remove('fa-eye');
                eyeIcon.classList.add('fa-eye-slash');
            }
        }

        document.getElementById('change-password-form').addEventListener('input', function () {
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;
            const warning = document.getElementById('password-warning');
            const changeBtn = document.getElementById('change-btn');

            if (newPassword && confirmPassword) {
                if (newPassword !== confirmPassword) {
                    warning.style.display = 'block';
                    changeBtn.disabled = true;
                } else {
                    warning.style.display = 'none';
                    changeBtn.disabled = false;
                }
            } else {
                warning.style.display = 'none';
            }
        });

        document.getElementById('change-password-form').addEventListener('submit', async function (e) {
            e.preventDefault();

            const currentPassword = document.getElementById('current-password').value;
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            const errorMsg = document.getElementById('error-message');
            const successMsg = document.getElementById('success-message');

            errorMsg.style.display = 'none';
            successMsg.style.display = 'none';

            try {
                const response = await fetch('/change-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    successMsg.textContent = data.message;
                    successMsg.style.display = 'block';
                    
                    // Clear form
                    document.getElementById('change-password-form').reset();
                    
                    // Redirect after 2 seconds
                    setTimeout(() => {
                        window.location.href = '/profile';
                    }, 2000);
                } else {
                    errorMsg.textContent = data.error || 'Failed to change password';
                    errorMsg.style.display = 'block';
                }
            } catch (error) {
                console.error('Error:', error);
                errorMsg.textContent = 'An error occurred. Please try again.';
                errorMsg.style.display = 'block';
            }
        });
    </script>
</body>
</html>