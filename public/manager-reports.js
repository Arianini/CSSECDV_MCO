// ============================================
// MANAGER REPORTS DASHBOARD JAVASCRIPT
// ============================================

console.log('Manager Reports JS loaded');

// Global variables for modal state
let currentReportId = null;
let currentAction = null;

// View full post in modal
function viewFullPost(postId, username, caption, imageUrl, postTag, createdAt) {
    console.log('viewFullPost called', { postId, username, caption, imageUrl, postTag, createdAt });
    
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
    if (imageUrl && imageUrl !== 'undefined' && imageUrl !== 'null') {
        modalImage.src = imageUrl;
        modalImageSection.style.display = 'block';
    } else {
        modalImageSection.style.display = 'none';
    }
    
    // Handle tag
    if (postTag && postTag !== 'undefined' && postTag !== 'null') {
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
    console.log('closePostModal called');
    const modal = document.getElementById('postViewModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Show custom action modal
function showActionModal(reportId, action) {
    console.log('showActionModal called', { reportId, action });
    
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
        const notesField = document.getElementById('actionNotes');
        if (notesField) {
            notesField.focus();
        }
    }, 100);
}

// Close action modal
function closeActionModal() {
    console.log('closeActionModal called');
    const modal = document.querySelector('.custom-modal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = 'auto';
    }
    currentReportId = null;
    currentAction = null;
}

// Confirm action
async function confirmAction() {
    console.log('confirmAction called');
    const notes = document.getElementById('actionNotes').value.trim();
    
    if (!notes) {
        showNotification('Error', 'Please provide notes for this action', 'error');
        return;
    }
    
    closeActionModal();
    await executeAction(currentReportId, currentAction, notes);
}

// Execute the action
async function executeAction(reportId, action, notes) {
    console.log('executeAction called', { reportId, action, notes });
    showNotification('Processing...', 'Please wait', 'info');
    
    try {
        const url = `/manager/reports/${reportId}/handle`;
        console.log('Fetching:', url);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action, notes })
        });
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error response:', errorText);
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Response data:', data);
        
        if (data.success) {
            showNotification('Success!', data.message || 'Action completed successfully', 'success');
            setTimeout(() => location.reload(), 1500);
        } else {
            showNotification('Error', data.error || 'Failed to handle report', 'error');
        }
    } catch (error) {
        console.error('Error in executeAction:', error);
        showNotification('Error', 'Failed to handle report: ' + error.message, 'error');
    }
}

// Handle report action (wrapper function)
function handleReport(reportId, action) {
    console.log('handleReport called', { reportId, action });
    showActionModal(reportId, action);
}

// Escalate report to admin
function escalateReport(reportId) {
    console.log('escalateReport called', { reportId });
    
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
        const reasonField = document.getElementById('escalateReason');
        if (reasonField) {
            reasonField.focus();
        }
    }, 100);
}

// Close escalate modal
function closeEscalateModal() {
    console.log('closeEscalateModal called');
    const modal = document.querySelector('.custom-modal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = 'auto';
    }
}

// Confirm escalation
async function confirmEscalate(reportId) {
    console.log('confirmEscalate called', { reportId });
    const reason = document.getElementById('escalateReason').value.trim();
    
    if (!reason) {
        showNotification('Error', 'Please provide a reason for escalation', 'error');
        return;
    }
    
    closeEscalateModal();
    showNotification('Processing...', 'Escalating report', 'info');
    
    try {
        const url = `/manager/reports/${reportId}/escalate`;
        console.log('Fetching:', url);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason })
        });
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error response:', errorText);
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Response data:', data);
        
        if (data.success) {
            showNotification('Success!', 'Report escalated to admin', 'success');
            setTimeout(() => location.reload(), 1500);
        } else {
            showNotification('Error', data.error || 'Failed to escalate report', 'error');
        }
    } catch (error) {
        console.error('Error in confirmEscalate:', error);
        showNotification('Error', 'Failed to escalate report: ' + error.message, 'error');
    }
}

// Filter reports
function filterReports() {
    console.log('filterReports called');
    const statusFilter = document.getElementById('statusFilter');
    const reasonFilter = document.getElementById('reasonFilter');
    
    if (!statusFilter || !reasonFilter) {
        console.error('Filter elements not found');
        return;
    }
    
    const statusValue = statusFilter.value;
    const reasonValue = reasonFilter.value;
    
    console.log('Filtering by:', { statusValue, reasonValue });
    
    const reportCards = document.querySelectorAll('.report-card');
    let visibleCount = 0;
    
    reportCards.forEach(card => {
        const cardStatus = card.getAttribute('data-status');
        const cardReason = card.getAttribute('data-reason');
        
        const statusMatch = statusValue === 'all' || cardStatus === statusValue;
        const reasonMatch = reasonValue === 'all' || cardReason === reasonValue;
        
        if (statusMatch && reasonMatch) {
            card.style.display = 'block';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });
    
    console.log('Visible reports:', visibleCount);
    
    // Show/hide no reports message
    const reportsList = document.querySelector('.reports-list');
    const noReportsDiv = document.querySelector('.no-reports');
    
    if (visibleCount === 0) {
        if (!noReportsDiv) {
            const filterMessage = document.createElement('div');
            filterMessage.className = 'no-reports';
            filterMessage.innerHTML = `
                <i class="fas fa-filter"></i>
                <h2>No Reports Match Filters</h2>
                <p>Try adjusting your filter settings.</p>
            `;
            reportsList.appendChild(filterMessage);
        }
    } else {
        if (noReportsDiv && reportCards.length > 0) {
            noReportsDiv.remove();
        }
    }
}

// Show notification
function showNotification(title, message, type) {
    console.log('showNotification called', { title, message, type });
    
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(n => n.remove());
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-header">
            <strong>${title}</strong>
            <button onclick="this.parentElement.parentElement.remove()">&times;</button>
        </div>
        <div class="notification-body">${message}</div>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds (except for info messages)
    if (type !== 'info') {
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }
}

// Calculate and display statistics
function updateStats() {
    console.log('updateStats called');
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
    
    console.log('Stats:', { pendingCount, resolvedCount });
    
    // Update stat numbers if elements exist
    const pendingStat = document.querySelector('.stat-card.pending .stat-number');
    const resolvedStat = document.querySelector('.stat-card.resolved .stat-number');
    
    if (pendingStat) pendingStat.textContent = pendingCount;
    if (resolvedStat) resolvedStat.textContent = resolvedCount;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');
    updateStats();
    
    // Set default filter to pending
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        statusFilter.value = 'pending';
        filterReports();
    }
});

// Close modals when clicking outside
window.addEventListener('click', (event) => {
    if (event.target.classList.contains('custom-modal-overlay')) {
        closeActionModal();
        closeEscalateModal();
    }
});

// Add notification styles dynamically
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        min-width: 350px;
        background: #1f1f1f;
        border-radius: 8px;
        padding: 15px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.7);
        z-index: 99999;
        animation: slideInRight 0.3s ease-out;
    }
    
    @keyframes slideInRight {
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
    
    .notification-info {
        border-left: 4px solid #2196F3;
    }
    
    .notification-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        color: #fff;
        font-size: 16px;
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
        transition: color 0.3s ease;
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
        line-height: 1.5;
    }
    
    .custom-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .custom-modal-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
    }
    
    .custom-modal-content {
        position: relative;
        background: #1f1f1f;
        padding: 30px;
        border-radius: 10px;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 10px 50px rgba(0, 0, 0, 0.9);
        z-index: 10001;
    }
    
    .custom-modal-content h3 {
        color: #fff;
        margin-bottom: 15px;
        font-size: 24px;
    }
    
    .custom-modal-content p {
        color: #ddd;
        margin-bottom: 20px;
    }
    
    .custom-modal-content label {
        display: block;
        color: #007BFF;
        margin-bottom: 10px;
        font-weight: bold;
    }
    
    .custom-modal-content textarea {
        width: 100%;
        padding: 12px;
        background: #2a2a2a;
        border: 1px solid #444;
        color: white;
        border-radius: 5px;
        font-size: 14px;
        font-family: inherit;
        resize: vertical;
        margin-bottom: 20px;
    }
    
    .custom-modal-content textarea:focus {
        outline: none;
        border-color: #007BFF;
        box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.2);
    }
    
    .custom-modal-buttons {
        display: flex;
        gap: 10px;
    }
    
    .btn-cancel,
    .btn-confirm {
        flex: 1;
        padding: 12px 20px;
        border: none;
        border-radius: 5px;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
    }
    
    .btn-cancel {
        background: #6c757d;
        color: white;
    }
    
    .btn-cancel:hover {
        background: #5a6268;
        transform: translateY(-2px);
    }
    
    .btn-confirm {
        background: #007BFF;
        color: white;
    }
    
    .btn-confirm:hover {
        background: #0056b3;
        transform: translateY(-2px);
    }
`;
document.head.appendChild(notificationStyles);

console.log('Manager Reports JS initialization complete');