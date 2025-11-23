// ============================================
// MANAGER REPORTS DASHBOARD JAVASCRIPT
// ============================================

// Handle report action
function handleReport(reportId, action) {
    const actionMessages = {
        'hide_post': 'Hide this post',
        'delete_post': 'Delete this post',
        'warn_user': 'Warn the user',
        'restrict_user': 'Restrict user for 48 hours',
        'dismiss': 'Dismiss this report'
    };
    
    const notes = prompt(`Enter notes for action: ${actionMessages[action]}`);
    if (notes === null) return; // User cancelled
    
    if (!notes.trim()) {
        alert('Please provide notes for this action');
        return;
    }
    
    // Show loading state
    const originalText = event.target.innerHTML;
    event.target.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    event.target.disabled = true;
    
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
            event.target.innerHTML = originalText;
            event.target.disabled = false;
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Error', 'Failed to handle report', 'error');
        event.target.innerHTML = originalText;
        event.target.disabled = false;
    });
}

// Escalate report to admin
function escalateReport(reportId) {
    const reason = prompt('Why are you escalating this report to admin?');
    if (reason === null) return; // User cancelled
    
    if (!reason.trim()) {
        alert('Please provide a reason for escalation');
        return;
    }
    
    // Show loading state
    const originalText = event.target.innerHTML;
    event.target.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Escalating...';
    event.target.disabled = true;
    
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
            event.target.innerHTML = originalText;
            event.target.disabled = false;
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Error', 'Failed to escalate report', 'error');
        event.target.innerHTML = originalText;
        event.target.disabled = false;
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
            <button onclick="this.parentElement.parentElement.remove()">×</button>
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