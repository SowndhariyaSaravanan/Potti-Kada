
import {
    
    handleLogout
} from "./services/auth-service.js";

import {
    getActiveProducts,
    getProductCategories
} from "./services/product-service.js";

import {
    getCart,
    addToCart,
    updateCartItemQuantity,
    removeFromCart
} from "./services/cart-service.js";

const $ = id => document.getElementById(id);

const productGrid = $("productGrid");
const searchInput = $("searchInput");
const categoryFilter = $("categoryFilter");
const productMessage = $("productMessage");
const cartItems = $("cartItems");
const cartMessage = $("cartMessage");

const PAGE_SIZE = 6;

let products = [];
let cart = [];
let currentPage = 1;

function currency(value) {
    return Number(value || 0).toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    });
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function safeImageUrl(value) {
    if (!value) return "../../assets/css/images/placeholder.png";

    try {
        const url = new URL(value, window.location.href);

        if (url.protocol === "http:" || url.protocol === "https:") {
            return escapeHTML(url.href);
        }
    } catch {
        // Use the local placeholder for invalid image URLs.
    }

    return "../../assets/css/images/placeholder.png";
}

function showProductMessage(message, isError = false) {
    productMessage.textContent = message;
    productMessage.classList.toggle("error", isError);
}

function showCartMessage(message, isError = false) {
    cartMessage.textContent = message;
    cartMessage.classList.toggle("error", isError);
}

function getFilteredProducts() {
    const search = searchInput.value.trim().toLowerCase();
    const category = categoryFilter.value;

    return products.filter(product => {
        const matchesSearch =
            product.title.toLowerCase().includes(search) ||
            product.description.toLowerCase().includes(search) ||
            product.id.toLowerCase().includes(search);

        const matchesCategory =
            !category || product.categoryId === category;

        return matchesSearch && matchesCategory;
    });
}

function renderProducts() {
    const filtered = getFilteredProducts();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

    currentPage = Math.min(currentPage, totalPages);

    const start = (currentPage - 1) * PAGE_SIZE;
    const visibleProducts = filtered.slice(start, start + PAGE_SIZE);

    productGrid.replaceChildren();

    if (visibleProducts.length === 0) {
        productGrid.innerHTML =
            `<p class="customer-empty">No products found.</p>`;
    } else {
        productGrid.innerHTML = visibleProducts.map(product => {
            const image = safeImageUrl(product.imageUrl);
            const stock = Number(product.quantity || 0);
            const available = stock > 0;

            return `
                <article class="customer-product-card">
                    <img
                        class="customer-product-image"
                        src="${image}"
                        alt="${escapeHTML(product.title)}"
                    >

                    <div class="customer-product-content">
                        <span class="customer-product-category">
                            ${escapeHTML(product.categoryId || "General")}
                        </span>

                        <h3>${escapeHTML(product.title)}</h3>

                        <p class="customer-product-description">
                            ${escapeHTML(product.description)}
                        </p>

                        <details class="customer-product-details">
                            <summary>View details</summary>
                            <p>Product ID: ${escapeHTML(product.id)}</p>
                            <p>Category: ${escapeHTML(product.categoryId)}</p>
                            <p>Available stock: ${stock}</p>
                        </details>

                        <div class="customer-product-bottom">
                            <strong>${currency(product.price)}</strong>
                            <span class="${available ? "in-stock" : "out-stock"}">
                                ${available ? `${stock} in stock` : "Out of stock"}
                            </span>
                        </div>

                        <div class="customer-add-controls">
                            <input
                                type="number"
                                min="1"
                                max="${stock}"
                                value="1"
                                class="product-quantity"
                                aria-label="Quantity for ${escapeHTML(product.title)}"
                                ${!available ? "disabled" : ""}
                            >

                            <button
                                class="customer-add-button"
                                data-product-id="${escapeHTML(product.id)}"
                                ${!available ? "disabled" : ""}
                            >
                                Add to Cart
                            </button>
                        </div>
                    </div>
                </article>
            `;
        }).join("");

        productGrid.querySelectorAll(".customer-product-image")
            .forEach(imageElement => {
                imageElement.addEventListener("error", () => {
                    imageElement.src =
                        "../../assets/css/images/placeholder.png";
                }, { once: true });
            });
    }

    $("pageInfo").textContent =
        `Page ${currentPage} of ${totalPages}`;

    $("previousPage").disabled = currentPage <= 1;
    $("nextPage").disabled = currentPage >= totalPages;
}

async function loadCategories() {
    const categories = await getProductCategories();

    categoryFilter.innerHTML =
        `<option value="">All Categories</option>`;

    categories.forEach(category => {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        categoryFilter.appendChild(option);
    });
}

async function loadProducts() {
    try {
        showProductMessage("Loading products...");

        products = await getActiveProducts();

        await loadCategories();

        currentPage = 1;
        renderProducts();

        showProductMessage(
            `${products.length} active products available.`
        );
    } catch (error) {
        showProductMessage(error.message, true);
    }
}

function renderCart() {
    cartItems.replaceChildren();

    const totalQuantity = cart.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0
    );

    const totalAmount = cart.reduce(
        (sum, item) => sum + Number(item.price) * Number(item.quantity),
        0
    );

    $("cartCount").textContent = totalQuantity;
    $("cartTotal").textContent = currency(totalAmount);

    if (cart.length === 0) {
        cartItems.innerHTML = `
            <tr>
                <td colspan="5" class="customer-empty">
                    Your cart is empty.
                </td>
            </tr>
        `;
        return;
    }

    cartItems.innerHTML = cart.map(item => `
        <tr>
            <td>${escapeHTML(item.title)}</td>
            <td>${currency(item.price)}</td>
            <td>
                <input
                    type="number"
                    min="1"
                    value="${Number(item.quantity)}"
                    class="cart-quantity-input"
                    data-product-id="${escapeHTML(item.productId)}"
                >
            </td>
            <td>
                ${currency(Number(item.price) * Number(item.quantity))}
            </td>
            <td>
                <button
                    class="customer-remove-button"
                    data-remove-id="${escapeHTML(item.productId)}"
                >
                    Remove
                </button>
            </td>
        </tr>
    `).join("");
}

async function refreshCart() {
    try {
        cart = await getCart();
        renderCart();
    } catch (error) {
        showCartMessage(error.message, true);
    }
}

async function handleAddToCart(button) {
    const productId = button.dataset.productId;
    const product = products.find(item => item.id === productId);

    if (!product) return;

    const card = button.closest(".customer-product-card");
    const quantityInput = card.querySelector(".product-quantity");
    const quantity = Number(quantityInput.value);

    if (!Number.isInteger(quantity) || quantity < 1) {
        showProductMessage("Enter a valid quantity.", true);
        return;
    }

    if (quantity > product.quantity) {
        showProductMessage(
            `Only ${product.quantity} units are available.`,
            true
        );
        return;
    }

    try {
        button.disabled = true;
        button.textContent = "Adding...";

        cart = await addToCart(product, quantity);

        renderCart();
        showProductMessage(`${product.title} added to your cart.`);

    } catch (error) {
        showProductMessage(error.message, true);
    } finally {
        button.disabled = false;
        button.textContent = "Add to Cart";
    }
}

productGrid.addEventListener("click", async event => {
    const button = event.target.closest("[data-product-id]");

    if (button) {
        await handleAddToCart(button);
    }
});

cartItems.addEventListener("change", async event => {
    const input = event.target.closest(".cart-quantity-input");

    if (!input) return;

    const productId = input.dataset.productId;
    const quantity = Number(input.value);

    try {
        await updateCartItemQuantity(productId, quantity);
        await refreshCart();
        showCartMessage("Cart quantity updated.");
    } catch (error) {
        showCartMessage(error.message, true);
        await refreshCart();
    }
});

cartItems.addEventListener("click", async event => {
    const button = event.target.closest("[data-remove-id]");

    if (!button) return;

    try {
        await removeFromCart(button.dataset.removeId);
        await refreshCart();
        showCartMessage("Item removed from cart.");
    } catch (error) {
        showCartMessage(error.message, true);
    }
});

searchInput.addEventListener("input", () => {
    currentPage = 1;
    renderProducts();
});

categoryFilter.addEventListener("change", () => {
    currentPage = 1;
    renderProducts();
});

$("clearFilters").addEventListener("click", () => {
    searchInput.value = "";
    categoryFilter.value = "";
    currentPage = 1;
    renderProducts();
    showProductMessage("Filters cleared.");
});

$("previousPage").addEventListener("click", () => {
    if (currentPage > 1) {
        currentPage--;
        renderProducts();
    }
});

$("nextPage").addEventListener("click", () => {
    const totalPages = Math.ceil(
        getFilteredProducts().length / PAGE_SIZE
    );

    if (currentPage < totalPages) {
        currentPage++;
        renderProducts();
    }
});

$("cartToggle").addEventListener("click", () => {
    $("cartSection").classList.add("cart-visible");
    $("cartSection").scrollIntoView({ behavior: "smooth" });
});

$("closeCart").addEventListener("click", () => {
    $("cartSection").classList.remove("cart-visible");
});

$("logoutButton").addEventListener("click", () => {
    handleLogout("../../index.html");
});

async function initialize() {
    try {
        // No login check — guests can browse and add products to cart.
        await Promise.all([
            loadProducts(),
            refreshCart()
        ]);
    } catch (error) {
        showProductMessage(error.message, true);
    }
}

initialize();

initialize();
