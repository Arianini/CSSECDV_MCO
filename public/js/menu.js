document.addEventListener("DOMContentLoaded", function () {
    console.log("🚀 Menu script loaded");
    
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
});