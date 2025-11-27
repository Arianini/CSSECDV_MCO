// ============================================
// ADMIN USER MANAGEMENT JAVASCRIPT
// ============================================

let currentUserId = null;
let currentUsername = null;

// Show create user modal
function showCreateUserModal() {
    const modal = document.getElementById('createUserModal');
    modal.style.display = 'block';
    setTimeout(() => modal.classList.add('show'), 10);
}

// Close create user modal
function closeCreateUserModal() {
    const modal = document.getElementById('createUserModal');
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        document.getElementById('createUserForm').reset();
    }, 300);
}

// Toggle managed tags field based on role selection
function toggleManagedTagsField() {
    const role = document.getElementById('newUserRole').value;
    const managedTagsGroup = document.getElementById('managedTagsGroup');
    
    if (role === 'manager') {
        managedTagsGroup.style.display = 'block';
    } else {
        managedTagsGroup.style.display = 'none';
    }
}

// Create user account
async function createUser(event) {
    event.preventDefault();
    
    const role = document.getElementById('newUserRole').value;
    const username = document.getElementById('newUsername').value;
    const password = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const userTag = document.getElementById('newUserTag').value;
    const securityQuestion = document.getElementById('newSecurityQuestion').value;
    const securityAnswer = document.getElementById('newSecurityAnswer').value;
    
    // Get selected tags from multi-select
    const managedTagsSelect = document.getElementById('newManagedTags');
    const managedTags = Array.from(managedTagsSelect.selectedOptions).map(option => option.value);
    
    // Validate passwords match
    if (password !== confirmPassword) {
        showNotification('Error', 'Passwords do not match', 'error');
        return;
    }
    
    // Validate password
    if (!validatePassword(password)) {
        showNotification('Error', 'Password must contain at least 8 characters with uppercase, lowercase, number, and special character', 'error');
        return;
    }
    
    // Validate security question and answer
    if (!securityQuestion || !securityAnswer) {
        showNotification('Error', 'Security question and answer are required', 'error');
        return;
    }
    
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
    submitBtn.disabled = true;
    
    try {
        const response = await fetch('/admin/users/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                role, 
                username, 
                password, 
                userTag, 
                securityQuestion, 
                securityAnswer, 
                managedTags 
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Success!', 'User account created successfully', 'success');
            setTimeout(() => location.reload(), 1500);
        } else {
            showNotification('Error', data.error || 'Failed to create user', 'error');
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    } catch (error) {
        // console.error('Error:', error);
        showNotification('Error', 'Failed to create user account', 'error');
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
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

// Real-time password strength validation display
function validatePasswordStrength() {
    const password = document.getElementById('newPassword').value;
    
    // Check each requirement
    const hasLength = password.length >= 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    
    // Update UI for each requirement
    updateRequirement('req-length', hasLength);
    updateRequirement('req-uppercase', hasUpperCase);
    updateRequirement('req-lowercase', hasLowerCase);
    updateRequirement('req-number', hasNumber);
    updateRequirement('req-special', hasSpecialChar);
    
    // Also check password match if confirm field has value
    validatePasswordMatch();
}

// Validate password match
function validatePasswordMatch() {
    const password = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const messageElement = document.getElementById('passwordMatchMessage');
    
    if (confirmPassword.length === 0) {
        messageElement.textContent = '';
        messageElement.style.color = '#888';
        return true;
    }
    
    if (password === confirmPassword) {
        messageElement.textContent = '✓ Passwords match';
        messageElement.style.color = '#28a745';
        return true;
    } else {
        messageElement.textContent = '✗ Passwords do not match';
        messageElement.style.color = '#dc3545';
        return false;
    }
}

// Toggle password visibility
function togglePasswordVisibility(field) {
    let passwordField = document.getElementById(field);
    let eyeIcon = document.getElementById('toggle-eye-' + field);

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

// Update requirement UI
function updateRequirement(id, met) {
    const element = document.getElementById(id);
    if (met) {
        element.classList.add('met');
        element.querySelector('i').className = 'fas fa-check-circle';
    } else {
        element.classList.remove('met');
        element.querySelector('i').className = 'fas fa-circle';
    }
}

// Show restrict user modal
function showRestrictModal(userId, username) {
    currentUserId = userId;
    currentUsername = username;
    
    const modal = document.getElementById('restrictModal');
    document.getElementById('restrictUsername').textContent = username;
    modal.style.display = 'block';
    setTimeout(() => modal.classList.add('show'), 10);
}

// Close restrict modal
function closeRestrictModal() {
    const modal = document.getElementById('restrictModal');
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        document.getElementById('restrictForm').reset();
    }, 300);
}

// Submit restrict action
async function submitRestrict(event) {
    event.preventDefault();
    
    const hours = parseInt(document.getElementById('restrictDuration').value);
    const reason = document.getElementById('restrictReason').value.trim();
    
    if (!reason) {
        showNotification('Error', 'Please provide a reason for the restriction', 'error');
        return;
    }
    
    closeRestrictModal();
    
    try {
        const response = await fetch(`/admin/users/${currentUserId}/restrict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hours, reason })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Success!', `User ${currentUsername} has been restricted for ${hours} hours`, 'success');
            setTimeout(() => location.reload(), 1500);
        } else {
            showNotification('Error', data.error || 'Failed to restrict user', 'error');
        }
    } catch (error) {
        // console.error('Error:', error);
        showNotification('Error', 'Failed to restrict user', 'error');
    }
}

// Show ban user modal
function showBanModal(userId, username) {
    currentUserId = userId;
    currentUsername = username;
    
    const modal = document.getElementById('banModal');
    document.getElementById('banUsername').textContent = username;
    modal.style.display = 'block';
    setTimeout(() => modal.classList.add('show'), 10);
}

// Close ban modal
function closeBanModal() {
    const modal = document.getElementById('banModal');
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        document.getElementById('banForm').reset();
    }, 300);
}

// Submit ban action
async function submitBan(event) {
    event.preventDefault();
    
    const reason = document.getElementById('banReason').value.trim();
    
    if (!reason) {
        showNotification('Error', 'Please provide a reason for the ban', 'error');
        return;
    }
    
    closeBanModal();
    
    try {
        const response = await fetch(`/admin/users/${currentUserId}/ban`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Success!', `User ${currentUsername} has been permanently banned`, 'success');
            setTimeout(() => location.reload(), 1500);
        } else {
            showNotification('Error', data.error || 'Failed to ban user', 'error');
        }
    } catch (error) {
        // console.error('Error:', error);
        showNotification('Error', 'Failed to ban user', 'error');
    }
}

// Unban user
async function unbanUser(userId, username) {
    if (!confirm(`Are you sure you want to unban ${username}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/admin/users/${userId}/unban`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Success!', `User ${username} has been unbanned`, 'success');
            setTimeout(() => location.reload(), 1500);
        } else {
            showNotification('Error', data.error || 'Failed to unban user', 'error');
        }
    } catch (error) {
        // console.error('Error:', error);
        showNotification('Error', 'Failed to unban user', 'error');
    }
}

// Change user role
function changeRole(userId, username, currentRole) {
    currentUserId = userId;
    currentUsername = username;
    
    const roleOptions = ['user', 'manager', 'administrator'];
    
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <div class="modal-header">
                <h2><i class="fas fa-user-tag"></i> Change Role for ${username}</h2>
                <span class="close" onclick="this.closest('.modal').remove()">&times;</span>
            </div>
            <div style="padding: 25px;">
                <div class="form-group">
                    <label style="display: block; color: #007BFF; margin-bottom: 10px; font-weight: bold;">
                        <i class="fas fa-shield-alt"></i> Select New Role
                    </label>
                    <select id="roleSelect" style="width: 100%; padding: 10px; background: #2a2a2a; border: 1px solid #444; color: white; border-radius: 5px;">
                        ${roleOptions.map(role => `
                            <option value="${role}" ${role === currentRole ? 'selected' : ''}>
                                ${role.charAt(0).toUpperCase() + role.slice(1)}
                            </option>
                        `).join('')}
                    </select>
                </div>
                <button class="btn btn-primary btn-full" style="margin-top: 15px;" onclick="submitRoleChange()">
                    <i class="fas fa-check"></i> Change Role
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Submit role change
async function submitRoleChange() {
    const roleSelect = document.getElementById('roleSelect');
    const newRole = roleSelect.value;
    
    // Close the modal
    document.querySelector('.modal.show:last-child').remove();
    
    try {
        const response = await fetch(`/admin/users/${currentUserId}/role`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: newRole })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Success!', `Role changed for ${currentUsername}`, 'success');
            setTimeout(() => location.reload(), 1500);
        } else {
            showNotification('Error', data.error || 'Failed to change role', 'error');
        }
    } catch (error) {
        // console.error('Error:', error);
        showNotification('Error', 'Failed to change role', 'error');
    }
}

// Show delete user modal
function showDeleteModal(userId, username) {
    currentUserId = userId;
    currentUsername = username;
    
    const modal = document.getElementById('deleteModal');
    document.getElementById('deleteUsername').textContent = username;
    document.getElementById('deleteConfirm').placeholder = `Type ${username}`;
    modal.style.display = 'block';
    setTimeout(() => modal.classList.add('show'), 10);
}

// Close delete modal
function closeDeleteModal() {
    const modal = document.getElementById('deleteModal');
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        document.getElementById('deleteForm').reset();
    }, 300);
}

// Submit delete action
async function submitDelete(event) {
    event.preventDefault();
    
    const confirmUsername = document.getElementById('deleteConfirm').value;
    
    if (confirmUsername !== currentUsername) {
        showNotification('Error', 'Username did not match. Deletion cancelled.', 'error');
        return;
    }
    
    closeDeleteModal();
    
    try {
        const response = await fetch(`/admin/users/${currentUserId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Success!', `User ${currentUsername} has been deleted`, 'success');
            setTimeout(() => location.reload(), 1500);
        } else {
            showNotification('Error', data.error || 'Failed to delete user', 'error');
        }
    } catch (error) {
        // console.error('Error:', error);
        showNotification('Error', 'Failed to delete user', 'error');
    }
}

// Show notification
function showNotification(title, message, type) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-header">
            <strong>${title}</strong>
            <button onclick="this.parentElement.parentElement.remove()">&times;</button>
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
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            modal.classList.remove('show');
            setTimeout(() => modal.style.display = 'none', 300);
        });
    }
}

// Auto-fill user tag based on username
document.addEventListener('DOMContentLoaded', function() {
    const usernameInput = document.getElementById('newUsername');
    const userTagInput = document.getElementById('newUserTag');
    
    if (usernameInput && userTagInput) {
        usernameInput.addEventListener('input', function() {
            if (this.value && !userTagInput.value) {
                userTagInput.value = `u/${this.value}`;
            }
        });
    }
});