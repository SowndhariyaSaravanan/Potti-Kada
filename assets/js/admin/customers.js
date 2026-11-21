
import {
    getAllCustomers,
    searchCustomers,
    updateCustomerCreditLimit,
    setCustomerActive
} from "../services/customer-service.js";

const customerTableBody = document.getElementById("customerTableBody");
const customerSearch = document.getElementById("customerSearch");
const customerMessage = document.getElementById("customerMessage");
const customerCount = document.getElementById("customerCount");

const previousPageBtn = document.getElementById("previousPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const pageInfo = document.getElementById("pageInfo");

const PAGE_SIZE = 5;

let customers = [];
let currentPage = 1;
let editingCustomerId = null;
let searchTimeout = null;

// Display success and error messages.
function showMessage(message, type = "success") {
    customerMessage.textContent = message;
    customerMessage.className = `status-message ${type}`;
}

// Format Indian currency.
function formatCurrency(amount) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(amount || 0);
}

// Load customers.
async function loadCustomers(searchTerm = "") {
    try {
        customerTableBody.innerHTML = `
            <tr><td colspan="8">Loading customers...</td></tr>
        `;

        customers = searchTerm.trim()
            ? await searchCustomers(searchTerm)
            : await getAllCustomers();

        currentPage = 1;
        editingCustomerId = null;

        customerCount.textContent = customers.length;

        renderCustomers();

    } catch (error) {
        console.error("Customer loading failed:", error);

        customerTableBody.innerHTML = `
            <tr><td colspan="8">Unable to load customers.</td></tr>
        `;

        customerCount.textContent = "0";
        showMessage(error.message, "error");
    }
}

// Create a table cell safely.
function createCell(value, className = "") {
    const cell = document.createElement("td");
    cell.textContent = value;

    if (className) {
        cell.className = className;
    }

    return cell;
}

// Render the customer table.
function renderCustomers() {
    customerTableBody.innerHTML = "";

    const totalPages = Math.ceil(customers.length / PAGE_SIZE);
    const startIndex = (currentPage - 1) * PAGE_SIZE;

    const pageCustomers = customers.slice(
        startIndex,
        startIndex + PAGE_SIZE
    );

    if (pageCustomers.length === 0) {
        customerTableBody.innerHTML = `
            <tr><td colspan="8">No customers found.</td></tr>
        `;
    }

    pageCustomers.forEach(customer => {
        const row = document.createElement("tr");

        row.appendChild(createCell(customer.id));
        row.appendChild(createCell(customer.name || "-"));
        row.appendChild(createCell(customer.email || "-"));
        row.appendChild(createCell(customer.mobile || "-"));

        // Inline credit-limit editor.
        const creditCell = document.createElement("td");

        if (editingCustomerId === customer.id) {
            const editor = document.createElement("div");
            editor.className = "credit-editor";

            const input = document.createElement("input");
            input.type = "number";
            input.min = customer.creditUsed || 0;
            input.step = "0.01";
            input.value = customer.creditLimit ?? 0;
            input.className = "credit-input";
            input.setAttribute("aria-label", "New credit limit");

            const saveButton = document.createElement("button");
            saveButton.textContent = "Save";
            saveButton.className = "save-btn";
            saveButton.addEventListener("click", () => {
                handleCreditLimitSave(customer, input.value);
            });

            const cancelButton = document.createElement("button");
            cancelButton.textContent = "Cancel";
            cancelButton.className = "cancel-btn";
            cancelButton.addEventListener("click", () => {
                editingCustomerId = null;
                renderCustomers();
            });

            editor.append(input, saveButton, cancelButton);
            creditCell.appendChild(editor);

            input.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    handleCreditLimitSave(customer, input.value);
                }

                if (event.key === "Escape") {
                    editingCustomerId = null;
                    renderCustomers();
                }
            });

            setTimeout(() => input.focus(), 0);

        } else {
            creditCell.textContent = formatCurrency(customer.creditLimit);
        }

        row.appendChild(creditCell);

        row.appendChild(
            createCell(formatCurrency(customer.creditUsed))
        );

        row.appendChild(
            createCell(
                customer.isActive ? "Active" : "Inactive",
                customer.isActive ? "customer-active" : "customer-inactive"
            )
        );

        // Actions.
        const actionsCell = document.createElement("td");
        actionsCell.className = "customer-actions";

        const editButton = document.createElement("button");
        editButton.textContent = "Edit Credit";
        editButton.className = "edit-btn";
        editButton.disabled = !customer.isActive;
        editButton.addEventListener("click", () => {
            editingCustomerId = customer.id;
            renderCustomers();
        });

        const statusButton = document.createElement("button");
        statusButton.textContent = customer.isActive
            ? "Deactivate"
            : "Activate";

        statusButton.className = customer.isActive
            ? "delete-btn"
            : "toggle-btn";

        statusButton.addEventListener("click", () => {
            handleCustomerStatus(customer);
        });

        actionsCell.append(editButton, statusButton);
        row.appendChild(actionsCell);

        customerTableBody.appendChild(row);
    });

    pageInfo.textContent = totalPages
        ? `Page ${currentPage} of ${totalPages}`
        : "Page 0 of 0";

    previousPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
}

// Save edited credit limit.
async function handleCreditLimitSave(customer, enteredValue) {
    const value = enteredValue.trim();
    const creditLimit = Number(value);

    if (
        value === "" ||
        !Number.isFinite(creditLimit) ||
        creditLimit < 0
    ) {
        showMessage("Enter a valid non-negative credit limit.", "error");
        return;
    }

    if (creditLimit < (customer.creditUsed || 0)) {
        showMessage(
            "Credit limit cannot be less than current credit usage.",
            "error"
        );
        return;
    }

    try {
        await updateCustomerCreditLimit(customer.id, creditLimit);

        editingCustomerId = null;
        showMessage("Credit limit updated successfully.");

        await loadCustomers(customerSearch.value);

    } catch (error) {
        console.error("Credit update failed:", error);
        showMessage(error.message, "error");
    }
}

// Change customer account status.
async function handleCustomerStatus(customer) {
    const newStatus = !customer.isActive;

    const action = newStatus ? "activate" : "deactivate";

    const confirmed = confirm(
        `Are you sure you want to ${action} ${customer.name}?`
    );

    if (!confirmed) return;

    try {
        await setCustomerActive(customer.id, newStatus);

        showMessage(`Customer ${action}d successfully.`);
        await loadCustomers(customerSearch.value);

    } catch (error) {
        console.error("Customer status update failed:", error);
        showMessage(error.message, "error");
    }
}

// Search with a small debounce to avoid unnecessary API calls.
customerSearch.addEventListener("input", () => {
    clearTimeout(searchTimeout);

    searchTimeout = setTimeout(() => {
        loadCustomers(customerSearch.value);
    }, 300);
});

// Pagination.
previousPageBtn.addEventListener("click", () => {
    if (currentPage > 1) {
        currentPage--;
        editingCustomerId = null;
        renderCustomers();
    }
});

nextPageBtn.addEventListener("click", () => {
    const totalPages = Math.ceil(customers.length / PAGE_SIZE);

    if (currentPage < totalPages) {
        currentPage++;
        editingCustomerId = null;
        renderCustomers();
    }
});

// Initial page load.
loadCustomers();
