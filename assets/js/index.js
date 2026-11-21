
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const homeNavLinks = document.getElementById("homeNavLinks");

// Mobile navigation toggle
mobileMenuBtn?.addEventListener("click", () => {
    const isOpen = homeNavLinks.classList.toggle("show");

    mobileMenuBtn.setAttribute("aria-expanded", isOpen);
    mobileMenuBtn.textContent = isOpen ? "✕" : "☰";
});

// Close mobile menu after clicking a navigation link
homeNavLinks?.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
        homeNavLinks.classList.remove("show");
        mobileMenuBtn.setAttribute("aria-expanded", "false");
        mobileMenuBtn.textContent = "☰";
    });
});

// Automatically update copyright year
const currentYear = document.getElementById("currentYear");

if (currentYear) {
    currentYear.textContent = new Date().getFullYear();
}
