// ============================================
// MANAGER REPORTS DASHBOARD JAVASCRIPT
// ============================================

// Global variables for modal state
let currentReportId = null;
let currentAction = null;

// View full post in modal
function viewFullPost(postId, username, caption, imageUrl, postTag, createdAt) {
    const modal = document.getElementById('postViewModal');
    const modalImage = document.getElementById('modalPostImage');
    const modalImageSection = document.getElementById('modalImageSection');
    const modalUsername = document.getElementById('modalUsername');
    const modalCaption = document.getElementById('modalCaption');
    const modalTag = document.getElementById('modalTag');
    const modalTimestamp = document.getElementById('modalTimestamp');
    
    // Set content
    modalUsername.textContent = username;
    modalCaption.textContent = caption;
    modalTimestamp.textContent = createdAt;
    
    // Handle image
    if (imageUrl && imageUrl !== 'undefined') {
        modalImage.src = imageUrl;
        modalImageSection.style.display = 'block';
    } else {
        modalImageSection.style.display = 'none';
    }
    
    // Handle tag
    if (postTag && postTag !== 'undefined') {
        modalTag.innerHTML = `<span class="tag-badge">${postTag}</span>`;
        modalTag.style.display = 'block';
    } else {
        modalTag.style.display = 'none';
    }
    
    // Show modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

// Close post modal
function closePostModal() {
    const modal = document.getElementById('postViewModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Show custom action modal
function showActionModal(reportId, action) {
    currentReportId = reportId;
    currentAction = action;
    
    const actionMessages = {
        'hide_post': 'Hide this post',
        'delete_post': 'Delete this post',
        'warn_user': 'Warn the user',
        'restrict_user': 'Restrict user for 48 hours',
        'dismiss': 'Dismiss this report'
    };
    
    const modal = document.createElement('div');
    modal.className = 'custom-modal';
    modal.innerHTML = `
        <div class="custom-modal-overlay" onclick="closeActionModal()"></div>
        <div class="custom-modal-content">
            <h3>Confirm Action</h3>
            <p>Action: <strong>${actionMessages[action]}</strong></p>
            <label for="actionNotes">Enter notes for this action:</label>
            <textarea id="actionNotes" rows="4" placeholder="Provide detailed notes about this action..." required></textarea>
            <div class="custom-modal-buttons">
                <button class="btn-cancel" onclick="closeActionModal()">
                    <i class="fas fa-times"></i> Cancel
                </button>
                <button class="btn-confirm" onclick="confirmAction()">
                    <i class="fas fa-check"></i> Confirm
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    // Focus on textarea
    setTimeout(() => {
        document.getElementById('actionNotes').focus();
    }, 100);
}

// Close action modal
function closeActionModal() {
    const modal = document.querySelector('.custom-modal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = 'auto';
    }
    currentReportId = null;
    currentAction = null;
}

// Confirm action
function confirmAction() {
    const notes = document.getElementById('actionNotes').value.trim();
    
    if (!notes) {
        showNotification('Error', 'Please provide notes for this action', 'error');
        return;
    }
    
    closeActionModal();
    executeAction(currentReportId, currentAction, notes);
}

// Execute the action
function executeAction(reportId, action, notes) {
    showNotification('Processing...', 'Please wait', 'info');
    
    fetch(`/manager/reports/${reportId}/handle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification('Success!', data.message, 'success');
            setTimeout(() => location.reload(), 1500);
        } else {
            showNotification('Error', data.error || 'Failed to handle report', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Error', 'Failed to handle report', 'error');
    });
}

// Handle report action (wrapper function)
function handleReport(reportId, action) {
    showActionModal(reportId, action);
}

// Escalate report to admin
function escalateReport(reportId) {
    const modal = document.createElement('div');
    modal.className = 'custom-modal';
    modal.innerHTML = `
        <div class="custom-modal-overlay" onclick="closeEscalateModal()"></div>
        <div class="custom-modal-content">
            <h3>Escalate to Administrator</h3>
            <p>This report will be forwarded to an administrator for review.</p>
            <label for="escalateReason">Reason for escalation:</label>
            <textarea id="escalateReason" rows="4" placeholder="Explain why this requires admin attention..." required></textarea>
            <div class="custom-modal-buttons">
                <button class="btn-cancel" onclick="closeEscalateModal()">
                    <i class="fas fa-times"></i> Cancel
                </button>
                <button class="btn-confirm" onclick="confirmEscalate('${reportId}')">
                    <i class="fas fa-arrow-up"></i> Escalate
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    setTimeout(() => {
        document.getElementById('escalateReason').focus();
    }, 100);
}

// Close escalate modal
function closeEscalateModal() {
    const modal = document.querySelector('.custom-modal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = 'auto';
    }
}

// Confirm escalation
function confirmEscalate(reportId) {
    const reason = document.getElementById('escalateReason').value.trim();
    
    if (!reason) {
        showNotification('Error', 'Please provide a reason for escalation', 'error');
        return;
    }
    
    closeEscalateModal();
    showNotification('Processing...', 'Escalating report', 'info');
    
    fetch(`/manager/reports/${reportId}/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification('Success!', 'Report escalated to admin', 'success');
            setTimeout(() => location.reload(), 1500);
        } else {
            showNotification('Error', data.error || 'Failed to escalate report', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Error', 'Failed to escalate report', 'error');
    });
}

// Filter reports
function filterReports() {
    const statusFilter = document.getElementById('statusFilter').value;
    const reasonFilter = document.getElementById('reasonFilter').value;
    const reportCards = document.querySelectorAll('.report-card');
    
    let visibleCount = 0;
    
    reportCards.forEach(card => {
        const cardStatus = card.getAttribute('data-status');
        const cardReason = card.getAttribute('data-reason');
        
        const statusMatch = statusFilter === 'all' || cardStatus === statusFilter;
        const reasonMatch = reasonFilter === 'all' || cardReason === reasonFilter;
        
        if (statusMatch && reasonMatch) {
            card.style.display = 'block';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });
    
    // Show/hide no reports message
    const noReportsDiv = document.querySelector('.no-reports');
    if (visibleCount === 0 && !noReportsDiv) {
        const reportsList = document.querySelector('.reports-list');
        reportsList.innerHTML = `
            <div class="no-reports">
                <i class="fas fa-filter"></i>
                <h2>No Reports Match Filters</h2>
                <p>Try adjusting your filter settings.</p>
            </div>
        `;
    }
}

// Show notification
function showNotification(title, message, type) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-header">
            <strong>${title}</strong>
            <button onclick="this.parentElement.parentElement.remove()">Ã—</button>
        </div>
        <div class="notification-body">${message}</div>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Calculate and display statistics
function updateStats() {
    const reportCards = document.querySelectorAll('.report-card');
    let pendingCount = 0;
    let resolvedCount = 0;
    
    reportCards.forEach(card => {
        const status = card.getAttribute('data-status');
        if (status === 'pending' || status === 'escalated') {
            pendingCount++;
        } else if (status === 'resolved') {
            resolvedCount++;
        }
    });
    
    // Update stat numbers if elements exist
    const pendingStat = document.querySelector('.stat-card.pending .stat-number');
    const resolvedStat = document.querySelector('.stat-card.resolved .stat-number');
    
    if (pendingStat) pendingStat.textContent = pendingCount;
    if (resolvedStat) resolvedStat.textContent = resolvedCount;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    updateStats();
    
    // Set default filter to pending
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        statusFilter.value = 'pending';
        filterReports();
    }
});

// Add notification styles dynamically
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
        display: flex;
        align-items: center;
        justify-content: center;
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