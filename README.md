# SecureVault: Encrypted Document Management System

SecureVault is a robust and secure document management system designed to handle sensitive files with end-to-end encryption. It provides a seamless interface for managing, uploading, and securely sharing documents with fine-grained access control.

## 🚀 Features

- **Secure Document Storage:** All documents are encrypted before being stored.
- **Authentication & Authorization:** Secure user authentication with role-based access control (e.g., Doctor, Patient, Chemist).
- **Audit Logging:** Comprehensive tracking of all actions performed within the vault for security and compliance.
- **Modern UI:** Responsive and modern user interface built with React and Vite.
- **Scalable Backend:** High-performance backend API built with FastAPI.
- **Supabase Integration:** Leverages Supabase for database management, user authentication, and secure storage.

## 🛠️ Tech Stack

- **Frontend:** React, Vite, TailwindCSS (or Custom CSS), Supabase JS Client
- **Backend:** Python, FastAPI, Requests, python-dotenv
- **Database & Storage:** Supabase (PostgreSQL, Storage Buckets)

## 🏗️ Getting Started

### Prerequisites

- Node.js (v16+)
- Python 3.9+
- A Supabase Project

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd SecureVault
```

### 2. Backend Setup

```bash
cd backend

# Create a virtual environment (optional but recommended)
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
```
Edit the `backend/.env` file and add your Supabase URL and Service Role Key:
```env
SUPABASE_URL="https://your-supabase-project-url.supabase.co"
SUPABASE_KEY="your-supabase-service-role-key"
```

Start the backend server:
```bash
uvicorn main:app --reload
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
```
Edit the `frontend/.env` file and add your Supabase URL and Anon Key:
```env
VITE_SUPABASE_URL="https://your-supabase-project-url.supabase.co"
VITE_SUPABASE_ANON_KEY="your-supabase-anon-key"
```

Start the frontend development server:
```bash
npm run dev
```

## 🔐 Security Considerations

- **Credentials:** Never commit your `.env` files. They contain sensitive keys that should remain private.
- **Encryption:** Files are encrypted at rest. Always ensure you are using HTTPS to protect data in transit.

## 📄 License

This project is licensed under the MIT License.
