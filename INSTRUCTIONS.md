# Smart Attendance System - Complete Setup Guide

This guide provides step-by-step instructions to run the AI-powered Face Verification and Attendance Monitoring system.

---

## 🛠️ Prerequisites

1.  **Python 3.10 or higher**: [Download here](https://www.python.org/downloads/)
2.  **Node.js 18.x or higher**: [Download here](https://nodejs.org/)
3.  **MongoDB Atlas**: A cloud database account. [Sign up for free](https://www.mongodb.com/cloud/atlas).

---

## 📂 Step 1: Backend Setup (FastAPI)

1.  **Navigate to the backend folder**:
    ```powershell
    cd attendance_backend
    ```

2.  **Install Python dependencies**:
    ```powershell
    pip install -r requirements.txt
    ```

3.  **Configure Environment Variables**:
    Create a file named `.env` in the `attendance_backend/` directory and paste your MongoDB credentials:
    ```env
    MONGODB_URL=mongodb+srv://<username>:<password>@cluster.mongodb.net/?retryWrites=true&w=majority
    DATABASE_NAME=watt_watch_attendance
    ```

4.  **Run the Backend**:
    ```powershell
    python main.py
    ```
    *Wait until you see "Uvicorn running on http://0.0.0.0:8001".*

---

## 🌐 Step 2: Frontend Setup (Next.js)

1.  **Open a NEW terminal** and navigate to the frontend folder:
    ```powershell
    cd attendance_frontend
    ```

2.  **Install Node dependencies**:
    ```powershell
    npm install
    ```

3.  **Run the Frontend Development Server**:
    ```powershell
    npm run dev
    ```
    *The app will be live at `http://localhost:3000`.*

---

## 🚀 Step 3: Operating the System

1.  **Open your Browser**: Go to `http://localhost:3000`.
2.  **Registration**:
    *   Go to **Face Registration**.
    *   Enter Student ID and Name.
    *   Capture 20 clear face samples.
    *   Click **Submit & Save to MongoDB**.
3.  **Monitoring**:
    *   Go to **Live Monitoring**.
    *   Click **Start Monitor**.
    *   The system will now recognize your face in real-time!

---

## 🔑 Required Credentials & Dependencies

### Dependencies (Installed automatically via scripts):
- **Backend**: FastAPI, PyTorch, FaceNet-PyTorch, MTCNN, Motor (MongoDB), OpenCV.
- **Frontend**: Next.js 14, Tailwind CSS, Framer Motion, Lucide React.

### Credentials:
- **MongoDB Connection String**: You must get this from your MongoDB Atlas dashboard (under Database > Connect > Connect your application).
