document.addEventListener("DOMContentLoaded", () => {
    // --- Theme Toggler ---
    const toggleButton = document.getElementById("toggleTheme");
    const themeIcon = toggleButton.querySelector(".theme-icon");

    const applyTheme = (theme) => {
        if (theme === "dark") {
            document.body.classList.add("dark");
            themeIcon.textContent = "🌞";
        } else {
            document.body.classList.remove("dark");
            themeIcon.textContent = "🌙";
        }
    };

    const savedTheme = localStorage.getItem("theme") || "light";
    applyTheme(savedTheme);

    toggleButton.addEventListener("click", () => {
        const isDark = document.body.classList.contains("dark");
        const newTheme = isDark ? "light" : "dark";
        localStorage.setItem("theme", newTheme);
        
        themeIcon.style.transform = isDark ? 'rotate(90deg)' : 'rotate(-90deg)';
        
        // Add transition class for smooth theme change
        document.body.style.transition = 'background-color 0.3s ease, color 0.3s ease';

        applyTheme(newTheme);

        setTimeout(() => {
            themeIcon.style.transform = 'rotate(0deg)';
            // Remove transition after it's done to prevent affecting other properties
            setTimeout(() => document.body.style.transition = '', 300);
        }, 200);
    });

    // --- Page Transitions ---
    document.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", (e) => {
            const url = new URL(link.href);
            if (url.origin === window.location.origin) {
                e.preventDefault();
                const container = document.querySelector(".page-transition");
                if (container) {
                    container.classList.add("exit");
                    setTimeout(() => {
                        window.location.href = link.href;
                    }, 400);
                }
            }
        });
    });

    // --- Retracement Calculator ---
    const retracementBtn = document.getElementById("calculateRetracement");
    if (retracementBtn) {
        retracementBtn.addEventListener("click", () => {
            const start = parseFloat(document.getElementById("startPrice").value);
            const end = parseFloat(document.getElementById("endPrice").value);
            const table = document.getElementById("retracementTable");

            if (isNaN(start) || isNaN(end)) {
                alert("Enter valid numbers for start and end prices.");
                return;
            }
            
            const diff = end - start;
            const levels = [
                { name: 'Level 1 (1/3)', value: start + diff * (1/3) },
                { name: 'Level 2 (1/2)', value: start + diff * (1/2) },
                { name: 'Level 3 (2/3)', value: start + diff * (2/3) }
            ];
            
            table.innerHTML = `
                <thead>
                    <tr><th>Level</th><th>Value</th></tr>
                </thead>
                <tbody>
                    ${levels.map(l => `<tr><td>${l.name}</td><td>${l.value.toFixed(2)}</td></tr>`).join('')}
                </tbody>
            `;
            table.style.display = 'table';
        });
    }
});
