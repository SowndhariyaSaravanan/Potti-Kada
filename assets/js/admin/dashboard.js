import {
    getAllProducts,
    createProduct,
    updateProduct,
    setProductActive,
    deleteProduct
} from "../services/inventory-service.js";

import { logoutUser } from "../services/auth-service.js";

// DOM elements
const productTableBody = document.getElementById("productTableBody");
const categoryFilter = document.getElementById("categoryFilter");
const previousPageBtn = document.getElementById("previousPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const pageInfo = document.getElementById("pageInfo");
const message = document.getElementById("message");

// Dashboard state
let allProducts = [];
let filteredProducts = [];
let currentPage = 1;

const pageSize = 5;

// Load products from Firestore
async function loadProducts() {
    try {
        message.textContent = "Loading products...";

        allProducts = await getAllProducts();

        populateCategoryFilter();
        applyFilters();

        message.textContent = `${allProducts.length} products loaded.`;

    } catch (error) {
        console.error("Failed to load products:", error);
        message.textContent = error.message;
    }
}

// Populate category dropdown dynamically
function populateCategoryFilter() {
    const categories = [
        ...new Set(allProducts.map(product => product.categoryId))
    ];

    categoryFilter.innerHTML =
        '<option value="">All Categories</option>';

    categories.forEach(categoryId => {
        const option = document.createElement("option");

        option.value = categoryId;
        option.textContent = categoryId;

        categoryFilter.appendChild(option);
    });
}

// Apply selected category filter
function applyFilters() {
    const selectedCategory = categoryFilter.value;

    filteredProducts = selectedCategory
        ? allProducts.filter(
            product => product.categoryId === selectedCategory
        )
        : [...allProducts];

    currentPage = 1;
    renderProducts();
}


function renderProducts() {
    productTableBody.innerHTML = "";

    const startIndex = (currentPage - 1) * pageSize;

    const currentProducts = filteredProducts.slice(
        startIndex,
        startIndex + pageSize
    );

    if (currentProducts.length === 0) {
        productTableBody.innerHTML = `
            <tr><td colspan="8">No products found.</td></tr>
        `;
    }

    currentProducts.forEach(product => {
        const row = document.createElement("tr");

        // Product ID
        const idCell = document.createElement("td");
        idCell.textContent = product.id;
        row.appendChild(idCell);

        // Product Image
        const imageCell = document.createElement("td");
        const image = document.createElement("img");

        image.width = 60;
        image.height = 60;
        image.alt = `${product.title} image`;
        image.style.objectFit = "contain";

        image.src = product.imageUrl || "../../assets/images/placeholder.png";

        image.onerror = () => {
            image.onerror = null;
            image.src = "../../assets/images/placeholder.png";
        };

        imageCell.appendChild(image);
        row.appendChild(imageCell);

        // Remaining product details
        const values = [
            product.title,
            product.categoryId,
            product.quantity,
            `₹${product.price.toFixed(2)}`,
            product.isActive ? "Active" : "Inactive"
        ];

        values.forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
        });

        // Actions
        const actionsCell = document.createElement("td");

        actionsCell.innerHTML = `
            <button data-action="edit">Edit</button>
            <button data-action="toggle">
                ${product.isActive ? "Deactivate" : "Activate"}
            </button>
            <button data-action="delete">Delete</button>
        `;

        actionsCell.querySelectorAll("button").forEach(button => {
            button.dataset.id = product.id;
        });

        row.appendChild(actionsCell);
        productTableBody.appendChild(row);
    });

    updatePagination();
}


// Update pagination controls
function updatePagination() {
    const totalPages = Math.ceil(filteredProducts.length / pageSize);

    pageInfo.textContent =
        `Page ${currentPage} of ${totalPages || 1}`;

    previousPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled =
        currentPage >= totalPages;
}

// Event listeners
categoryFilter.addEventListener("change", applyFilters);

previousPageBtn.addEventListener("click", () => {
    if (currentPage > 1) {
        currentPage--;
        renderProducts();
    }
});

nextPageBtn.addEventListener("click", () => {
    const totalPages = Math.ceil(filteredProducts.length / pageSize);

    if (currentPage < totalPages) {
        currentPage++;
        renderProducts();
    }
});


const productFormContainer =
    document.getElementById("productFormContainer");

const productForm =
    document.getElementById("productForm");

const addProductBtn =
    document.getElementById("addProductBtn");

const cancelFormBtn =
    document.getElementById("cancelFormBtn");

const formTitle =
    document.getElementById("formTitle");

let editingProductId = null;

// Open Add Product form
addProductBtn.addEventListener("click", () => {
    editingProductId = null;

    productForm.reset();

    document.getElementById("productId").readOnly = false;

    formTitle.textContent = "Add Product";
    productFormContainer.hidden = false;
});

// Close form
cancelFormBtn.addEventListener("click", () => {
    productFormContainer.hidden = true;
    productForm.reset();
    editingProductId = null;
});

// Save new or updated product
productForm.addEventListener("submit", async event => {
    event.preventDefault();

    const product = {
        id: document.getElementById("productId").value.trim(),
        title: document.getElementById("productTitle").value.trim(),
        categoryId: document.getElementById("productCategory").value.trim(),
        description: document.getElementById("productDescription").value.trim(),
        quantity: Number(document.getElementById("productQuantity").value),
        price: Number(document.getElementById("productPrice").value),
        imageUrl: document.getElementById("productImage").value.trim()
    };

    try {
        message.textContent = "Saving product...";

        if (editingProductId) {
            const { id, ...updatedData } = product;

            // The service currently requires non-empty strings for
            // string fields, so don't send an empty image URL.
            if (!updatedData.imageUrl) {
                delete updatedData.imageUrl;
            }

            await updateProduct(editingProductId, updatedData);

            message.textContent = "Product updated successfully.";
        } else {
            await createProduct(product);

            message.textContent = "Product created successfully.";
        }

        productForm.reset();
        productFormContainer.hidden = true;
        editingProductId = null;

        await loadProducts();

    } catch (error) {
        console.error(error);
        message.textContent = error.message;
    }
});

// Handle Edit, Activate/Deactivate and Delete
productTableBody.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const productId = button.dataset.id;
    const action = button.dataset.action;

    const product = allProducts.find(item => item.id === productId);

    if (!product) return;

    try {
        if (action === "edit") {
            editingProductId = productId;

            document.getElementById("productId").value = product.id;
            document.getElementById("productId").readOnly = true;

            document.getElementById("productTitle").value = product.title;
            document.getElementById("productCategory").value = product.categoryId;
            document.getElementById("productDescription").value = product.description;
            document.getElementById("productQuantity").value = product.quantity;
            document.getElementById("productPrice").value = product.price;
            document.getElementById("productImage").value = product.imageUrl || "";

            formTitle.textContent = "Edit Product";
            productFormContainer.hidden = false;

        } else if (action === "toggle") {
            const newStatus = !product.isActive;

            const confirmation = confirm(
                `Are you sure you want to ${newStatus ? "activate" : "deactivate"} ${product.title}?`
            );

            if (!confirmation) return;

            await setProductActive(productId, newStatus);

            message.textContent = "Product status updated successfully.";

            await loadProducts();

        } else if (action === "delete") {
            const confirmation = confirm(
                `Are you sure you want to permanently delete ${product.title}?`
            );

            if (!confirmation) return;

            await deleteProduct(productId);

            message.textContent = "Product deleted successfully.";

            await loadProducts();
        }

    } catch (error) {
        console.error(error);
        message.textContent = error.message;
    }
});
// Admin logout
const logoutBtn = document.getElementById("logoutBtn");

logoutBtn.addEventListener("click", async () => {
    try {
        logoutBtn.disabled = true;
        logoutBtn.textContent = "Logging out...";

        await logoutUser();

        window.location.href = "../login.html";

    } catch (error) {
        console.error("Logout failed:", error);

        message.textContent = "Unable to log out. Please try again.";

        logoutBtn.disabled = false;
        logoutBtn.textContent = "Logout";
    }
});
// Initialize dashboard
loadProducts();