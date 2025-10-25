// menu.js - Reusable menu dropdown and header functionality
document.addEventListener("DOMContentLoaded", function () {
    console.log("🚀 Menu script loaded");
    
    // ===== MENU DROPDOWN =====
    const menuBtn = document.getElementById("menu-btn");
    const menuDropdown = document.getElementById("menu-dropdown");

    if (menuBtn && menuDropdown) {
        menuBtn.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            
            if (menuDropdown.classList.contains('show')) {
                menuDropdown.classList.remove('show');
            } else {
                menuDropdown.classList.add('show');
            }
        });

        document.addEventListener("click", function (event) {
            const isClickInsideMenu = menuDropdown.contains(event.target);
            const isClickOnButton = menuBtn.contains(event.target);
            
            if (!isClickInsideMenu && !isClickOnButton) {
                menuDropdown.classList.remove('show');
            }
        });
        
        console.log("✅ Menu handlers attached");
    }

    // ===== PROFILE BUTTON =====
    const profileBtn = document.getElementById("profile-btn");
    if (profileBtn) {
        profileBtn.addEventListener("click", function() {
            window.location.href = "/profile";
        });
        console.log("✅ Profile button ready");
    }

    // ===== CREATE POST BUTTON =====
    const createPostBtn = document.getElementById("create-post-btn");
    if (createPostBtn) {
        createPostBtn.addEventListener("click", function(e) {
            e.preventDefault(); 
            const modal = document.getElementById('create-post-modal');
            if (modal) {
                modal.style.display = 'flex';
            }
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