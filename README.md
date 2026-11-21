# Potti kada – Online Shopping Application

A simple online shopping application with customer and admin functionality.

## Tech Stack
- HTML, CSS, JavaScript
- Firebase Authentication
- Cloud Firestore
- EmailJS
- Postman
- Git & GitHub

## Architecture
```text
Frontend (HTML, CSS, JavaScript)
          |
          +---- Firebase Authentication
          |
          +---- Cloud Firestore
          |
          +---- EmailJS
```

## Features
- Customer registration and login
- Product browsing and cart management
- Guest cart and cart merging
- Cash and credit checkout
- Order history and email confirmations
- Admin inventory and customer management
- Sales and inventory reports

## Database Design

Firestore collections:
- `users` – User profiles, roles and credit details
- `categories` – Product categories
- `products` – Product details and stock
- `carts` – Customer carts with nested items
- `orders` – Order and payment details
- `sales` – Individual sales records

## API Integration

The frontend uses the Firebase JavaScript SDK to communicate directly with Cloud Firestore.

Postman was used to test Firestore REST API requests and populate the database with sample documents.

## Email Integration

EmailJS sends order confirmation emails after successful checkout.

## Setup

1. Clone the repository.
2. Configure Firebase Authentication and Firestore.
3. Configure EmailJS credentials.
4. Run using VS Code Live Server.

## Links
- GitHub: https://github.com/SowndhariyaSaravanan/Potti-Kada
- GitHub Pages: https://sowndhariyasaravanan.github.io/Potti-Kada/