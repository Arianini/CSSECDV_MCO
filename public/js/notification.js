// Custom Notification System - FIXED VERSION
class NotificationSystem {
    constructor() {
        this.createOverlay();
        this.currentResolve = null;
    }

    createOverlay() {
        if (!document.getElementById('notification-overlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'notification-overlay';
            overlay.className = 'notification-overlay';
            document.body.appendChild(overlay);
        }
    }

    showNotification(options) {
        const overlay = document.getElementById('notification-overlay');
        const {
            type = 'info',
            title = 'Notification',
            message = '',
            buttonText = 'Got it',
            onClose = null
        } = options;

        const iconMap = {
            success: '✔',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };

        overlay.innerHTML = '';
        
        const modal = document.createElement('div');
        modal.className = 'notification-modal';
        modal.innerHTML = `
            <div class="notification-icon ${type}">
                ${iconMap[type] || iconMap.info}
            </div>
            <div class="notification-title">${title}</div>
            <div class="notification-message">${message}</div>
            <button class="notification-button ${type === 'error' ? 'error-btn' : ''}">${buttonText}</button>
        `;

        overlay.appendChild(modal);
        overlay.classList.add('active');

        const button = modal.querySelector('.notification-button');
        const closeHandler = () => {
            overlay.classList.remove('active');
            if (onClose) onClose();
        };
        
        button.addEventListener('click', closeHandler);
        
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeHandler();
            }
        });
    }

    showConfirm(options) {
        console.log('🟦 showConfirm called with options:', options);
        return new Promise((resolve) => {
            const overlay = document.getElementById('notification-overlay');
            if (!overlay) {
                console.error('❌ Overlay not found!');
                resolve(false);
                return;
            }
            
            const {
                title = 'Confirm',
                message = 'Are you sure?',
                yesText = 'Yes',
                noText = 'No'
            } = options;

            const modal = document.createElement('div');
            modal.className = 'confirm-dialog';
            modal.innerHTML = `
                <div class="confirm-icon">⚠</div>
                <div class="confirm-title">${title}</div>
                <div class="confirm-message">${message}</div>
                <div class="confirm-buttons">
                    <button class="confirm-btn no">${noText}</button>
                    <button class="confirm-btn yes">${yesText}</button>
                </div>
            `;

            overlay.innerHTML = '';
            overlay.appendChild(modal);
            overlay.classList.add('active');
            
            console.log('✅ Modal added to DOM and made active');

            const yesBtn = modal.querySelector('.confirm-btn.yes');
            const noBtn = modal.querySelector('.confirm-btn.no');

            if (!yesBtn || !noBtn) {
                console.error('❌ Buttons not found!');
                resolve(false);
                return;
            }

            yesBtn.onclick = function(e) {
                console.log('✅ YES clicked');
                e.stopPropagation();
                overlay.classList.remove('active');
                resolve(true);
            };

            noBtn.onclick = function(e) {
                console.log('❌ NO clicked');
                e.stopPropagation();
                overlay.classList.remove('active');
                resolve(false);
            };

            // Close on overlay click (defaults to No)
            overlay.onclick = function(e) {
                if (e.target === overlay) {
                    console.log('❌ Clicked outside (treated as NO)');
                    overlay.classList.remove('active');
                    resolve(false);
                }
            };
        });
    }
}

// Initialize the notification system
const notify = new NotificationSystem();

// Helper functions for easy use
function showSuccess(message, title = 'Success', onClose = null) {
    notify.showNotification({
        type: 'success',
        title: title,
        message: message,
        buttonText: 'Got it',
        onClose: onClose
    });
}

function showError(message, title = "That didn't work") {
    notify.showNotification({
        type: 'error',
        title: title,
        message: message,
        buttonText: 'Got it'
    });
}

function showWarning(message, title = 'Warning') {
    notify.showNotification({
        type: 'warning',
        title: title,
        message: message,
        buttonText: 'Got it'
    });
}

function showInfo(message, title = 'Info') {
    notify.showNotification({
        type: 'info',
        title: title,
        message: message,
        buttonText: 'Got it'
    });
}

async function showConfirm(message, title = 'Confirm Action') {
    console.log('🔵 showConfirm called with:', { message, title });
    const result = await notify.showConfirm({
        title: title,
        message: message,
        yesText: 'Yes',
        noText: 'Cancel'
    });
    console.log('🔵 showConfirm returning:', result);
    return result;
}

console.log('✅ Notification system loaded');
