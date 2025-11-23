// ============================================
// ADMIN USER MANAGEMENT JAVASCRIPT
// ============================================

// Show create manager modal
function showCreateManagerModal() {
    const modal = document.getElementById('createManagerModal');
    modal.classList.add('show');
}

// Close create manager modal
function closeCreateManagerModal() {
    const modal = document.getElementById('createManagerModal');
    modal.classList.remove('show');
    document.getElementById('createManagerForm').reset();
}

// Create manager account
function createManager(event) {
    event.preventDefault();
    
    const username = document.getElementById('managerUsername').value;
    const password = document.getElementById('managerPassword').value;
    const userTag = document.getElementById('managerUserTag').value;
    const managedTagsInput = document.getElementById('managedTags').value;
    const managedTags = managedTagsInput ? managedTagsInput.split(',').map(t => t.trim()) : [];
    
    // Validate password
    if (!validatePassword(password)) {
        alert('Password must contain at least 8 characters with uppercase, lowercase, number, and special character');
        return;
    }
    
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
    submitBtn.disabled = true;
    
    fetch('/admin/create-manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, userTag, managedTags })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification('Success!', 'Manager account created successfully', 'success');
            setTimeout(() => location.reload(), 1500);
        } else {
            showNotification('Error', data.error || 'Failed to create manager', 'error');
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Error', 'Failed to create manager account', 'error');
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    });
}

// Validate password strength
function validatePassword(password) {
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    const isLongEnough = password.length >= 8;
    
    return hasUpperCase && hasLowerCase && hasNumber && hasSpecialChar && isLongEnough;
}

// Ban user
function banUser(userId, username) {
    const reason = prompt(`Enter reason for banning ${username}:`);
    if (reason === null) return; // User cancelled
    
    if (!reason.trim()) {
        alert('Please provide a reason for the ban');
        return;
    }
    
    if (!confirm(`Are you sure you want to permanently ban ${username}?`)) {
        return;
    }
    
    fetch(`/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification('Success!', `User ${username} has been permanently banned`, 'success');
            setTimeout(() => location.reload(), 1500);
        } else {
            showNotification('Error', data.error || 'Failed to ban user', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Error', 'Failed to ban user', 'error');
    });
}

// Unban user
function unbanUser(userId, username) {
    if (!confirm(`Are you sure you want to unban ${username}?`)) {
        return;
    }
    
    fetch(`/admin/users/${userId}/unban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification('Success!', `User ${username} has been unbanned`, 'success');
            setTimeout(() => location.reload(), 1500);
        } else {
            showNotification('Error', data.error || 'Failed to unban user', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Error', 'Failed to unban user', 'error');
    });
}

// Change user role
function changeRole(userId, username, currentRole) {
    const roleOptions = ['user', 'manager', 'administrator'];
    const roleSelect = document.createElement('select');
    roleSelect.style.cssText = 'padding: 8px; font-size: 14px; margin: 10px 0;';
    
    roleOptions.forEach(role => {
        const option = document.createElement('option');
        option.value = role;
        option.textContent = role.charAt(0).toUpperCase() + role.slice(1);
        if (role === currentRole) option.selected = true;
        roleSelect.appendChild(option);
    });
    
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <div class="modal-header">
                <h2><i class="fas fa-user-tag"></i> Change Role for ${username}</h2>
                <span class="close" onclick="this.closest('.modal').remove()">&times;</span>
            </div>
            <div style="padding: 25px;">
                <label style="display: block; color: #007BFF; margin-bottom: 10px; font-weight: bold;">
                    <i class="fas fa-shield-alt"></i> Select New Role
                </label>
                <div id="roleSelectContainer"></div>
                <button class="btn btn-primary btn-full" style="margin-top: 15px;" onclick="submitRoleChange('${userId}', '${username}')">
                    <i class="fas fa-check"></i> Change Role
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.getElementById('roleSelectContainer').appendChild(roleSelect);
}

// Submit role change
function submitRoleChange(userId, username) {
    const roleSelect = document.querySelector('#roleSelectContainer select');
    const newRole = roleSelect.value;
    
    fetch(`/admin/users/${userId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification('Success!', `Role changed for ${username}`, 'success');
            setTimeout(() => location.reload(), 1500);
        } else {
            showNotification('Error', data.error || 'Failed to change role', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Error', 'Failed to change role', 'error');
    });
}

// Delete user
function deleteUser(userId, username) {
    if (!confirm(`Are you sure you want to DELETE the account of ${username}? This action cannot be undone!`)) {
        return;
    }
    
    const finalConfirm = prompt(`Type "${username}" to confirm deletion:`);
    if (finalConfirm !== username) {
        alert('Username did not match. Deletion cancelled.');
        return;
    }
    
    fetch(`/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification('Success!', `User ${username} has been deleted`, 'success');
            setTimeout(() => location.reload(), 1500);
        } else {
            showNotification('Error', data.error || 'Failed to delete user', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Error', 'Failed to delete user', 'error');
    });
}

// Show notification
function showNotification(title, message, type) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-header">
            <strong>${title}</strong>
            <button onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="notification-body">${message}</div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Close modal when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('show');
    }
}

// Auto-fill user tag based on username
document.getElementById('managerUsername')?.addEventListener('input', function() {
    const userTag = document.getElementById('managerUserTag');
    if (this.value && !userTag.value) {
        userTag.value = `u/${this.value}`;
    }
});

// Add notification styles
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        min-width: 300px;
        background: #1f1f1f;
        border-radius: 8px;
        padding: 15px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        z-index: 9999;
        animation: slideIn 0.3s ease-out;
    }
    
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    .notification-success {
        border-left: 4px solid #4CAF50;
    }
    
    .notification-error {
        border-left: 4px solid #f44336;
    }
    
    .notification-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        color: #fff;
    }
    
    .notification-header button {
        background: none;
        border: none;
        color: #aaa;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        width: 30px;
        height: 30px;
    }
    
    .notification-header button:hover {
        color: #fff;
    }
    
    .notification-body {
        color: #ddd;
        font-size: 14px;
    }
`;
document.head.appendChild(notificationStyles);
