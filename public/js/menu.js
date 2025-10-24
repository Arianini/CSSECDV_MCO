// menu.js - Reusable menu dropdown and header functionality
document.addEventListener("DOMContentLoaded", function () {
    console.log("🚀 Menu script loaded");
    
    // ===== MENU DROPDOWN =====
    const menuBtn = document.getElementById("menu-btn");
    const menuDropdown = document.getElementById("menu-dropdown");

    if (menuBtn && menuDropdown) {
        // Click event for menu button
        menuBtn.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            
            console.log("📘 Menu button clicked!");
            
            // Toggle the 'show' class
            if (menuDropdown.classList.contains('show')) {
                menuDropdown.classList.remove('show');
                console.log("❌ Menu closed");
            } else {
                menuDropdown.classList.add('show');
                console.log("✅ Menu opened");
            }
        });

        // Close menu when clicking outside
        document.addEventListener("click", function (event) {
            const isClickInsideMenu = menuDropdown.contains(event.target);
            const isClickOnButton = menuBtn.contains(event.target);
            
            if (!isClickInsideMenu && !isClickOnButton) {
                menuDropdown.classList.remove('show');
            }
        });
        
        console.log("✅ Menu handlers attached successfully");
    } else {
        console.warn("⚠️ Menu elements not found on this page");
    }

    // ===== PROFILE BUTTON =====
    const profileBtn = document.getElementById("profile-btn");
    if (profileBtn) {
        profileBtn.addEventListener("click", function() {
            // Profile route will automatically redirect admins to /admin
            window.location.href = "/profile";
        });
        console.log("✅ Profile button ready");
    }

    // ===== CREATE POST BUTTON =====
    const createPostBtn = document.getElementById("create-post-btn");
    if (createPostBtn) {
        createPostBtn.addEventListener("click", function() {
            window.location.href = "/home"; // Or open a modal
        });
        console.log("✅ Create post button ready");
    }

    // ===== SEARCH FUNCTIONALITY =====
    const searchInput = document.querySelector("#search-input");
    const searchButton = document.querySelector("#search-btn");

    if (searchButton && searchInput) {
        searchButton.addEventListener("click", () => {
            const query = searchInput.value.trim();
            if (!query) return;
            window.location.href = `/search?q=${encodeURIComponent(query)}`;
        });

        searchInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                const query = searchInput.value.trim();
                if (!query) return;
                window.location.href = `/search?q=${encodeURIComponent(query)}`;
            }
        });
        
        console.log("✅ Search ready");
    }
    
    console.log("🎉 All header functionality initialized!");
});