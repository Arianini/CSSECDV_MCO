/**
 * restriction-checker.js
 * Client-side script to check if the current user has any active restrictions
 * and display appropriate notifications or take actions based on restriction type
 */

(function() {
    'use strict';
    
    // Check for restrictions when page loads
    document.addEventListener('DOMContentLoaded', function() {
        checkRestrictionStatus();
    });
    
    /**
     * Fetch and handle user restriction status
     */
    async function checkRestrictionStatus() {
        try {
            const response = await fetch('/api/check-restriction');
            
            if (!response.ok) {
                console.error('Failed to check restriction status');
                return;
            }
            
            const data = await response.json();
            
            if (data.restricted && data.restriction) {
                handleRestriction(data);
            }
            
        } catch (error) {
            console.error('Error checking restriction status:', error);
        }
    }
    
    /**
     * Handle different types of restrictions
     */
    function handleRestriction(data) {
        const { restriction, message } = data;
        const restrictionType = restriction.restrictionType;
        
        // Show notification based on restriction type
        if (restrictionType === 'permanent_ban') {
            handlePermanentBan(message);
        } else if (restrictionType === 'temporary_ban') {
            handleTemporaryBan(message, restriction);
        } else if (restrictionType === 'warning') {
            handleWarning(message, restriction);
        }
        
        // Disable certain functionality for all restriction types
        disableRestrictedFeatures(restrictionType);
    }
    
    /**
     * Handle permanent ban
     */
    function handlePermanentBan(message) {
        // Show critical notification
        if (window.showNotification) {
            window.showNotification(message, 'error', 0); // 0 = don't auto-dismiss
        } else {
            alert(message);
        }
        
        // Disable all posting functionality
        const createPostBtn = document.getElementById('create-post-btn');
        if (createPostBtn) {
            createPostBtn.style.display = 'none';
        }
        
        // Show a prominent banner
        showRestrictionBanner('PERMANENTLY BANNED', message, 'critical');
    }
    
    /**
     * Handle temporary ban
     */
    function handleTemporaryBan(message, restriction) {
        // Show warning notification
        if (window.showNotification) {
            window.showNotification(message, 'warning', 10000); // Show for 10 seconds
        } else {
            alert(message);
        }
        
        // Calculate time remaining
        const timeRemaining = Math.ceil((new Date(restriction.endDate) - new Date()) / (1000 * 60 * 60));
        const banMessage = `Your account is temporarily restricted for ${timeRemaining} more hour${timeRemaining !== 1 ? 's' : ''}. Reason: ${restriction.reason}`;
        
        // Show a banner
        showRestrictionBanner('TEMPORARILY RESTRICTED', banMessage, 'warning');
        
        // Disable posting functionality
        const createPostBtn = document.getElementById('create-post-btn');
        if (createPostBtn) {
            createPostBtn.disabled = true;
            createPostBtn.style.opacity = '0.5';
            createPostBtn.style.cursor = 'not-allowed';
            createPostBtn.title = 'You are temporarily restricted from posting';
        }
    }
    
    /**
     * Handle warning
     */
    function handleWarning(message, restriction) {
        // Show info notification
        if (window.showNotification) {
            window.showNotification(`Warning: ${restriction.reason}`, 'info', 8000);
        }
        
        // Show a subtle banner
        showRestrictionBanner('WARNING', restriction.reason, 'info');
    }
    
    /**
     * Show a restriction banner at the top of the page
     */
    function showRestrictionBanner(title, message, severity) {
        // Check if banner already exists
        if (document.getElementById('restriction-banner')) {
            return;
        }
        
        const banner = document.createElement('div');
        banner.id = 'restriction-banner';
        banner.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            padding: 15px 20px;
            text-align: center;
            z-index: 9999;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;
        
        // Set colors based on severity
        if (severity === 'critical') {
            banner.style.backgroundColor = '#dc3545';
            banner.style.color = '#fff';
        } else if (severity === 'warning') {
            banner.style.backgroundColor = '#ffc107';
            banner.style.color = '#000';
        } else {
            banner.style.backgroundColor = '#17a2b8';
            banner.style.color = '#fff';
        }
        
        banner.innerHTML = `
            <strong>${title}:</strong> ${message}
            ${severity !== 'critical' ? '<button id="dismiss-restriction-banner" style="margin-left: 15px; padding: 5px 15px; border: none; background: rgba(255,255,255,0.3); cursor: pointer; border-radius: 3px;">Dismiss</button>' : ''}
        `;
        
        document.body.prepend(banner);
        
        // Add dismiss functionality
        if (severity !== 'critical') {
            const dismissBtn = document.getElementById('dismiss-restriction-banner');
            if (dismissBtn) {
                dismissBtn.addEventListener('click', function() {
                    banner.remove();
                });
            }
        }
        
        // Adjust body padding to account for banner
        document.body.style.paddingTop = (banner.offsetHeight + 10) + 'px';
    }
    
    /**
     * Disable features based on restriction type
     */
    function disableRestrictedFeatures(restrictionType) {
        if (restrictionType === 'permanent_ban' || restrictionType === 'temporary_ban') {
            // Disable commenting
            const commentForms = document.querySelectorAll('form[action*="/comment"]');
            commentForms.forEach(form => {
                const textarea = form.querySelector('textarea');
                const submitBtn = form.querySelector('button[type="submit"]');
                
                if (textarea) {
                    textarea.disabled = true;
                    textarea.placeholder = 'You are restricted from commenting';
                }
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.style.opacity = '0.5';
                }
            });
            
            // Disable like/dislike buttons
            const likeButtons = document.querySelectorAll('.like-btn, .dislike-btn');
            likeButtons.forEach(btn => {
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            });
        }
    }
    
})();
